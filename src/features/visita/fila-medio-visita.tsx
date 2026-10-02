import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { Aviso } from '@/components/ui/aviso';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { SelectorMedioVisita } from '@/components/ui/selector-medio-visita';
import type { MedioVisita } from '@/lib/medio-visita';

// El medio de la visita dentro de ella: los mismos tres iconos de siempre (el elegido
// relleno de su color), y tocar otro lo cambia al instante — una llamada que acaba en
// reunión, o un error al elegir. Debajo, el acceso directo: «Unirse a la reunión»
// (Teams) o «Llamar a …» (llamada, con el teléfono de los interlocutores).
interface Props {
  visitaId: string;
  clienteId: string;
  medio: MedioVisita;
  enlace: string | null;
  /** Solo se puede cambiar cuando la visita ya existe en el servidor. */
  editable: boolean;
  /** Tras guardar: que la pantalla relea la visita. */
  onCambiado: () => void;
}

export function FilaMedioVisita({ visitaId, clienteId, medio, enlace, editable, onCambiado }: Props) {
  const cambio = useAccionAsync();
  const [enlaceBorrador, setEnlaceBorrador] = useState(enlace ?? '');
  useEffect(() => setEnlaceBorrador(enlace ?? ''), [enlace]);

  const { data: contactos } = useQuery({
    queryKey: ['interlocutores-con-telefono', clienteId],
    enabled: medio === 'llamada',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interlocutor')
        .select('id, nombre, telefono')
        .eq('cliente_id', clienteId)
        .eq('activo', true)
        .not('telefono', 'is', null)
        .order('nombre')
        .limit(5);
      if (error) throw error;
      return (data ?? []).filter((c) => (c.telefono ?? '').trim());
    },
  });

  async function guardar(nuevo: MedioVisita, enlaceNuevo: string) {
    await cambio.ejecutar(
      () =>
        conReintentoDeSesion(
          () =>
            supabase
              .from('visita')
              .update(
                { medio: nuevo, enlace_reunion: nuevo === 'teams' ? enlaceNuevo.trim() || null : null },
                { count: 'exact' }
              )
              .eq('id', visitaId),
          'No se ha podido cambiar (0 filas afectadas). Puede que no tengas permiso.'
        ),
      { onExito: onCambiado }
    );
  }

  return (
    <div>
      <SelectorMedioVisita
        medio={medio}
        enlace={enlaceBorrador}
        onMedio={(m) => m !== medio && void guardar(m, enlaceBorrador)}
        onEnlace={setEnlaceBorrador}
        onEnlaceBlur={() => enlaceBorrador.trim() !== (enlace ?? '') && void guardar(medio, enlaceBorrador)}
        deshabilitado={!editable || cambio.cargando}
      />
      {cambio.error && <Aviso tipo="error">{cambio.error}</Aviso>}
      {medio === 'teams' && enlace && (
        <SeccionLista>
          <FilaNavegable
            icono="teams"
            titulo="Unirse a la reunión"
            chevron={false}
            onClick={() => window.open(enlace, '_blank', 'noopener,noreferrer')}
          />
        </SeccionLista>
      )}
      {medio === 'llamada' && !!contactos?.length && (
        <SeccionLista>
          {contactos.map((c) => (
            <FilaNavegable
              key={c.id}
              icono="llamada"
              titulo={`Llamar a ${c.nombre}`}
              subtitulo={c.telefono ?? undefined}
              chevron={false}
              onClick={() => {
                window.location.href = `tel:${(c.telefono ?? '').replace(/[^\d+]/g, '')}`;
              }}
            />
          ))}
        </SeccionLista>
      )}
    </div>
  );
}
