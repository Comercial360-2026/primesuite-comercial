import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { uuid } from '@/lib/uuid';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { AvisoTardando } from '@/components/ui/aviso-tardando';
import { CabeceraDetalle } from '@/components/ui/cabecera-detalle';
import { Icono } from '@/components/ui/iconos';
import { normalizarNombre, claveDuplicado } from '@/lib/nombres-cliente';
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

  const [nombre, setNombre] = useState('');
  const creacionCliente = useAccionAsync();

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

  // Nombres de los clientes activos. La visibilidad de `cliente` no está
  // restringida por comercial (no hay "cartera" en el modelo, confirmado el
  // 24/8), así que esto también avisa de un duplicado que creó otro
  // compañero. Se excluyen los ya fusionados: son fichas muertas y ofrecer
  // "iniciar visita" sobre ellas llevaría a un cliente que ya no existe.
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
  // patrón ya usado en OportunidadRapidaModal.
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
        .insert({ id: clienteId, nombre: nombreLimpio, estado_relacion: 'borrador', creado_por: comercial.id })
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

    await encolar(clienteId, 'cliente', { nombre: nombreLimpio, creadoPor: comercial.id });
    return { id: clienteId, nombre: nombreLimpio, enCola: true };
  }

  async function encolarVisita(
    clienteId: string,
    clienteNombre: string,
    objetivo: string,
    dependeDe?: string
  ) {
    if (!comercial) {
      throw new Error('No se ha podido identificar tu sesión de comercial. Vuelve a iniciar sesión.');
    }
    const visitaId = uuid();
    await encolar(
      visitaId,
      'visita',
      { clienteId, comercialResponsableId: comercial.id, tipoVisita: null, objetivo },
      dependeDe ? { dependeDe } : undefined
    );
    return { visitaId, clienteNombre };
  }

  // "Estoy delante del cliente": la ventana "¿A qué vas?" recoge el objetivo
  // (obligatorio) y, al confirmar, se crea la ficha y se entra directo en
  // captura. Si el cliente se encoló (sin red), la visita depende de él.
  async function arrancarConObjetivo(objetivo: string) {
    if (!objetivoModal || !comercial) return;
    let visitaId: string;
    let clienteNombre: string;
    if (objetivoModal.modo === 'nuevo') {
      const cliente = await crearCliente();
      const r = await encolarVisita(
        cliente.id,
        cliente.nombre,
        objetivo,
        cliente.enCola ? cliente.id : undefined
      );
      visitaId = r.visitaId;
      clienteNombre = r.clienteNombre;
    } else {
      const r = await encolarVisita(objetivoModal.clienteId, objetivoModal.clienteNombre, objetivo);
      visitaId = r.visitaId;
      clienteNombre = r.clienteNombre;
    }
    iniciarVisita({ id: visitaId, clienteNombre });
    navigate(`/visita/${visitaId}`);
  }

  // "Lo visito otro día": crea la ficha y abre en ella el formulario de
  // planificar (?planificar=1). Planificar necesita el cliente ya en el
  // servidor, así que este flujo exige conexión.
  async function crearYPlanificar() {
    if (!nombre.trim() || creacionCliente.cargando) return;
    if (!navigator.onLine) {
      creacionCliente.establecerError(
        'Necesitas conexión para planificar una visita. Puedes iniciar la visita ahora o guardar sin visita.'
      );
      return;
    }
    await creacionCliente.ejecutar(crearCliente, {
      onExito: (cliente) => {
        if (cliente.enCola) {
          creacionCliente.establecerError('No se pudo confirmar el alta. Inténtalo de nuevo.');
          return;
        }
        navigate(`/clientes/${cliente.id}?planificar=1`);
      },
    });
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
    <div className="screen">
      <CabeceraDetalle titulo="Nuevo cliente" ayuda="alta-rapida-cliente" onVolver={() => navigate(-1)} />

      <div className="label" style={{ marginTop: 0 }}>nombre</div>
      <input
        className={`field${creacionCliente.error ? ' field--error' : ''}`}
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="razón social"
      />
      {creacionCliente.error && <div className="field-error-text">{creacionCliente.error}</div>}

      {coincidencias.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <div
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: hayExacto ? 600 : 400,
              color: hayExacto ? 'var(--warning-600)' : 'var(--ink-400)',
            }}
          >
            {hayExacto ? 'Ya existe un cliente con este nombre:' : 'Ya existen clientes parecidos:'}
          </div>
          {coincidencias.map((c) => (
            <div
              key={c.id}
              className="card"
              style={{
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                opacity: creacionCliente.cargando ? 0.5 : 1,
              }}
              onClick={() => visitarExistente(c.id, c.nombre)}
            >
              <span style={{ fontSize: 'var(--text-base)' }}>{c.nombre}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)', flexShrink: 0 }}>
                iniciar visita →
              </span>
            </div>
          ))}
          {hayExacto && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-400)' }}>
              Si es otro negocio con el mismo nombre, puedes crearlo igual con el botón de abajo.
            </div>
          )}
        </div>
      )}

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-400)' }}>
        El resto de la ficha (sector, tamaño, ubicación) se completa después.
      </p>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          onConfirmar={arrancarConObjetivo}
          onCerrar={() => setObjetivoModal(null)}
        />
      )}
    </div>
  );
}
