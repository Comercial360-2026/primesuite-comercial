interface EstadoErrorProps {
  mensaje?: string;
  onReintentar: () => void;
}

// Estado de error explícito para useQuery — nunca debe confundirse con "no
// hay resultados". Hallazgo de auditoría (encargo técnico, punto 1):
// ninguna pantalla comprobaba `isError`, así que un fallo de red o servidor
// se mostraba igual que un vacío real. Este componente es el patrón único
// a reutilizar en toda pantalla que consuma useQuery.
export function EstadoError({
  mensaje = 'No se pudo cargar la información. Comprueba tu conexión.',
  onReintentar,
}: EstadoErrorProps) {
  return (
    <div className="card card--riesgo">
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--risk-600)', fontWeight: 500 }}>
        {mensaje}
      </div>
      <button
        className="btn btn-secondary"
        style={{ marginTop: 8, width: 'auto', padding: '0 16px' }}
        onClick={onReintentar}
      >
        Reintentar
      </button>
    </div>
  );
}
