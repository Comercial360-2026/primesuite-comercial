import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';

const LIMITE_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GB, techo real del plan gratuito de Supabase

function formatearMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(0);
}

// Pantalla "Yo" — mismo sitio en el bottom nav para cualquier rol, siempre.
// El acceso a Vocabulario (antes ocupaba este mismo hueco del menú solo
// para direccion_comercial, quitándole a ese rol su propio acceso a "Yo" y
// por tanto al cierre de sesión) vive ahora dentro de esta pantalla, como
// una tarjeta más — no compite por la posición fija del menú.
export function Yo() {
  const { comercial } = useSesionActual();
  const { cerrarVisita } = useVisitaActivaContext();
  const navigate = useNavigate();
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esDireccionComercial = comercial?.rol === 'direccion_comercial';

  // Aviso de espacio de Storage — solo visible para Dirección Comercial,
  // que es quien puede actuar (subir de plan, archivar, etc.). El plan
  // gratuito de Supabase da 1 GB fijo para siempre, no se renueva cada
  // mes — sin aviso previo, un comercial se encontraría un error al subir
  // una foto en mitad de una visita real, sin ningún margen de reacción.
  const { data: bytesUsados } = useQuery({
    queryKey: ['espacio-storage-usado'],
    enabled: esDireccionComercial,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error: err } = await supabase.rpc('fn_espacio_storage_usado');
      if (err) throw err;
      return data as number;
    },
  });

  const porcentajeUsado = bytesUsados != null ? (bytesUsados / LIMITE_STORAGE_BYTES) * 100 : null;
  const colorAviso =
    porcentajeUsado == null || porcentajeUsado < 70
      ? 'var(--ink-400)'
      : porcentajeUsado < 90
        ? 'var(--warning-600)'
        : 'var(--risk-600)';

  async function cerrarSesion() {
    setCerrando(true);
    setError(null);
    const { error: err } = await supabase.auth.signOut();
    setCerrando(false);
    if (err) {
      setError(err.message);
      return;
    }
    // El logout no recarga la página (navegación de React, no un F5 real),
    // así que el banner "visita en curso" — estado solo de memoria, ver
    // use-visita-activa-context.tsx — sobrevive al cierre de sesión si no
    // se limpia explícitamente aquí. Hueco real: mostraba la visita de la
    // sesión anterior como si perteneciera a la nueva sesión.
    cerrarVisita();
    navigate('/login', { replace: true });
  }

  return (
    <div className="screen">
      <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>yo</h1>

      <div className="card">
        <div className="label" style={{ marginTop: 0 }}>nombre</div>
        <div style={{ fontSize: 'var(--text-base)' }}>{comercial?.nombre ?? '—'}</div>

        <div className="label">rol</div>
        <div style={{ fontSize: 'var(--text-base)' }}>{comercial?.rol ?? '—'}</div>
      </div>

      {esDireccionComercial && (
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/vocabulario')}>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>gestionar vocabulario</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
            revisar propuestas y organizar el catálogo
          </div>
        </div>
      )}

      {esDireccionComercial && bytesUsados != null && (
        <div className="card" style={{ borderColor: colorAviso }}>
          <div className="label" style={{ marginTop: 0 }}>espacio de almacenamiento</div>
          <div style={{ fontSize: 'var(--text-base)', color: colorAviso }}>
            {formatearMB(bytesUsados)} MB de 1024 MB usados ({porcentajeUsado!.toFixed(0)}%)
          </div>
          {porcentajeUsado! >= 70 && (
            <div style={{ fontSize: 'var(--text-xs)', color: colorAviso, marginTop: 4 }}>
              {porcentajeUsado! >= 90
                ? 'Crítico — actúa pronto o los comerciales no podrán subir fotos ni audios.'
                : 'Acercándose al límite del plan gratuito de Supabase.'}
            </div>
          )}
        </div>
      )}

      {error && <div className="field-error-text">{error}</div>}

      <button
        className="btn btn-secondary"
        style={{ marginTop: 'auto', color: 'var(--risk-600)', borderColor: 'var(--risk-600)' }}
        disabled={cerrando}
        onClick={cerrarSesion}
      >
        {cerrando ? 'cerrando sesión…' : 'cerrar sesión'}
      </button>
    </div>
  );
}
