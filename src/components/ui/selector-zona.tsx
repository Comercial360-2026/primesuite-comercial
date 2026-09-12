import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listarZonasUsadasEnVisita } from '@/lib/zonas-visita';
import { AyudaNota } from '@/components/ui/ayuda-nota';

interface SelectorZonaProps {
  visitaId: string | undefined;
  value: string;
  onChange: (valor: string) => void;
  // Si se pasa, elegir/crear/quitar zona graba YA (independiente del
  // «Guardar» general de la pantalla) — igual que Archivar/Borrar, que
  // tampoco esperan al Guardar. Sin esto, la pastilla parecía confirmar
  // algo que en realidad quedaba pendiente hasta guardar toda la pantalla.
  onGuardar?: (valor: string) => Promise<void>;
}

// Campo de zona: buscador + chips de las ya usadas en esta visita, con
// "Usar zona «texto»" para crear una que no existe — mismo patrón que
// SelectorTermino (buscar → coincidencias → + crear si no hay ninguna).
// Una vez elegida se muestra como pastilla (no como caja de texto suelta):
// confirma que la elección se ha registrado, igual que la banda de zona de
// Visita activa, pero sin su peso visual — aquí es un campo más de un
// formulario, no un modo que afecta a todo lo que se captura después.
// Vacío = sin zona = «General», nunca obliga a rellenar.
export function SelectorZona({ visitaId, value, onChange, onGuardar }: SelectorZonaProps) {
  const { data: zonasUsadas } = useQuery({
    queryKey: ['zonas-usadas-visita', visitaId],
    enabled: !!visitaId,
    queryFn: () => listarZonasUsadasEnVisita(visitaId!),
  });
  const [texto, setTexto] = useState('');
  // El buscador se reabre al tocar «cambiar» o al quitar la zona actual;
  // mientras haya una zona y no se haya tocado «cambiar», se ve la pastilla.
  const [buscando, setBuscando] = useState(false);
  // Zona que había AL ABRIR el buscador — solo para el aviso «Zona
  // actual», nunca para filtrar: si se usara `texto` para eso, escribir la
  // zona actual ahí (para que no pareciera perdida) filtraba la lista de
  // chips y se comía todas las demás zonas salvo la que coincidía.
  const [zonaAlAbrir, setZonaAlAbrir] = useState('');
  const [guardandoZona, setGuardandoZona] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [errorZona, setErrorZona] = useState<string | null>(null);

  async function confirmar(zona: string) {
    onChange(zona);
    setTexto('');
    setZonaAlAbrir('');
    setBuscando(false);
    setGuardadoOk(false);
    if (!onGuardar) return;
    setGuardandoZona(true);
    setErrorZona(null);
    try {
      await onGuardar(zona);
      // Confirmación visible de que ya ha quedado grabado (no solo que se ve
      // la pastilla) — sin esto, tocar «Usar zona» parecía no hacer nada:
      // se veía igual haya ido bien o mal. Se apaga sola, mismo patrón que
      // "Guardado ✓" del botón Guardar general.
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 1500);
    } catch (err) {
      setErrorZona(err instanceof Error ? err.message : 'No se pudo guardar la zona.');
    } finally {
      setGuardandoZona(false);
    }
  }

  if (value.trim() && !buscando) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span
            className="chip chip--on"
            style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, opacity: guardandoZona ? 0.6 : 1 }}
          >
            {value.trim()}
          </span>
          <button
            type="button"
            className="chip"
            disabled={guardandoZona}
            style={{ borderLeft: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
            onClick={() => {
              setTexto('');
              setZonaAlAbrir(value.trim());
              setBuscando(true);
            }}
          >
            cambiar
          </button>
          <button
            type="button"
            aria-label="Quitar la zona"
            title="Quitar la zona"
            disabled={guardandoZona}
            style={{
              border: 'none', background: 'none', color: 'var(--ink-400)',
              padding: '0 6px', cursor: 'pointer', fontSize: 15,
            }}
            onClick={() => confirmar('')}
          >
            ✕
          </button>
        </div>
        {guardandoZona && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
            Guardando…
          </div>
        )}
        {guardadoOk && !guardandoZona && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--brand-600)', marginTop: 4, fontWeight: 600 }}>
            ✓ Zona guardada
          </div>
        )}
        {errorZona && <div className="field-error-text">{errorZona}</div>}
        <AyudaNota concepto="zona-item" />
      </div>
    );
  }

  const q = texto.trim().toLocaleLowerCase('es');
  const coincidencias = (zonasUsadas ?? []).filter(
    (z) => !q || z.toLocaleLowerCase('es').includes(q)
  );
  const existeExacta = (zonasUsadas ?? []).some((z) => z.toLocaleLowerCase('es') === q);

  return (
    <div>
      {zonaAlAbrir && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginBottom: 4 }}>
          Zona actual: <strong>{zonaAlAbrir}</strong> — elige otra o escribe una nueva.
        </div>
      )}
      <input
        className="field"
        autoFocus={buscando}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar o escribir zona nueva"
      />
      {coincidencias.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {coincidencias.map((z) => (
            <button key={z} type="button" className="chip" onClick={() => confirmar(z)}>
              {z}
            </button>
          ))}
        </div>
      )}
      {q && !existeExacta && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 6 }}
          onClick={() => confirmar(texto.trim())}
        >
          Usar zona «{texto.trim()}»
        </button>
      )}
      {errorZona && <div className="field-error-text">{errorZona}</div>}
      <AyudaNota concepto="zona-item" />
    </div>
  );
}
