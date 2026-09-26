import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { uuid } from '@/lib/uuid';
import { esSinRed } from '@/lib/red';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { AvisoTardando } from '@/components/ui/aviso-tardando';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { SeccionLista } from '@/components/ui/seccion-lista';
import { FilaNavegable } from '@/components/ui/fila-navegable';
import { Icono } from '@/components/ui/iconos';
import { normalizarNombre, claveDuplicado, CLIENTE_ARCHIVADO } from '@/lib/nombres-cliente';
import { useVolverA } from '@/lib/volver-a';
import { ObjetivoVisitaModal } from '@/features/visita/objetivo-visita-modal';
import { crearProyectoRapido } from '@/lib/crear-proyecto-rapido';
import { VisitaEnCursoModal } from '@/features/visita/visita-en-curso-modal';
import { ResultadosCuentaCrm, textoCuentaCrm, type CuentaCrm } from '@/features/clientes/cuenta-crm';

// El alta crea cliente + primer proyecto: con red, en una transacción vía la
// RPC `crear_cliente_con_proyecto` (que sustituye al antiguo trigger del
// proyecto "General"); sin red, se encolan como `cliente` + `proyecto`
// encadenados (`dependeDe`), y la primera visita depende del proyecto. El
// `proyecto_id` de una visita ya no lo deriva el servidor: viaja explícito.

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
  // Un cliente nace con su primer proyecto (línea de negocio). Sin proyecto no
  // hay cliente: toda visita cuelga de uno.
  const [nombreProyecto, setNombreProyecto] = useState('');
  // Cuenta del CRM elegida en el buscador que sale bajo el nombre. Opcional:
  // un cliente que aún no está en el CRM (o un alta sin red) se crea sin ella
  // y se vincula luego con el lápiz de la ficha.
  const [cuentaCrm, setCuentaCrm] = useState<CuentaCrm | null>(null);
  const proyectoRef = useRef<HTMLInputElement>(null);

  // Elegir la cuenta es decir «es esta empresa»: el nombre pasa a ser el del
  // CRM (lo tecleado era solo para buscarla) y se salta al proyecto, que es lo
  // único que falta para guardar.
  function elegirCuentaCrm(c: CuentaCrm) {
    setCuentaCrm(c);
    setNombre(c.nombre);
    if (!nombreProyecto.trim()) proyectoRef.current?.focus();
  }
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
    | null
    | {
        visita: {
          id: string;
          objetivo: string | null;
          en_curso_desde: string | null;
          proyecto: { nombre: string } | null;
        };
        clienteId: string;
        clienteNombre: string;
      }
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
    queryFn: async (): Promise<Array<{ id: string; nombre: string; estado_relacion: string }>> => {
      const { data, error } = await supabase
        .from('cliente')
        .select('id, nombre, estado_relacion')
        .eq('estado_fusion', 'activo');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Proyectos del cliente existente que se va a visitar: si tiene 2+, la
  // ventana "¿A qué vas?" pide a cuál va la visita (mismo selector que desde
  // la ficha). Un cliente recién creado aquí solo tiene su primer proyecto,
  // así que no aplica.
  const clienteExistenteId =
    objetivoModal?.modo === 'existente' ? objetivoModal.clienteId : undefined;
  const { data: proyectosExistente } = useQuery({
    queryKey: ['proyectos-cliente-alta', clienteExistenteId],
    enabled: !!clienteExistenteId,
    queryFn: async (): Promise<Array<{ id: string; nombre: string; estado: string }>> => {
      const { data, error } = await supabase
        .from('proyecto')
        .select('id, nombre, estado')
        .eq('cliente_id', clienteExistenteId!)
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
  async function crearCliente(): Promise<{
    id: string;
    nombre: string;
    proyectoId: string;
    enCola: boolean;
  }> {
    if (!comercial) {
      throw new Error('No se ha podido identificar tu sesión de comercial. Vuelve a iniciar sesión.');
    }
    const clienteId = uuid();
    const proyectoId = uuid();
    const nombreLimpio = nombre.trim();
    const nombreProyectoLimpio = nombreProyecto.trim();

    if (navigator.onLine) {
      // Cliente + primer proyecto en una transacción (la RPC sustituye al
      // antiguo trigger que creaba un proyecto "General"). Devuelve el
      // proyecto_id, que se usa ya para la primera visita.
      const { data, error: errorCliente } = await supabase
        .rpc('crear_cliente_con_proyecto', {
          p_cliente_id: clienteId,
          p_nombre_cliente: nombreLimpio,
          p_nombre_proyecto: nombreProyectoLimpio,
          p_creado_por: comercial.id,
          // El que da de alta el cliente es su responsable de cartera.
          // Dirección lo reasigna después si hace falta.
          p_responsable_id: comercial.id,
          p_crm_accountid: cuentaCrm?.accountid,
        })
        .single();
      if (!errorCliente && data) {
        return { id: data.cliente_id, nombre: nombreLimpio, proyectoId: data.proyecto_id, enCola: false };
      }
      // Si el fallo no parece de red (RLS, validación de la RPC…), se muestra
      // tal cual — encolarlo solo lo escondería. Si parece de red, se encola.
      if (!esSinRed(errorCliente?.message)) {
        throw new Error(errorCliente?.message ?? 'No se pudo crear el cliente.');
      }
    }

    // Sin red: cliente → primer proyecto (depende del cliente) → la visita
    // que venga después dependerá de este proyecto. `proyecto_id` ya no lo
    // deriva el servidor: viaja explícito desde aquí.
    await encolar(clienteId, 'cliente', {
      nombre: nombreLimpio,
      creadoPor: comercial.id,
      responsableId: comercial.id,
      crmAccountid: cuentaCrm?.accountid,
    });
    await encolar(
      proyectoId,
      'proyecto',
      { clienteId, nombre: nombreProyectoLimpio },
      { dependeDe: clienteId }
    );
    return { id: clienteId, nombre: nombreLimpio, proyectoId, enCola: true };
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
      // Cliente recién creado: la visita va a su primer proyecto (el que se
      // acaba de teclear en el alta). Sin red, depende de ese proyecto en
      // cola, que a su vez depende del cliente.
      const cliente = await crearCliente();
      const r = await encolarVisita(
        cliente.id,
        cliente.nombre,
        objetivo,
        cliente.proyectoId,
        cliente.enCola ? cliente.proyectoId : undefined
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

  // "Lo visito otro día": crea la ficha (cliente + primer proyecto) y abre el
  // flujo de planificar apuntando a ese proyecto. Planificar necesita el
  // cliente y su proyecto ya en el servidor, así que este flujo exige conexión.
  async function crearYPlanificar() {
    if (!nombre.trim() || !nombreProyecto.trim() || creacionCliente.cargando) return;
    if (!navigator.onLine) {
      creacionCliente.establecerError(
        'Necesitas conexión para planificar una visita. Puedes iniciar la visita ahora o guardar sin visita.'
      );
      return;
    }
    await creacionCliente.ejecutar(crearCliente, {
      onExito: (cliente) => {
        if (cliente.enCola) {
          // El cliente (y su proyecto) YA se han guardado — en la cola local,
          // por un fallo de red al confirmar. Decir "inténtalo de nuevo" aquí
          // invitaba a repetir el alta entera y crear un cliente duplicado
          // con el mismo nombre en cuanto sincronizara el primero.
          creacionCliente.establecerError(
            'El cliente ya se ha guardado (pendiente de sincronizar) — no repitas el alta. Para planificar una visita necesitas conexión: vuelve a intentarlo desde su ficha cuando tengas red.'
          );
          return;
        }
        navigate(`/planificar?clienteId=${cliente.id}&proyectoId=${cliente.proyectoId}`);
      },
    });
  }

  // "Aún no sé cuándo": solo crea la ficha. Si se encoló (sin red), la
  // ficha aún no existe en el servidor, así que se vuelve al listado.
  async function crearSinVisita() {
    if (!nombre.trim() || !nombreProyecto.trim() || creacionCliente.cargando) return;
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
    // Archivado: sí se enseña (si no, se daría de alta otra vez), pero se va
    // a su ficha a reactivarlo en vez de arrancarle una visita a escondidas.
    if (clientesExistentes?.some((c) => c.id === clienteId && c.estado_relacion === CLIENTE_ARCHIVADO)) {
      navigate(`/clientes/${clienteId}`);
      return;
    }
    const { data } = await supabase
      .from('visita')
      .select('id, objetivo, en_curso_desde, proyecto:proyecto_id(nombre)')
      .eq('cliente_id', clienteId)
      .eq('estado_captura', 'en_curso')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      const v = data as unknown as {
        id: string;
        objetivo: string | null;
        en_curso_desde: string | null;
        proyecto: { nombre: string } | null;
      };
      setEnCursoModal({ visita: v, clienteId, clienteNombre });
    } else {
      setObjetivoModal({ modo: 'existente', clienteId, clienteNombre });
    }
  }

  return (
    <div className="screen screen--split">
      <CabeceraDetalle titulo="Nuevo cliente" ayuda="alta-rapida-cliente" volverA={volver} />

      <div className="screen__scroll">
       <div className="lista-agrupada">
        <div style={{ paddingInline: 'var(--fila-pad-x)' }}>
          <div className="label" style={{ marginTop: 0 }}>Nombre del cliente</div>
          <input
            className={`field${creacionCliente.error ? ' field--error' : ''}`}
            autoFocus
            // `autoComplete="off"` no basta aquí: iOS igual ofrece "Autorrellenar
            // contacto" (tu propia ficha) porque interpreta "Nombre del cliente"
            // como un campo de nombre de persona — confirmado en el móvil real
            // (13 sept). Es el nombre de una EMPRESA, no de un contacto. Un valor
            // no reconocido ("nope") evita que Safari lo empareje con ese patrón.
            autoComplete="nope"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="razón social"
          />

          <div className="label">Primer proyecto</div>
          <input
            ref={proyectoRef}
            className="field"
            autoComplete="off"
            value={nombreProyecto}
            onChange={(e) => setNombreProyecto(e.target.value)}
            placeholder="p. ej. Mantenimiento, Obra nueva, Postventa…"
          />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', marginTop: 4 }}>
            Un cliente siempre tiene al menos un proyecto (línea de negocio). Cada visita cuelga de uno.
          </div>

          {creacionCliente.error && <div className="field-error-text">{creacionCliente.error}</div>}
        </div>

        {/* El campo de nombre hace de buscador del CRM: al elegir una cuenta
            desaparecen los resultados, queda solo la elegida y el nombre pasa
            a ser el suyo (elegirCuentaCrm). Una cuenta que ya tiene cliente
            lleva a ese cliente, como las coincidencias. */}
        {cuentaCrm ? (
          <SeccionLista titulo="Cuenta en el CRM">
            <FilaNavegable
              titulo={textoCuentaCrm(cuentaCrm)}
              valor="quitar"
              valorTenue
              chevron={false}
              disabled={creacionCliente.cargando}
              onClick={() => setCuentaCrm(null)}
            />
          </SeccionLista>
        ) : (
          <ResultadosCuentaCrm
            texto={nombre}
            disabled={creacionCliente.cargando}
            onElegir={(c, cliente) => (cliente ? visitarExistente(cliente.id, cliente.nombre) : elegirCuentaCrm(c))}
          />
        )}

        {coincidencias.length > 0 && (
          <SeccionLista titulo={hayExacto ? 'Ya existe un cliente con este nombre' : 'Ya existen clientes parecidos'}>
            {coincidencias.map((c) => (
              <FilaNavegable
                key={c.id}
                titulo={c.nombre}
                valor={c.estado_relacion === CLIENTE_ARCHIVADO ? 'archivado' : 'iniciar visita'}
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
          disabled={!nombre.trim() || !nombreProyecto.trim() || creacionCliente.cargando}
          onClick={() => setObjetivoModal({ modo: 'nuevo' })}
        >
          Guardar e iniciar visita ahora
          <Icono nombre="chevron" size={18} />
        </button>
        <button
          className="btn btn-secondary"
          disabled={!nombre.trim() || !nombreProyecto.trim() || creacionCliente.cargando}
          onClick={crearYPlanificar}
        >
          Guardar y planificar visita
        </button>
        <button
          type="button"
          disabled={!nombre.trim() || !nombreProyecto.trim() || creacionCliente.cargando}
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
          proyectoNombre={enCursoModal.visita.proyecto?.nombre ?? null}
          enCursoDesde={enCursoModal.visita.en_curso_desde}
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
          onCrearProyecto={
            objetivoModal.modo === 'existente'
              ? (nombreProy) => crearProyectoRapido(objetivoModal.clienteId, nombreProy, encolar)
              : undefined
          }
          onConfirmar={arrancarConObjetivo}
          onCerrar={() => setObjetivoModal(null)}
        />
      )}
    </div>
  );
}
