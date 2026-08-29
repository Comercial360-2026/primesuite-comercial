import { useState } from 'react';
import { useUbicacionesCliente } from '@/hooks/use-ubicaciones-cliente';

interface SelectorUbicacionProps {
  clienteId: string;
  comercialId: string;
  onSeleccionar: (ubicacion: { id: string; nombre: string }) => void;
  onCerrar?: () => void;
  titulo?: string;
}

// Reutilizado en Modo Recorrido (crear sobre la marcha, caminando por las
// instalaciones del cliente, posiblemente sin cobertura) y en la pantalla
// de gestión de ubicaciones desde la ficha del cliente (planificar antes,
// corregir después). Mismo patrón que SelectorTermino: escribir filtra en
// vivo lo que ya existe; si no hay coincidencia exacta, aparece la opción
// de crear. A diferencia de término, la creación pasa por la cola offline
// (useUbicacionesCliente → encolar 'ubicacion'), no por un insert directo —
// ver justificación en lib/offline-queue/types.ts.
export function SelectorUbicacion({
  clienteId,
  comercialId,
  onSeleccionar,
  onCerrar,
  titulo,
}: SelectorUbicacionProps) {
  const { ubicaciones, crear } = useUbicacionesCliente(clienteId, comercialId);
  const [texto, setTexto] = useState('');
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textoNormalizado = texto.trim().toLowerCase();
  const resultados = textoNormalizado
    ? ubicaciones.filter((u) => u.nombre.toLowerCase().includes(textoNormalizado))
    : ubicaciones;

  const existeExacto = ubicaciones.some((u) => u.nombre.toLowerCase() === textoNormalizado);

  async function crearYSeleccionar() {
    if (!texto.trim()) return;
    setCreando(true);
    setError(null);
    try {
      const nueva = await crear(texto.trim());
      onSeleccionar(nueva);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la ubicación.');
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="card">
      {titulo && (
        <div className="label" style={{ marginTop: 0 }}>
          {titulo}
        </div>
      )}
      <input
        className="field"
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="buscar o escribir ubicación…"
      />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, maxHeight: 140, overflowY: 'auto' }}>
        {resultados.length === 0 && !textoNormalizado && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
            este cliente todavía no tiene ubicaciones
          </span>
        )}
        {resultados.map((u) => (
          <button key={u.id} type="button" className="chip" onClick={() => onSeleccionar(u)}>
            {u.nombre}
            {!u.sincronizada && <span style={{ color: 'var(--ink-400)', fontSize: 11 }}> · guardando…</span>}
          </button>
        ))}
      </div>

      {textoNormalizado && !existeExacto && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 8 }}
          disabled={creando}
          onClick={crearYSeleccionar}
        >
          {creando ? 'creando…' : `+ crear "${texto.trim()}"`}
        </button>
      )}

      {onCerrar && (
        <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={onCerrar}>
          cerrar
        </button>
      )}
      {error && (
        <div className="field-error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
