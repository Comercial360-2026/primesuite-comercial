import { useQuery } from '@tanstack/react-query';
import { listarZonasUsadasEnVisita } from '@/lib/zonas-visita';

interface SelectorZonaProps {
  visitaId: string | undefined;
  value: string;
  onChange: (valor: string) => void;
}

// Campo de zona: texto libre + chips de las zonas YA usadas en esta visita
// (Cesar: "si hay zona se deja seleccionar la que sea, si no hay zona ese
// campo no se rellena, y va a general"). Un toque en un chip la selecciona
// (o la quita, si ya estaba puesta); escribir a mano sigue disponible para
// una zona nueva. Vacío = sin zona = «General», nunca obliga a rellenar.
export function SelectorZona({ visitaId, value, onChange }: SelectorZonaProps) {
  const { data: zonasUsadas } = useQuery({
    queryKey: ['zonas-usadas-visita', visitaId],
    enabled: !!visitaId,
    queryFn: () => listarZonasUsadasEnVisita(visitaId!),
  });

  return (
    <div>
      <input
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escribe la zona · p. ej. Puerta muelle de carga"
      />
      {!!zonasUsadas?.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {zonasUsadas.map((z) => {
            const activa = value.trim() === z;
            return (
              <button
                key={z}
                type="button"
                className={`chip${activa ? ' chip--on' : ''}`}
                onClick={() => onChange(activa ? '' : z)}
              >
                {z}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
