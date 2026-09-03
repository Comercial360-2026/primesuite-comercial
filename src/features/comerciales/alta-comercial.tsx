import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { crearComercial, traspasarCartera, type RolComercial } from '@/lib/gestionar-comercial';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { Aviso } from '@/components/ui/aviso';

const ROLES: { valor: RolComercial; etiqueta: string }[] = [
  { valor: 'comercial', etiqueta: 'Comercial' },
  { valor: 'direccion_comercial', etiqueta: 'Dirección comercial' },
];

export function AltaComercial() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<RolComercial>('comercial');
  const [zona, setZona] = useState('');
  // Heredar la cartera de otro comercial (normalmente uno que se va).
  const [heredarDe, setHeredarDe] = useState('');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    action_link: string | null;
    aviso?: string;
    heredado?: { nombre: string; clientes: number; visitas: number; pasos: number };
  } | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Todos los comerciales (activos y de baja) — se hereda casi siempre de
  // uno que se ha ido.
  const { data: comerciales } = useQuery({
    queryKey: ['comerciales-equipo'],
    queryFn: async (): Promise<{ id: string; nombre: string; activo: boolean }[]> => {
      const { data, error: err } = await supabase
        .from('comercial')
        .select('id, nombre, activo')
        .order('nombre');
      if (err) throw err;
      return data ?? [];
    },
  });

  const puedeGuardar = nombre.trim() && email.trim().includes('@') && !creando;

  async function crear() {
    if (!puedeGuardar) return;
    setCreando(true);
    setError(null);
    try {
      const { id, action_link, aviso } = await crearComercial({
        nombre: nombre.trim(),
        email: email.trim(),
        rol,
        zona_cartera: zona.trim() || null,
      });

      let heredado: { nombre: string; clientes: number; visitas: number; pasos: number } | undefined;
      if (heredarDe) {
        const r = await traspasarCartera(heredarDe, id);
        heredado = {
          nombre: comerciales?.find((c) => c.id === heredarDe)?.nombre ?? 'otro comercial',
          ...r,
        };
      }

      queryClient.invalidateQueries({ queryKey: ['comerciales-equipo'] });
      queryClient.invalidateQueries({ queryKey: ['nombres-comerciales'] });
      queryClient.invalidateQueries({ queryKey: ['listado-clientes'] });
      setResultado({ action_link, aviso, heredado });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el comercial.');
    } finally {
      setCreando(false);
    }
  }

  async function copiar() {
    if (!resultado?.action_link) return;
    try {
      await navigator.clipboard.writeText(resultado.action_link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* si el navegador no deja copiar, el enlace se ve igual en pantalla */
    }
  }

  async function compartir() {
    if (!resultado?.action_link || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({
        title: 'Acceso a PrimeNotes',
        text: `${nombre.trim()}, entra en PrimeNotes y elige tu contraseña con este enlace (caduca en 1 hora):`,
        url: resultado.action_link,
      });
    } catch {
      /* el usuario canceló el diálogo de compartir */
    }
  }

  // Alta hecha: se enseña el enlace de un solo uso para dárselo al
  // comercial (WhatsApp, en persona…). Con él elige su contraseña.
  if (resultado) {
    const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    return (
      <div className="screen">
        <CabeceraDetalle titulo="Comercial creado" />
        <div className="lista-agrupada">
          <Aviso tipo="exito" titulo={`${nombre.trim()} está dada de alta`}>
            {resultado.action_link
              ? 'Pásale este enlace (WhatsApp, en persona…). Con él elige su contraseña. Caduca en 1 hora; si hace falta, se reenvía desde su ficha.'
              : (resultado.aviso ?? 'El comercial está creado. Reenvíale el enlace de acceso desde su ficha.')}
          </Aviso>

          {resultado.heredado && (
            <Aviso tipo="info" titulo="Cartera heredada">
              De {resultado.heredado.nombre}: {resultado.heredado.clientes} cliente(s),{' '}
              {resultado.heredado.visitas} visita(s) planificada(s) y {resultado.heredado.pasos}{' '}
              próximo(s) paso(s).
            </Aviso>
          )}

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div className="label" style={{ marginTop: 0 }}>Correo</div>
              <div style={{ fontSize: 'var(--text-base)' }}>{email.trim()}</div>
            </div>
            {resultado.action_link && (
              <>
                <div>
                  <div className="label">Enlace de acceso</div>
                  <div className="enlace-copia">{resultado.action_link}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" style={{ width: 'auto', padding: '0 16px' }} onClick={copiar}>
                    {copiado ? 'Copiado ✓' : 'Copiar enlace'}
                  </button>
                  {puedeCompartir && (
                    <button className="btn btn-secondary" style={{ width: 'auto', padding: '0 16px' }} onClick={compartir}>
                      Compartir
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => navigate('/comerciales')}>
          Hecho
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      <CabeceraDetalle titulo="Nuevo comercial" ayuda="alta-comercial" onVolver={() => navigate(-1)} />

      <div className="label" style={{ marginTop: 0 }}>Nombre</div>
      <input
        className="field"
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="nombre y apellidos"
      />

      <div className="label">Correo</div>
      <input
        className="field"
        type="email"
        autoCapitalize="none"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="nombre@primion.com"
      />

      <div className="label">Rol</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {ROLES.map((r) => (
          <button
            key={r.valor}
            type="button"
            className={`chip${rol === r.valor ? ' chip--on' : ''}`}
            onClick={() => setRol(r.valor)}
          >
            {r.etiqueta}
          </button>
        ))}
      </div>

      <div className="label">Zona / cartera (opcional)</div>
      <input
        className="field"
        value={zona}
        onChange={(e) => setZona(e.target.value)}
        placeholder="p. ej. Cataluña, Grandes cuentas…"
      />

      <div className="label">Heredar la cartera de (opcional)</div>
      <select className="field" value={heredarDe} onChange={(e) => setHeredarDe(e.target.value)}>
        <option value="">Nadie</option>
        {comerciales?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
            {c.activo ? '' : ' (de baja)'}
          </option>
        ))}
      </select>
      {heredarDe && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
          Al crearlo se le pasan los clientes, visitas planificadas y próximos pasos de ese comercial.
        </div>
      )}

      {error && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}

      <button className="btn btn-primary" style={{ marginTop: 'auto' }} disabled={!puedeGuardar} onClick={crear}>
        {creando ? 'Creando…' : 'Crear comercial'}
      </button>
    </div>
  );
}
