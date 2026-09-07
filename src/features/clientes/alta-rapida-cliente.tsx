import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { uuid } from '@/lib/uuid';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { AvisoTardando } from '@/components/ui/aviso-tardando';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { Icono } from '@/components/ui/iconos';
import { normalizarNombre, claveDuplicado } from '@/lib/nombres-cliente';
import { useVolverA } from '@/lib/volver-a';
import { ObjetivoVisitaModal } from '@/features/visita/objetivo-visita-modal';
import { VisitaEnCursoModal } from '@/features/visita/visita-en-curso-modal';

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

  // `?nombre=` lo pasa "Nueva visita" cuando el buscador no encuentra al
  // cliente: se llega aquí con el nombre ya escrito, se crea y se sigue con
  // "iniciar / planificar visita" sin volver a teclearlo.
  const [params] = useSearchParams();
  const [nombre, setNombre] = useState(params.get('nombre') ?? '');
  const creacionCliente = useAccionAsync();
  // Orígenes: listado de Clientes o el buscador de "Nueva visita". El ←
  // vuelve a donde se venía; si no consta, al listado de Clientes.
  const volver = useVolverA('/clientes');

  // Ventana "¿A qué vas?" antes de arrancar la visita — obligatoria. Guarda
  // qué visita se va a arrancar: sobre el cliente nuevo que se está creando,
  // o sobre uno existente que ha salido como coincidencia.
  const [objetivoModal, setObjetivoModal] = useState<
    null | { modo: 'nuevo' } | { modo: 'existente'; clienteId: string; clienteNombre: string }
  >(null);

  // Aviso si el cliente existente que se va a visitar ya tiene una visita
  // en curso (solo aplica a la vía "visitar un cliente que ya existe"; uno
  // nuevo no puede tener visitas previas).
  const [enCursoModal, setEnCursoModal] = useState<
    null | { visita: { id: string; objetivo: string | null }; clienteId: string; clienteNombre: string }
  >(null);

  // Nombres de los clientes activos. Un comercial ve TODOS los clientes al
  // buscar (la cartera —`cliente.responsable_id`— filtra "Solo míos" en el
  // listado, pero no oculta nada aquí), así que esto también avisa de un
  // duplicado que creó otro compañero. Se excluyen los ya fusionados: son
  // fichas muertas y ofrecer "iniciar visita" sobre ellas llevaría a un
  // cliente que ya no existe.
  const { data: clientesExistentes } = useQuery({
    queryKey: ['nombres-cliente-alta-rapida'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Array<{ id: string; nombre: string }>> => {
      const { data, error } = await supabase
        .from('cliente')
        .select('id, nombre')
        .eq('estado_fusion', 'activo');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Proyectos del cliente existente que se va a visitar: si tiene 2+, la
  // ventana "¿A qué vas?" pide a cuál va la visita (mismo selector que desde
  // la ficha). Un cliente nuevo solo tiene el General, así que no aplica.
  const clienteExistenteId =
    objetivoModal?.modo === 'existente' ? objetivoModal.clienteId : undefined;
  const { data: proyectosExistente } = useQuery({
    queryKey: ['proyectos-cliente-alta', clienteExistenteId],
    enabled: !!clienteExistenteId,
    queryFn: async (): Promise<Array<{ id: string; nombre: string; es_general: boolean }>> => {
      const { data, error } = await supabase
        .from('proyecto')
        .select('id, nombre, es_general')
        .eq('cliente_id', clienteExistenteId!)
        .order('es_general', { ascending: false })
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const nombreNorm = normalizarNombre(nombre);
  const nombreClave = claveDuplicado(nombre);
  const coincidencias = useMemo(() => {
    if (nombreNorm.length < 3 || !clientesExistentes) return [];
    return clientesExistentes
      .map((c) => ({ ...c, norm: normalizarNombre(c.nombre), clave: claveDuplicado(c.nombre) }))
      // El nombre existente contiene lo tecleado (escribiendo aún), o ambos
      // comparten la misma clave sin coletilla jurídica — este segundo caso
      // es el que se escapaba: "BIMBO S.L." teniendo ya "Bimbo" no avisaba,
      // que es justo lo que luego hay que arreglar en Deduplicación.
      .filter((c) => c.norm.includes(nombreNorm) || (!!nombreClave && c.clave === nombreClave))
      .sort((a, b) => {
        const rango = (x: { norm: string; clave: string }) =>
          x.norm === nombreNorm ? 0 : x.clave === nombreClave ? 1 : x.norm.startsWith(nombreNorm) ? 2 : 3;
        return rango(a) - rango(b) || a.nombre.localeCompare(b.nombre, 'es');
      })
      .slice(0, 4);
  }, [nombreNorm, nombreClave, clientesExistentes]);

  const hayExacto = coincidencias.some((c) => c.norm === nombreNorm);

  // Defensa explícita: sin pantalla de login construida todavía, `comercial`
  // puede no estar resuelto. Antes esto hacía que el botón no hiciera nada
  // de forma silenciosa — ahora se muestra como un error visible, mismo
  // patrón ya usado en OportunidadRapidaHoja.
  // Con red: INSERT directo (instantáneo, la ficha ya es navegable).
  // Sin red o corte puntual: se encola y se sincroniza luego. `enCola` dice
  // cuál de los dos pasó, para que cada flujo actúe en consecuencia.
  async function crearCliente(): Promise<{ id: string; nombre: string; enCola: boolean }> {
    if (!comercial) {
      throw new Error('No se ha podido identificar tu sesión de comercial. Vuelve a iniciar sesión.');
    }
    const clienteId = uuid();
    const nombreLimpio = nombre.trim();

    if (navigator.onLine) {
      const { data, error: errorCliente } = await supabase
        .from('cliente')
        .insert({
          id: clienteId,
          nombre: nombreLimpio,
          estado_relacion: 'borrador',
          creado_por: comercial.id,
          // El que da de alta el cliente es su responsable de cartera.
          // Dirección lo reasigna después si hace falta.
          responsable_id: comercial.id,
        })
        .select('id, nombre')
        .single();
      if (!errorCliente && data) return { id: data.id, nombre: data.nombre, enCola: false };
      // Si el fallo no parece de red (RLS, constraint…), se muestra tal
      // cual — encolarlo solo lo escondería. Si parece de red, se encola.
      const esFalloDeRed =
        !navigator.onLine || /fetch|network|load failed/i.test(errorCliente?.message ?? '');
      if (!esFalloDeRed) {
        throw new Error(errorCliente?.message ?? 'No se pudo crear el cliente.');
      }
    }

    await encolar(clienteId, 'cliente', {
      nombre: nombreLimpio,
      creadoPor: comercial.id,
      responsableId: comercial.id,
    });
    return { id: clienteId, nombre: nombreLimpio, enCola: true };
  }

  async function encolarVisita(
    clienteId: string,
    clienteNombre: string,
    objetivo: string,
    proyectoId?: string,
    dependeDe?: string
  ) {
    if (!comercial) {
      throw new Error('No se ha podido identificar tu sesión de comercial. Vuelve a iniciar sesión.');
    }
    const visitaId = uuid();
    await encolar(
      visitaId,
      'visita',
      { clienteId, proyectoId, comercialResponsableId: comercial.id, tipoVisita: null, objetivo },
      dependeDe ? { dependeDe } : undefined
    );
    return { visitaId, clienteNombre };
  }

  // "Estoy delante del cliente": la ventana "¿A qué vas?" recoge el objetivo
  // (obligatorio) y, al confirmar, se crea la ficha y se entra directo en
  // captura. Si el cliente se encoló (sin red), la visita depende de él.
  async function arrancarConObjetivo(objetivo: string, proyectoId: string) {
    if (!objetivoModal || !comercial) return;
    let visitaId: string;
    let clienteNombre: string;
    if (objetivoModal.modo === 'nuevo') {
      // Cliente recién creado: solo tiene el General, lo asigna el backend.
      const cliente = await crearCliente();
      const r = await encolarVisita(
        cliente.id,
        cliente.nombre,
        objetivo,
        undefined,
        cliente.enCola ? cliente.id : undefined
      );
      visitaId = r.visitaId;
      clienteNombre = r.clienteNombre;
    } else {
      const r = await encolarVisita(
        objetivoModal.clienteId,
        objetivoModal.clienteNombre,
        objetivo,
        proyectoId || undefined
      );
      visitaId = r.visitaId;
      clienteNombre = r.clienteNombre;
    }
    iniciarVisita({ id: visitaId, clienteNombre });
    navigate(`/visita/${visitaId}`);
  }

  // "Lo visito otro día": crea la ficha y abre el flujo de planificar ya
  // apuntando a su Proyecto General — un cliente recién creado solo puede
  // tener ese proyecto todavía. Planificar necesita el cliente (y su
  // proyecto) ya en el servidor, así que este flujo exige conexión.
  async function crearYPlanificar() {
    if (!nombre.trim() || creacionCliente.cargando) return;
    if (!navigator.onLine) {
      creacionCliente.establecerError(
        'Necesitas conexión para planificar una visita. Puedes iniciar la visita ahora o guardar sin visita.'
      );
      return;
    }
    await creacionCliente.ejecutar(
      async () => {
        const cliente = await crearCliente();
        if (cliente.enCola) return { cliente, proyectoId: null };
        const { data: proyecto, error: errorProyecto } = await supabase
          .from('proyecto')
          .select('id')
          .eq('cliente_id', cliente.id)
          .eq('es_general', true)
          .single();
        if (errorProyecto || !proyecto) {
          throw new Error('El cliente se creó pero no se pudo localizar su proyecto. Ábrelo desde la ficha.');
        }
        return { cliente, proyectoId: proyecto.id as string };
      },
      {
        onExito: ({ cliente, proyectoId }) => {
          if (cliente.enCola || !proyectoId) {
            creacionCliente.establecerError('No se pudo confirmar el alta. Inténtalo de nuevo.');
            return;
          }
          navigate(`/planificar?clienteId=${cliente.id}&proyectoId=${proyectoId}`);
        },
      }
    );
  }

  // "Aún no sé cuándo": solo crea la ficha. Si se encoló (sin red), la
  // ficha aún no existe en el servidor, así que se vuelve al listado.
  async function crearSinVisita() {
    if (!nombre.trim() || creacionCliente.cargando) return;
    await creacionCliente.ejecutar(crearCliente, {
      onExito: (cliente) => navigate(cliente.enCola ? '/clientes' : `/clientes/${cliente.id}`),
    });
  }

  // Tocar un cliente ya existente: en vez de crear un duplicado, se arranca
  // la visita directamente sobre ese cliente. Si ya hay una visita en curso
  // con él se avisa antes; si no, va directo a la ventana "¿A qué vas?"
  // (el arranque real lo hace arrancarConObjetivo al confirmar).
  async function visitarExistente(clienteId: string, clienteNombre: string) {
    if (creacionCliente.cargando) return;
    const { data } = await supabase
      .from('visita')
      .select('id, objetivo')
      .eq('cliente_id', clienteId)
      .eq('estado_captura', 'en_curso')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setEnCursoModal({ visita: data, clienteId, clienteNombre });
    else setObjetivoModal({ modo: 'existente', clienteId, clienteNombre });
  }

  return (
    <div className="screen screen--split">
      <CabeceraDetalle titulo="Nuevo cliente" ayuda="alta-rapida-cliente" volverA={volver} />

      <div className="screen__scroll">
       <div className="lista-agrupada">
        <div style={{ paddingInline: 'var(--fila-pad-x)' }}>
          <div className="label" style={{ marginTop: 0 }}>Nombre</div>
          <input
            className={`field${creacionCliente.error ? ' field--error' : ''}`}
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="razón social"
          />
          {creacionCliente.error && <div className="field-error-text">{creacionCliente.error}</div>}
        </div>

        {coincidencias.length > 0 && (
          <SeccionLista titulo={hayExacto ? 'Ya existe un cliente con este nombre' : 'Ya existen clientes parecidos'}>
            {coincidencias.map((c) => (
              <FilaNavegable
                key={c.id}
                titulo={c.nombre}
                valor="iniciar visita"
                valorTenue
                disabled={creacionCliente.cargando}
                onClick={() => visitarExistente(c.id, c.nombre)}
              />
            ))}
          </SeccionLista>
        )}
        {hayExacto && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>
            Si es otro negocio con el mismo nombre, puedes crearlo igual con el botón de abajo.
          </div>
        )}

        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)', paddingInline: 'var(--fila-pad-x)' }}>
          El resto de la ficha (sector, tamaño, ubicación) se completa después.
        </p>
       </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          className="btn btn-primary"
          disabled={!nombre.trim() || creacionCliente.cargando}
          onClick={() => setObjetivoModal({ modo: 'nuevo' })}
        >
          Guardar e iniciar visita ahora
          <Icono nombre="chevron" size={18} />
        </button>
        <button
          className="btn btn-secondary"
          disabled={!nombre.trim() || creacionCliente.cargando}
          onClick={crearYPlanificar}
        >
          Guardar y planificar visita
        </button>
        <button
          type="button"
          disabled={!nombre.trim() || creacionCliente.cargando}
          onClick={crearSinVisita}
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--ink-400)',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          Guardar sin visita
        </button>
      </div>
      <AvisoTardando visible={creacionCliente.tardando} />

      {enCursoModal && (
        <VisitaEnCursoModal
          clienteNombre={enCursoModal.clienteNombre}
          objetivo={enCursoModal.visita.objetivo}
          onContinuar={() => navigate(`/visita/${enCursoModal.visita.id}`)}
          onEmpezarOtra={() => {
            const { clienteId, clienteNombre } = enCursoModal;
            setEnCursoModal(null);
            setObjetivoModal({ modo: 'existente', clienteId, clienteNombre });
          }}
          onCerrar={() => setEnCursoModal(null)}
        />
      )}

      {objetivoModal && (
        <ObjetivoVisitaModal
          clienteNombre={
            objetivoModal.modo === 'existente' ? objetivoModal.clienteNombre : nombre.trim() || undefined
          }
          proyectos={objetivoModal.modo === 'existente' ? proyectosExistente : undefined}
          proyectoInicial={proyectosExistente?.[0]?.id}
          onConfirmar={arrancarConObjetivo}
          onCerrar={() => setObjetivoModal(null)}
        />
      )}
    </div>
  );
}
