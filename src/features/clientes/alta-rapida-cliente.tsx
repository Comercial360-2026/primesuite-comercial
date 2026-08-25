import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';

// NOTA DE ALCANCE: la creación de `cliente` es un INSERT directo online, NO
// pasa por la cola offline — `cliente` no está en EntidadSincronizable
// (lib/offline-queue/types.ts). Esto significa que dar de alta un cliente
// nuevo sin cobertura fallará hoy. Es una limitación real, no simulada;
// señalada aquí en vez de ampliar la infraestructura offline sin que se
// haya pedido explícitamente.
export function AltaRapidaCliente() {
  const navigate = useNavigate();
  const { comercial } = useSesionActual();
  const { iniciarVisita } = useVisitaActivaContext();
  const { encolar } = useSyncQueue(undefined);

  const [nombre, setNombre] = useState('');
  const creacionCliente = useAccionAsync();

  async function crearYVisitar() {
    if (!nombre.trim()) return;

    await creacionCliente.ejecutar(
      async () => {
        // Defensa explícita: sin pantalla de login construida todavía,
        // `comercial` puede no estar resuelto. Antes esto hacía que el botón
        // no hiciera nada de forma silenciosa — ahora se muestra como un
        // error visible, mismo patrón ya usado en OportunidadRapidaModal.
        if (!comercial) {
          throw new Error('No se ha podido identificar tu sesión de comercial. Vuelve a iniciar sesión.');
        }

        const { data: cliente, error: errorCliente } = await supabase
          .from('cliente')
          .insert({ nombre: nombre.trim(), estado_relacion: 'borrador' })
          .select('id, nombre')
          .single();

        if (errorCliente || !cliente) {
          throw new Error(errorCliente?.message ?? 'No se pudo crear el cliente. Comprueba tu conexión.');
        }

        const visitaId = crypto.randomUUID();
        await encolar(visitaId, 'visita', {
          clienteId: cliente.id,
          comercialResponsableId: comercial.id,
          tipoVisita: null,
        });

        return { visitaId, clienteNombre: cliente.nombre };
      },
      {
        onExito: ({ visitaId, clienteNombre }) => {
          iniciarVisita({ id: visitaId, clienteNombre });
          navigate(`/visita/${visitaId}`);
        },
      }
    );
  }

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>
          ←
        </button>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 500, margin: 0 }}>nuevo cliente</h1>
      </div>

      <div className="label" style={{ marginTop: 0 }}>nombre</div>
      <input
        className={`field${creacionCliente.error ? ' field--error' : ''}`}
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="razón social"
      />
      {creacionCliente.error && <div className="field-error-text">{creacionCliente.error}</div>}

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
        El resto de la ficha (sector, tamaño, ubicación) se completa después. Al guardar, se inicia la visita directamente.
      </p>

      <button
        className="btn btn-primary"
        style={{ marginTop: 'auto' }}
        disabled={!nombre.trim() || creacionCliente.cargando}
        onClick={crearYVisitar}
      >
        {creacionCliente.cargando ? 'creando…' : 'guardar e iniciar visita →'}
      </button>
    </div>
  );
}
