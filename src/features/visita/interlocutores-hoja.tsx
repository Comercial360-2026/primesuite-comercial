import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import { HojaSuperior } from '@/components/ui/hoja-superior';
import { Icono } from '@/components/ui/iconos';
import { DirectorioInterlocutores } from '@/features/clientes/directorio-interlocutores';

interface InterlocutoresHojaProps {
  visitaId: string;
  clienteId: string;
  onCerrar: () => void;
}

// Hoja inferior de "Interlocutores" de una visita en curso. El directorio de
// personas del cliente (alta/edición/baja) vive en
// `DirectorioInterlocutores`, compartido con la ficha de cliente; aquí solo
// se añade la capa de "quién estuvo presente en ESTA visita".
export function InterlocutoresHoja({ visitaId, clienteId, onCerrar }: InterlocutoresHojaProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  // Sin esto, un doble-toque rápido (antes de que invalide la query) podía
  // disparar dos INSERT/DELETE seguidos — mismo guard que ya tienen
  // participantes-hoja.tsx y solicitudes-reasignacion.tsx para la misma
  // clase de acción.
  const [trabajandoId, setTrabajandoId] = useState<string | null>(null);

  const { data: presentesIds } = useQuery({
    queryKey: ['interlocutores-presentes', visitaId],
    queryFn: async (): Promise<string[]> => {
      const { data, error: err } = await supabase
        .from('visita_interlocutor')
        .select('interlocutor_id, interlocutor:interlocutor_id(activo)')
        .eq('visita_id', visitaId);
      if (err) throw err;
      return (data ?? [])
        .filter((r) => (r.interlocutor as unknown as { activo: boolean } | null)?.activo)
        .map((r) => r.interlocutor_id);
    },
  });

  async function alternarPresencia(interlocutorId: string, presente: boolean) {
    if (trabajandoId) return;
    setTrabajandoId(interlocutorId);
    setError(null);
    try {
      if (presente) {
        try {
          await conReintentoDeSesion(
            () =>
              supabase
                .from('visita_interlocutor')
                .delete({ count: 'exact' })
                .eq('visita_id', visitaId)
                .eq('interlocutor_id', interlocutorId),
            'No se ha podido quitar (0 filas afectadas). Puede que no tengas permiso.'
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se pudo quitar.');
          return;
        }
      } else {
        const { error: err } = await supabase
          .from('visita_interlocutor')
          .insert({ visita_id: visitaId, interlocutor_id: interlocutorId });
        if (err) {
          setError(err.message);
          return;
        }
      }
      queryClient.invalidateQueries({ queryKey: ['interlocutores-presentes', visitaId] });
      queryClient.invalidateQueries({ queryKey: ['interlocutores-count', visitaId] });
    } finally {
      setTrabajandoId(null);
    }
  }

  return (
    <HojaSuperior
      titulo="Interlocutores"
      onCerrar={onCerrar}
      derecha={
        !creando && (
          <button
            type="button"
            className="boton-icono"
            aria-label="Nuevo interlocutor"
            title="Nuevo interlocutor"
            onClick={() => setCreando(true)}
          >
            <Icono nombre="mas" size={18} />
          </button>
        )
      }
    >
      <DirectorioInterlocutores
        clienteId={clienteId}
        presencia={{ visitaId, presentesIds: presentesIds ?? [], onTogglePresencia: alternarPresencia, trabajandoId }}
        crearNuevo={{ abierto: creando, onCambio: setCreando }}
      />
      {error && (
        <div className="field-error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </HojaSuperior>
  );
}
