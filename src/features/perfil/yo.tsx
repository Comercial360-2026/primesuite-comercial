import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';

// Pantalla mínima "Yo" — hueco real detectado durante las pruebas: el
// bottom nav apuntaba a /yo desde el principio del proyecto, pero esa ruta
// nunca se registró en routes.tsx (caía en el catch-all, sin avisar).
// Aquí se resuelve lo mínimo imprescindible: quién eres y cómo cerrar
// sesión — no había ningún mecanismo de logout en toda la aplicación hasta
// ahora, solo el atajo de consola window.__supabase.auth.signOut().
export function Yo() {
  const { comercial } = useSesionActual();
  const navigate = useNavigate();
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cerrarSesion() {
    setCerrando(true);
    setError(null);
    const { error: err } = await supabase.auth.signOut();
    setCerrando(false);
    if (err) {
      setError(err.message);
      return;
    }
    // RequireSession detecta el SIGNED_OUT (ver use-sesion-actual.ts) y
    // redirige solo a /login, pero navegamos explícitamente aquí también
    // para que la transición sea inmediata, no dependiente del listener.
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
