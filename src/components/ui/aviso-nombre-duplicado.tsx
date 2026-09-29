// Aviso de posible duplicado (cliente o proyecto): mismo lenguaje visual que
// ya usa el aviso de "cliente de otro comercial" (`card--riesgo` + botón de
// confirmar explícito) — no es un bloqueo duro, es una confirmación.
interface AvisoNombreDuplicadoProps {
  titulo: string;
  subtitulo?: string;
  onConfirmar: () => void;
}

export function AvisoNombreDuplicado({ titulo, subtitulo, onConfirmar }: AvisoNombreDuplicadoProps) {
  return (
    <div
      className="card--riesgo"
      style={{ padding: 10, borderRadius: 8, marginTop: 10, fontSize: 'var(--text-sm)' }}
    >
      <div style={{ color: 'var(--risk-600)', fontWeight: 500 }}>{titulo}</div>
      {subtitulo && <div style={{ color: 'var(--ink-500)', marginTop: 2 }}>{subtitulo}</div>}
      <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onConfirmar}>
        Sí, seguir de todas formas
      </button>
    </div>
  );
}
