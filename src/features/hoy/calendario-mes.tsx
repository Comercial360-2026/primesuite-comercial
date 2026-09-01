import { useMemo, useState, type ReactNode } from 'react';
import { fechaLarga } from '@/lib/fechas';

// Vista de mes para la Agenda. Solo pinta: recibe las visitas ya filtradas
// (por "Todas / Solo mías") y una función para renderizar cada fila del panel
// del día. No consulta nada ni navega — eso lo hace quien la usa.
//
// Semana empieza en lunes (convención en España). Un día con visitas muestra
// su número + una pastilla con cuántas hay; al tocarlo se abre debajo la
// lista de ese día. Tocar otro día la cambia; tocar el mismo, la cierra.

const CABECERAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function claveDia(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// getDay(): domingo = 0 … sábado = 6. Lo giramos a lunes = 0 … domingo = 6.
function columnaLunes(d: Date) {
  return (d.getDay() + 6) % 7;
}

interface Props<T extends { id: string; fecha: string }> {
  visitas: T[];
  renderVisita: (v: T) => ReactNode;
}

export function CalendarioMes<T extends { id: string; fecha: string }>({
  visitas,
  renderVisita,
}: Props<T>) {
  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const porDia = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const v of visitas) {
      const k = claveDia(new Date(v.fecha));
      const lista = m.get(k);
      if (lista) lista.push(v);
      else m.set(k, [v]);
    }
    for (const lista of m.values()) lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return m;
  }, [visitas]);

  const anio = mesVisible.getFullYear();
  const mes = mesVisible.getMonth();
  const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth();
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const huecoInicial = columnaLunes(new Date(anio, mes, 1));

  const celdas: (Date | null)[] = [];
  for (let i = 0; i < huecoInicial; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(new Date(anio, mes, d));
  while (celdas.length % 7 !== 0) celdas.push(null);

  const claveHoy = claveDia(hoy);
  const visitasDiaSel = diaSel ? porDia.get(diaSel) ?? [] : [];
  const fechaDiaSel = diaSel
    ? (() => {
        const [y, m, d] = diaSel.split('-').map(Number);
        return new Date(y, m, d);
      })()
    : null;

  function irAMes(delta: number) {
    setMesVisible(new Date(anio, mes + delta, 1));
    setDiaSel(null);
  }

  const navBtn: React.CSSProperties = {
    border: 'none',
    background: 'none',
    fontSize: 22,
    lineHeight: 1,
    cursor: 'pointer',
    color: 'var(--ink-700)',
    padding: '0 10px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 440, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" onClick={() => irAMes(-1)} style={navBtn} aria-label="Mes anterior">
          ‹
        </button>
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 500, textTransform: 'capitalize' }}>
          {MESES[mes]} {anio}
        </div>
        <button type="button" onClick={() => irAMes(1)} style={navBtn} aria-label="Mes siguiente">
          ›
        </button>
      </div>

      {!esMesActual && (
        <button
          type="button"
          onClick={() => {
            setMesVisible(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
            setDiaSel(null);
          }}
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--brand-600)',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            alignSelf: 'center',
            padding: 0,
          }}
        >
          Ir a hoy
        </button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {CABECERAS.map((c) => (
          <div
            key={c}
            style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--ink-400)', padding: '2px 0' }}
          >
            {c}
          </div>
        ))}
        {celdas.map((celda, i) => {
          if (!celda) return <div key={`v${i}`} />;
          const k = claveDia(celda);
          const n = porDia.get(k)?.length ?? 0;
          const esHoy = k === claveHoy;
          const sel = k === diaSel;
          return (
            <button
              key={k}
              type="button"
              disabled={n === 0}
              onClick={() => setDiaSel(sel ? null : k)}
              style={{
                minHeight: 52,
                border: sel ? '1.5px solid var(--brand-600)' : '1px solid var(--ink-100)',
                borderRadius: 'var(--radius-field)',
                background: esHoy ? 'var(--brand-050)' : 'var(--surface-1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                cursor: n > 0 ? 'pointer' : 'default',
                fontSize: 'var(--text-sm)',
                color: n > 0 ? 'var(--ink-900)' : 'var(--ink-200)',
                fontWeight: esHoy ? 700 : 400,
                padding: 0,
              }}
            >
              <span>{celda.getDate()}</span>
              {n > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    lineHeight: 1,
                    minWidth: 15,
                    padding: '2px 4px',
                    borderRadius: 999,
                    background: 'var(--brand-600)',
                    color: 'var(--surface-1)',
                    fontWeight: 600,
                  }}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {diaSel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="label" style={{ marginTop: 4 }}>
            {(() => {
              const t = fechaLarga(fechaDiaSel!);
              return t.charAt(0).toUpperCase() + t.slice(1);
            })()}
          </div>
          <div className="seccion-lista__grupo">{visitasDiaSel.map((v) => renderVisita(v))}</div>
        </div>
      )}
    </div>
  );
}
