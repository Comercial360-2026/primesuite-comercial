import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { SelectorZona } from '@/components/ui/selector-zona';
import { Aviso } from '@/components/ui/aviso';
import { Icono } from '@/components/ui/iconos';
import { comprimirImagen, TIPOS_FOTO_ADMITIDOS } from '@/lib/comprimir-imagen';
import { leerExif } from '@/lib/exif';
import { formatearBytes } from '@/lib/documentos-visita';
import { listarZonasUsadasEnVisita } from '@/lib/zonas-visita';
import { supabase } from '@/lib/supabase-client';
import { uuid } from '@/lib/uuid';

// Subir fotos y audios que ya están en el móvil (no hechos en el momento). La fecha y el GPS son los de la propia
// foto, nunca la posición actual. Una a una (Safari iOS se queda sin memoria con 30 a la vez).
export interface SubidaGaleria {
  tipo: 'foto' | 'audio';
  archivo: File; // ya comprimido (foto) y con el tipo MIME correcto
  mime: string;
  nombre: string;
  bytes: number; // tamaño del original
  fecha: Date;
  lat?: number;
  lng?: number;
  zona?: string;
}

interface Props {
  visitaId: string;
  zonaInicial?: string;
  zonasExtra?: string[]; // zonas aún solo en este móvil (cola sin sincronizar)
  referencias?: { lat: number; lng: number }[]; // coordenadas de lo ya capturado en la visita
  fechaVisita?: string; // ISO
  onSubir: (s: SubidaGaleria) => Promise<void>; // lanza Error si no se pudo
  onTerminado?: (subidas: number) => void;
  children: (abrir: () => void, deshabilitado?: boolean) => ReactNode;
  deshabilitado?: boolean;
}

interface Item {
  id: string;
  archivo: File;
  tipo: 'foto' | 'audio';
  url?: string;
  fecha: Date;
  fechaDeLaFoto: boolean; // false = solo la de modificación del archivo
  lat?: number;
  lng?: number;
  conUbicacion: boolean;
  lejosKm?: number;
  fechaLejosDias?: number;
  duplicada?: string; // motivo
  incluida: boolean;
  zona: string | null; // null = la del lote
  error?: string;
}

const LOTE = '__lote';
const TOPE_LOTE = 30;
const KM_LEJOS = 2;
const DIAS_LEJOS = 2;
const LIMITE_FOTO_BYTES = 12 * 1024 * 1024;
const LIMITE_AUDIO_BYTES = 30 * 1024 * 1024;
const MIME_AUDIO: Record<string, string> = { m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac' };

const extension = (n: string) => n.split('.').pop()?.toLowerCase() ?? '';
const esFoto = (f: File) => f.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension(f.name));
const mimeAudio = (f: File) =>
  MIME_AUDIO[extension(f.name)] ?? (/m4a|mp4/.test(f.type) ? 'audio/mp4' : /mpeg/.test(f.type) ? 'audio/mpeg' : /aac/.test(f.type) ? 'audio/aac' : /webm/.test(f.type) ? 'audio/webm' : undefined);
const esAudio = (f: File) => f.type.startsWith('audio/') || extension(f.name) in MIME_AUDIO;
const claveArchivo = (nombre: string, bytes: number) => `${nombre}|${bytes}`;

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const mediana = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

