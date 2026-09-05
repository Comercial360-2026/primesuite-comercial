import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { HojaInferior } from '@/components/ui/hoja-inferior';
import { DirectorioInterlocutores } from '@/features/clientes/directorio-interlocutores';

interface InterlocutoresModalProps {
  visitaId: string;
  clienteId: string;
  onCerrar: () => void;
}

// Hoja inferior de "Interlocutores" de una visita en curso. El directorio de
// personas del cliente (alta/edición/baja) vive en
// `DirectorioInterlocutores`, compartido con la ficha de cliente; aquí solo
// se añade la capa de "quién estuvo presente en ESTA visita".
export function InterlocutoresModal({ visitaId, clienteId, onCerrar }: InterlocutoresModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    if (presente) {
      const { error: err, count } = await supabase
        .from('visita_interlocutor')
        .delete({ count: 'exact' })
        .eq('visita_id', visitaId)
        .eq('interlocutor_id', interlocutorId);
      if (err) {
        setError(err.message);
        return;
      }
      if (!count) {
        setError('No se ha podido quitar (0 filas afectadas). Puede que no tengas permiso.');
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
  }

  return (
    <HojaInferior titulo="Interlocutores" onCerrar={onCerrar}>
      <DirectorioInterlocutores
        clienteId={clienteId}
        presencia={{ visitaId, presentesIds: presentesIds ?? [], onTogglePresencia: alternarPresencia }}
      />
      {error && (
        <div className="field-error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </HojaInferior>
  );
}
