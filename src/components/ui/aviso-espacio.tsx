import { useNavigate } from 'react-router-dom';
import { useEspacioEquipo } from '@/hooks/use-espacio-equipo';
import { useAvisoLiberar } from '@/hooks/use-aviso-liberar';

// Banner en la cáscara de la app. Aparece cuando:
//   - Dirección Comercial te ha pedido que liberes espacio (tiene prioridad
//     — es una petición explícita), o
//   - el pozo del equipo está crítico (>=95%) o lleno (>=98%).
// Los avisos suaves (tu parte al 85%, equipo al 85%) viven dentro de "Mi
// espacio". No se puede descartar: es un estado, desaparece solo.

export function AvisoEspacio() {
  const navigate = useNavigate();
  const { estado } = useEspacioEquipo();
  const { aviso: peticion } = useAvisoLiberar();

  if (peticion) {
    return (
      <div
        onClick={() => navigate('/mi-espacio')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 40,
          padding: '0 var(--space-4)',
          background: 'var(--brand-050)',
          color: 'var(--risk-600)',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {peticion.pedidoPorNombre} te ha pedido que liberes espacio.
        </span>
        <span style={{ fontSize: 18, flexShrink: 0 }}>›</span>
      </div>
    );
  }

  if (!estado || (estado.nivel !== 'critico_equipo' && estado.nivel !== 'bloqueo')) {
    return null;
  }

  const bloqueo = estado.nivel === 'bloqueo';

  return (
    <div
      onClick={() => navigate('/mi-espacio')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 40,
        padding: '0 var(--space-4)',
        background: 'var(--brand-050)',
        color: 'var(--risk-600)',
        fontSize: 'var(--text-sm)',
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bloqueo
          ? `Espacio del equipo lleno (${estado.pctEquipo.toFixed(0)}%) — no se pueden añadir fotos. Libera visitas antiguas.`
          : `Espacio del equipo al ${estado.pctEquipo.toFixed(0)}% — conviene liberar visitas antiguas.`}
      </span>
      <span style={{ fontSize: 18, flexShrink: 0 }}>›</span>
    </div>
  );
}
