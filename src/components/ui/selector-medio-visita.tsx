import { Segmentado } from './segmentado';
import { OPCIONES_MEDIO, type MedioVisita } from '@/lib/medio-visita';

// «¿Cómo es la visita?»: Presencial / Teams / Llamada. Con Teams, además, el
// enlace de la reunión (opcional). Lo usan empezar-visita-hoja y planificar-visita.
interface Props {
  medio: MedioVisita;
  enlace: string;
  onMedio: (m: MedioVisita) => void;
  onEnlace: (e: string) => void;
}

export function SelectorMedioVisita({ medio, enlace, onMedio, onEnlace }: Props) {
  return (
    <>
      <div className="label">Cómo es la visita</div>
      <Segmentado opciones={OPCIONES_MEDIO} valor={medio} onCambio={onMedio} />
      {medio === 'teams' && (
        <>
          <div className="label">Enlace de la reunión (opcional)</div>
          <input
            type="url"
            inputMode="url"
            className="field"
            placeholder="https://teams.microsoft.com/…"
            value={enlace}
            onChange={(e) => onEnlace(e.target.value)}
          />
        </>
      )}
    </>
  );
}