const fechaLarga = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export function SubirGaleria({ visitaId, zonaInicial, zonasExtra, referencias, fechaVisita, onSubir, onTerminado, children, deshabilitado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivos, setArchivos] = useState<File[] | null>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,audio/*,.m4a,.mp3,.aac"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const elegidos = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (elegidos.length) setArchivos(elegidos);
        }}
      />
      {children(() => inputRef.current?.click(), deshabilitado)}
      {archivos && (
        <HojaGaleria
          archivos={archivos}
          visitaId={visitaId}
          zonaInicial={zonaInicial}
          zonasExtra={zonasExtra}
          referencias={referencias}
          fechaVisita={fechaVisita}
          onSubir={onSubir}
          onCerrar={() => setArchivos(null)}
          onTerminado={onTerminado}
        />
      )}
    </>
  );
}

function HojaGaleria({
  archivos, visitaId, zonaInicial, zonasExtra, referencias, fechaVisita, onSubir, onCerrar, onTerminado,
}: Omit<Props, 'children' | 'deshabilitado'> & { archivos: File[]; onCerrar: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [rechazados, setRechazados] = useState<string[]>([]);
  const [preparando, setPreparando] = useState(true);
  const [zonaLote, setZonaLote] = useState(zonaInicial ?? '');
  const [fase, setFase] = useState<'editando' | 'subiendo' | 'fin'>('editando');
  const [progreso, setProgreso] = useState(0);
  const [resumen, setResumen] = useState<{ ok: number; fallos: number } | null>(null);
  const urls = useRef<string[]>([]);

  const { data: zonasServidor } = useQuery({
    queryKey: ['zonas-usadas-visita', visitaId],
    queryFn: () => listarZonasUsadasEnVisita(visitaId),
  });
  const zonasConocidas = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of [...(zonasServidor ?? []), ...(zonasExtra ?? []), zonaLote]) if (z.trim()) m.set(z.trim().toLocaleLowerCase('es'), z.trim());
    return [...m.values()];
  }, [zonasServidor, zonasExtra, zonaLote]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Lee fecha/GPS de cada archivo y marca avisos. Una a una.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const lista = archivos.slice(0, TOPE_LOTE);
      const rech: string[] = archivos.length > TOPE_LOTE ? [`Solo caben ${TOPE_LOTE} por vez: las ${archivos.length - TOPE_LOTE} últimas se han dejado fuera. Súbelas en otra tanda.`] : [];
      const ya = new Set<string>();
      // Sin red (o muy lenta) no se comprueba contra lo ya subido: no debe bloquear la hoja.
      const previas = await Promise.race([
        Promise.resolve(supabase.from('captura_libre').select('nombre_original, bytes').eq('visita_id', visitaId).eq('desde_galeria', true))
          .then((r) => r.data)
          .catch(() => null),
        new Promise<null>((r) => setTimeout(() => r(null), 4000)),
      ]);
      for (const p of previas ?? []) if (p.nombre_original && p.bytes != null) ya.add(claveArchivo(p.nombre_original, Number(p.bytes)));
      const nuevos: Item[] = [];
      for (const archivo of lista) {
        if (!vivo) return;
        const foto = esFoto(archivo);
        if (!foto && !(esAudio(archivo) && mimeAudio(archivo))) {
          rech.push(`«${archivo.name}»: ese tipo de archivo no se puede subir (vale foto y audio m4a/mp3). Para un vídeo, pon su enlace en una nota.`);
          continue;
        }
        const exif = foto ? await leerExif(archivo) : {};
        const url = foto ? URL.createObjectURL(archivo) : undefined;
        if (url) urls.current.push(url);
        const clave = claveArchivo(archivo.name, archivo.size);
        let duplicada: string | undefined;
        if (ya.has(clave)) duplicada = 'Ya la subiste a esta visita';
        else if (nuevos.some((n) => claveArchivo(n.archivo.name, n.archivo.size) === clave && n.fecha.getTime() === (exif.fecha ?? new Date(archivo.lastModified)).getTime())) duplicada = 'Repetida en esta selección';
        nuevos.push({
          id: uuid(), archivo, tipo: foto ? 'foto' : 'audio', url,
          fecha: exif.fecha ?? new Date(archivo.lastModified), fechaDeLaFoto: !!exif.fecha,
          lat: exif.lat, lng: exif.lng, conUbicacion: exif.lat !== undefined,
          duplicada, incluida: !duplicada, zona: null,
        });
      }
      // Avisos: ubicación lejos de donde se ha trabajado y fecha lejos de la de la visita.
      const puntos = nuevos.filter((n) => n.lat !== undefined).map((n) => ({ lat: n.lat!, lng: n.lng! }));
      const base = referencias?.length ? referencias : puntos.length >= 3 ? puntos : [];
      const centro = base.length ? { lat: mediana(base.map((b) => b.lat)), lng: mediana(base.map((b) => b.lng)) } : null;
      const ref = fechaVisita ? new Date(fechaVisita).getTime() : null;
      for (const n of nuevos) {
        if (centro && n.lat !== undefined) {
          const d = km(centro, { lat: n.lat, lng: n.lng! });
          if (d > KM_LEJOS) { n.lejosKm = Math.round(d); n.conUbicacion = false; }
        }
        if (ref !== null) {
          const dias = Math.round(Math.abs(n.fecha.getTime() - ref) / 86400000);
          if (dias > DIAS_LEJOS) n.fechaLejosDias = dias;
        }
      }
      if (!vivo) return;
      setItems(nuevos);
      setRechazados(rech);
      setPreparando(false);
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivos]);

  const cambiar = (id: string, c: Partial<Item>) => setItems((v) => v.map((i) => (i.id === id ? { ...i, ...c } : i)));
  const seleccion = items.filter((i) => i.incluida);

  async function subir() {
    setFase('subiendo');
    let ok = 0;
    const idsOk = new Set<string>();
    const errores = new Map<string, string>();
    for (const [n, it] of seleccion.entries()) {
      setProgreso(n + 1);
      try {
        let cuerpo: Blob = it.archivo;
        let mime: string;
        if (it.tipo === 'foto') {
          cuerpo = await comprimirImagen(it.archivo);
          mime = cuerpo.type;
          if (!TIPOS_FOTO_ADMITIDOS.includes(mime)) throw new Error('Formato de imagen no admitido (elige JPG, PNG o WebP).');
          if (cuerpo.size > LIMITE_FOTO_BYTES) throw new Error('Pesa demasiado incluso comprimida.');
        } else {
          mime = mimeAudio(it.archivo)!;
          if (it.archivo.size > LIMITE_AUDIO_BYTES) throw new Error('El audio pesa más de 30 MB.');
        }
        await onSubir({
          tipo: it.tipo,
          archivo: new File([cuerpo], it.archivo.name, { type: mime }),
          mime, nombre: it.archivo.name, bytes: it.archivo.size, fecha: it.fecha,
          lat: it.conUbicacion ? it.lat : undefined, lng: it.conUbicacion ? it.lng : undefined,
          zona: (it.zona ?? zonaLote).trim() || undefined,
        });
        ok++;
        idsOk.add(it.id);
      } catch (e) {
        errores.set(it.id, e instanceof Error ? e.message : 'No se pudo subir.');
      }
    }
    onTerminado?.(ok);
    if (errores.size === 0) { onCerrar(); return; }
    setItems((v) => v.filter((i) => !idsOk.has(i.id)).map((i) => ({ ...i, error: errores.get(i.id) })));
    setResumen({ ok, fallos: errores.size });
    setFase('fin');
  }

  const subiendo = fase === 'subiendo';
  const tituloBoton = subiendo ? `Subiendo ${progreso} de ${seleccion.length}…` : fase === 'fin' ? `Reintentar ${seleccion.length}` : `Subir ${seleccion.length}`;

  return (
    <HojaSuperior titulo="subir de la galería" onCerrar={subiendo ? () => {} : onCerrar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-3)' }}>
        {preparando && <div style={{ color: 'var(--ink-400)' }}>Leyendo {archivos.length} archivo{archivos.length === 1 ? '' : 's'}…</div>}
        {rechazados.map((r) => <Aviso key={r} tipo="atencion">{r}</Aviso>)}
        {resumen && <Aviso tipo={resumen.ok ? 'atencion' : 'error'}>{resumen.ok} subida{resumen.ok === 1 ? '' : 's'}, {resumen.fallos} con error. Las que fallaron siguen abajo con su motivo.</Aviso>}

        {!preparando && items.length > 0 && (
          <>
            <div className="label">¿De qué zona?</div>
            <SelectorZona visitaId={visitaId} value={zonaLote} onChange={setZonaLote} zonasExtra={zonasExtra} deshabilitado={subiendo} />
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
              Cada una se guarda con la fecha y el lugar en que se hizo, no con los de ahora. Sin zona = «General».
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' }}>
              {items.map((it) => (
                <div key={it.id} className="card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, opacity: it.incluida ? 1 : 0.5 }}>
                  {it.url ? (
                    <img src={it.url} alt={it.archivo.name} loading="lazy" decoding="async" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6 }} />
                  ) : (
                    <div style={{ aspectRatio: '1', display: 'grid', placeItems: 'center', background: 'var(--surface-2, #eee)', borderRadius: 6 }}>
                      <Icono nombre="audio" size={32} weight="duotone" />
                    </div>
                  )}
                  <div style={{ fontSize: 'var(--text-xs)', wordBreak: 'break-all' }}>{it.archivo.name} · {formatearBytes(it.archivo.size)}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
                    hecha el {fechaLarga(it.fecha)}{it.fechaDeLaFoto ? '' : ' (fecha del archivo)'}{it.tipo === 'foto' ? (it.lat !== undefined ? '' : ' · sin ubicación') : ''}
                  </div>
                  {it.duplicada && <div className="field-error-text">{it.duplicada}</div>}
                  {it.lejosKm !== undefined && (
                    <div style={{ fontSize: 'var(--text-xs)' }}>
                      Hecha a unos {it.lejosKm} km de donde habéis trabajado: se guarda {it.conUbicacion ? 'con' : 'sin'} su ubicación.{' '}
                      <button type="button" className="chip" disabled={subiendo} onClick={() => cambiar(it.id, { conUbicacion: !it.conUbicacion })}>
                        {it.conUbicacion ? 'Quitar su ubicación' : 'Usar su ubicación'}
                      </button>
                    </div>
                  )}
                  {it.fechaLejosDias !== undefined && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warn-700, #92400e)' }}>Fecha a {it.fechaLejosDias} días de la visita.</div>
                  )}
                  {it.error && <div className="field-error-text">{it.error}</div>}
                  {it.tipo === 'foto' && (
                    <select className="field" aria-label={`Zona de ${it.archivo.name}`} value={it.zona ?? LOTE} disabled={subiendo}
                      onChange={(e) => cambiar(it.id, { zona: e.target.value === LOTE ? null : e.target.value })}>
                      <option value={LOTE}>Zona del lote{zonaLote.trim() ? `: ${zonaLote.trim()}` : ' (General)'}</option>
                      {zonaLote.trim() && <option value="">General (sin zona)</option>}
                      {zonasConocidas.map((z) => <option key={z} value={z}>{z}</option>)}
                    </select>
                  )}
                  <button type="button" className="chip" disabled={subiendo} onClick={() => cambiar(it.id, { incluida: !it.incluida })}>
                    {it.incluida ? 'Quitar' : 'Incluir'}
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-primary btn-guardar-fijo" disabled={subiendo || seleccion.length === 0} onClick={() => void subir()}>
              {tituloBoton}
            </button>
          </>
        )}
        {!preparando && items.length === 0 && <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cerrar</button>}
      </div>
    </HojaSuperior>
  );
}
