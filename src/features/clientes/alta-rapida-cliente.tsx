import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useSesionActual } from '@/hooks/use-sesion-actual';
import { useVisitaActivaContext } from '@/hooks/use-visita-activa-context';
import { useSyncQueue } from '@/hooks/use-sync-queue';
import { useAccionAsync } from '@/hooks/use-accion-async';
import { AvisoTardando } from '@/components/ui/aviso-tardando';
import { normalizarNombre, claveDuplicado } from '@/lib/nombres-cliente';

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

  // Todos los nombres de cliente que existen. La visibilidad de `cliente` no
  // está restringida por comercial (no hay "cartera" en el modelo, confirmado
  // el 24/8), así que esto también avisa de un duplicado que creó otro
  // compañero. Se traen una vez y se cruzan en el cliente: la coincidencia
  // ignora acentos sin SQL nuevo y no hay una consulta por cada tecla.
  const { data: clientesExistentes } = useQuery({
    queryKey: ['nombres-cliente-alta-rapida'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Array<{ id: string; nombre: string }>> => {
      const { data, error } = await supabase.from('cliente').select('id, nombre');
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

  const alIniciarVisita = {
    onExito: ({ visitaId, clienteNombre }: { visitaId: string; clienteNombre: string }) => {
      iniciarVisita({ id: visitaId, clienteNombre });
      navigate(`/visita/${visitaId}`);
    },
  };

  // Defensa explícita: sin pantalla de login construida todavía, `comercial`
  // puede no estar resuelto. Antes esto hacía que el botón no hiciera nada
  // de forma silenciosa — ahora se muestra como un error visible, mismo
  // patrón ya usado en OportunidadRapidaModal.
  async function crearCliente(): Promise<{ id: string; nombre: string }> {
    if (!comercial) {
      throw new Error('No se ha podido identificar tu sesión de comercial. Vuelve a iniciar sesión.');
    }
    const { data: cliente, error: errorCliente } = await supabase
      .from('cliente')
      .insert({ nombre: nombre.trim(), estado_relacion: 'borrador', creado_por: comercial.id })
      .select('id, nombre')
      .single();
    if (errorCliente || !cliente) {
      throw new Error(errorCliente?.message ?? 'No se pudo crear el cliente. Comprueba tu conexión.');
    }
    return cliente;
  }

  async function encolarVisita(clienteId: string, clienteNombre: string) {
    if (!comercial) {
      throw new Error('No se ha podido identificar tu sesión de comercial. Vuelve a iniciar sesión.');
    }
    const visitaId = crypto.randomUUID();
    await encolar(visitaId, 'visita', {
      clienteId,
      comercialResponsableId: comercial.id,
      tipoVisita: null,
    });
    return { visitaId, clienteNombre };
  }

  // "Estoy delante del cliente": crea la ficha y entra directo en captura.
  async function crearYVisitar() {
    if (!nombre.trim() || creacionCliente.cargando) return;
    await creacionCliente.ejecutar(async () => {
      const cliente = await crearCliente();
      return encolarVisita(cliente.id, cliente.nombre);
    }, alIniciarVisita);
  }

  // "Lo visito otro día": crea la ficha y abre en ella el formulario de
  // planificar (?planificar=1) — reutiliza toda la lógica que ya vive en
  // FichaCliente, sin duplicarla aquí.
  async function crearYPlanificar() {
    if (!nombre.trim() || creacionCliente.cargando) return;
    await creacionCliente.ejecutar(crearCliente, {
      onExito: (cliente) => navigate(`/clientes/${cliente.id}?planificar=1`),
    });
  }

  // "Aún no sé cuándo": solo crea la ficha.
  async function crearSinVisita() {
    if (!nombre.trim() || creacionCliente.cargando) return;
    await creacionCliente.ejecutar(crearCliente, {
      onExito: (cliente) => navigate(`/clientes/${cliente.id}`),
    });
  }

  // Tocar un cliente ya existente: en vez de crear un duplicado, se arranca
  // la visita directamente sobre ese cliente. Es lo que se quería casi
  // siempre al llegar aquí con un nombre que ya está.
  async function visitarExistente(clienteId: string, clienteNombre: string) {
    if (creacionCliente.cargando) return;
    await creacionCliente.ejecutar(() => encolarVisita(clienteId, clienteNombre), alIniciarVisita);
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
          onClick={crearYVisitar}
        >
          {creacionCliente.cargando ? 'Creando…' : 'Guardar e iniciar visita ahora →'}
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
    </div>
  );
}
