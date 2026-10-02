import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { conReintentoDeSesion } from '@/lib/con-reintento-de-sesion';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { Aviso } from '@/components/ui/aviso';
import { Icono } from '@/components/ui/iconos';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { SelectorMedioVisita } from '@/components/ui/selector-medio-visita';
import { MEDIO_VISITA, type MedioVisita } from '@/lib/medio-visita';

// Visita en curso por Teams o por llamada: la señal («Teams» / «Llamada», con su
// icono y tono), el acceso directo («Unirse a la reunión» / «Llamar a …») y,
// mientras la visita siga abierta, cambiar el medio (una llamada que acaba en
// reunión). Tarjeta grande del medio con botón «Cambiar», también en presencial.
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
  const [editando, setEditando] = useState(false);
  const [medioBorrador, setMedioBorrador] = useState<MedioVisita>(medio);
  const [enlaceBorrador, setEnlaceBorrador] = useState(enlace ?? '');

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

  async function guardar() {
    await cambio.ejecutar(
      () =>
        conReintentoDeSesion(
          () =>
            supabase
              .from('visita')
              .update(
                { medio: medioBorrador, enlace_reunion: medioBorrador === 'teams' ? enlaceBorrador.trim() || null : null },
                { count: 'exact' }
              )
              .eq('id', visitaId),
          'No se ha podido cambiar (0 filas afectadas). Puede que no tengas permiso.'
        ),
      {
        onExito: () => {
          setEditando(false);
          onCambiado();
        },
      }
    );
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {editando ? (
        <div style={{ border: '1px solid var(--ink-100)', borderRadius: 'var(--radius-field)', padding: 10 }}>
          <SelectorMedioVisita
            medio={medioBorrador}
            enlace={enlaceBorrador}
            onMedio={setMedioBorrador}
            onEnlace={setEnlaceBorrador}
          />
          <div className="fila-btns" style={{ marginTop: 10 }}>
            <button className="btn btn-secondary" onClick={() => setEditando(false)} disabled={cambio.cargando}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={() => void guardar()} disabled={cambio.cargando}>
              {cambio.cargando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {cambio.error && <Aviso tipo="error">{cambio.error}</Aviso>}
        </div>
      ) : (
        <>
          <div className={`medio-tarjeta medio-tarjeta--${medio}`}>
            <Icono nombre={MEDIO_VISITA[medio].icono} size={28} />
            <div className="medio-tarjeta__texto">{MEDIO_VISITA[medio].frase.charAt(0).toUpperCase() + MEDIO_VISITA[medio].frase.slice(1)}</div>
            {editable && (
              <button
                type="button"
                className="btn btn-secondary btn--compacto"
                onClick={() => {
                  setMedioBorrador(medio);
                  setEnlaceBorrador(enlace ?? '');
                  setEditando(true);
                }}
              >
                Cambiar
              </button>
            )}
          </div>
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
        </>
      )}
    </div>
  );
}
