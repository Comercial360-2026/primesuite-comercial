// supabase/functions/generar-briefing-cliente/index.ts
//
// Briefing de cliente a partir de tickets reales de Jira, SIN IA (decisión
// de Cesar: no paga la API de Anthropic para esto — ver
// primesuite-briefing-jira-sin-ia-plan.md). El briefing se arma con reglas
// de código sobre los campos de los tickets (prioridad, estado, texto).
//
// Contrato (POST JSON):
//   { accion: 'generar', cliente_id: string } -> Briefing (ver abajo)
//
// El nombre del cliente NO lo manda el cliente de la app como texto libre:
// se resuelve aquí consultando `cliente.nombre` con el propio token del
// usuario (no con la clave de servicio), así la RLS de `cliente` decide si
// el comercial puede ver ese cliente antes de construir ninguna consulta a
// Jira. Igual que `gestionar-comercial`: CORS + POST + `accion`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Palabras clave por sección — coincidencia flexible (minúsculas, varios
// sinónimos) porque los nombres EXACTOS de estado/prioridad de este Jira
// (Primion) no estaban confirmados al diseñar esto.
const PRIORIDADES_CRITICAS = ['highest', 'urgent', 'urgente', 'p1', 'p2', 'crítica', 'critica', 'bloqueante'];
const ESTADOS_CERRADOS = ['done', 'closed', 'resolved', 'resuelto', 'resuelta', 'cerrado', 'cerrada', 'cancelado', 'cancelada'];
const ESTADOS_EN_CURSO = ['in progress', 'progreso', 'en curso', 'open', 'abierto', 'abierta', 'to do', 'por hacer', 'pendiente', 'reopened', 'reabierto'];
const ESTADOS_ESPERANDO_NOSOTROS = ['waiting for support', 'esperando soporte', 'esperando primion', 'pending', 'en revisión', 'en revision', 'review', 'bloqueado', 'bloqueada'];
const ESTADOS_ESPERANDO_CLIENTE = ['waiting for customer', 'esperando cliente', 'esperando al cliente'];
const PALABRAS_CONTEXTO_COMERCIAL = ['renovación', 'renovacion', 'contrato', 'propuesta', 'presupuesto', 'vencimiento', 'renovar'];

interface CampoJira {
  summary?: string;
  description?: unknown;
  status?: { name?: string };
  priority?: { name?: string };
  issuetype?: { name?: string };
  updated?: string;
  resolution?: { name?: string } | null;
}
interface TicketJira {
  key: string;
  resumen: string;
  estado: string;
  prioridad: string;
  tipo: string;
  actualizado: string;
  textoBusqueda: string; // resumen + descripción en texto plano, en minúsculas
}

// La descripción en la API v3 de Jira viene en ADF (Atlassian Document
// Format, un árbol de nodos), no como texto plano. Solo hace falta el texto
// para buscar palabras clave, así que se recorre el árbol recogiendo los
// nodos `text` — no hace falta ni falta un parser completo de ADF.
function textoPlanoDeADF(nodo: unknown): string {
  if (!nodo || typeof nodo !== 'object') return '';
  const n = nodo as Record<string, unknown>;
  let texto = typeof n.text === 'string' ? n.text : '';
  if (Array.isArray(n.content)) {
    texto += ' ' + n.content.map(textoPlanoDeADF).join(' ');
  }
  return texto;
}

function contieneAlguna(texto: string, lista: string[]): boolean {
  return lista.some((palabra) => texto.includes(palabra));
}

interface Briefing {
  ok: true;
  sinTickets: boolean;
  totalTickets: number;
  generadoEn: string;
  criticos: { key: string; resumen: string; estado: string; prioridad: string }[];
  incidenciasActivas: { key: string; resumen: string; estado: string }[];
  estadoGeneral: { nivel: 'Bien' | 'Regular' | 'Mal'; texto: string };
  contextoComercial: string;
  queEspera: { texto: string; tickets: { key: string; resumen: string }[] };
  recomendacion: string;
}

function construirBriefing(tickets: TicketJira[]): Briefing {
  const abiertos = tickets.filter((t) => !ESTADOS_CERRADOS.includes(t.estado));

  const criticos = abiertos.filter((t) => PRIORIDADES_CRITICAS.includes(t.prioridad));
  const criticosKeys = new Set(criticos.map((t) => t.key));

  const incidenciasActivas = abiertos.filter(
    (t) => !criticosKeys.has(t.key) && ESTADOS_EN_CURSO.includes(t.estado)
  );

  let nivel: Briefing['estadoGeneral']['nivel'];
  let textoEstado: string;
  if (criticos.length > 0) {
    nivel = 'Mal';
    textoEstado = `${criticos.length} ticket${criticos.length === 1 ? '' : 's'} crítico${criticos.length === 1 ? '' : 's'} sin cerrar.`;
  } else if (incidenciasActivas.length >= 3) {
    nivel = 'Regular';
    textoEstado = `${incidenciasActivas.length} incidencias activas, ninguna crítica.`;
  } else {
    nivel = 'Bien';
    textoEstado = abiertos.length === 0 ? 'Sin tickets abiertos.' : 'Sin incidencias críticas ni volumen relevante abierto.';
  }

  const conContexto = abiertos.filter((t) => contieneAlguna(t.textoBusqueda, PALABRAS_CONTEXTO_COMERCIAL));
  const contextoComercial =
    conContexto.length === 0
      ? 'Sin novedades.'
      : `Menciones de renovación/contrato/propuesta en: ${conContexto.map((t) => t.key).join(', ')}.`;

  // "Qué espera el cliente" — si hay tickets en un estado que sugiera que la
  // pelota está en nuestro tejado, esos; si no, los abiertos más antiguos
  // sin actividad reciente (fallback documentado en el diseño).
  const esperandoNosotros = abiertos.filter(
    (t) => ESTADOS_ESPERANDO_NOSOTROS.includes(t.estado) && !ESTADOS_ESPERANDO_CLIENTE.includes(t.estado)
  );
  const baseQueEspera = esperandoNosotros.length > 0
    ? esperandoNosotros
    : [...abiertos].sort((a, b) => a.actualizado.localeCompare(b.actualizado)).slice(0, 5);
  const queEspera = {
    texto:
      esperandoNosotros.length > 0
        ? 'Tickets a la espera de una acción nuestra:'
        : baseQueEspera.length > 0
          ? 'Sin un estado claro de "a la espera"; estos son los abiertos más antiguos sin actividad reciente:'
          : 'Sin tickets abiertos pendientes.',
    tickets: baseQueEspera.map((t) => ({ key: t.key, resumen: t.resumen })),
  };

  let recomendacion: string;
  if (nivel === 'Mal') {
    recomendacion = 'Hay incidencias críticas abiertas: prioriza resolverlas antes de tratar nuevas peticiones.';
  } else if (nivel === 'Regular') {
    recomendacion = 'Varias incidencias activas: conviene dar seguimiento cercano en esta visita.';
  } else {
    recomendacion = 'Sin incidencias relevantes abiertas: buen momento para hablar de nuevas oportunidades.';
  }

  return {
    ok: true,
    sinTickets: tickets.length === 0,
    totalTickets: tickets.length,
    generadoEn: new Date().toISOString(),
    criticos: criticos.map((t) => ({ key: t.key, resumen: t.resumen, estado: t.estado, prioridad: t.prioridad })),
    incidenciasActivas: incidenciasActivas.map((t) => ({ key: t.key, resumen: t.resumen, estado: t.estado })),
    estadoGeneral: { nivel, texto: textoEstado },
    contextoComercial,
    queEspera,
    recomendacion,
  };
}

// JQL con el nombre del cliente entre comillas dobles: escapar backslash y
// comillas para no romper la consulta ni permitir inyectar cláusulas JQL
// propias a partir de un nombre de cliente con caracteres raros.
function escaparParaJql(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const TIMEOUT_JIRA_MS = 15_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Cuerpo de la petición inválido' }, 400);
  }
  if (body.accion !== 'generar') return jsonResponse({ error: 'Acción no reconocida' }, 400);

  const clienteId = String(body.cliente_id ?? '');
  if (!clienteId) return jsonResponse({ error: 'Falta el cliente.' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const jiraBaseUrl = Deno.env.get('JIRA_BASE_URL');
  const jiraEmail = Deno.env.get('JIRA_EMAIL');
  const jiraApiToken = Deno.env.get('JIRA_API_TOKEN');
  if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) {
    return jsonResponse({ error: 'La integración con Jira no está configurada.' }, 500);
  }

  // --------------------------------------------------------- AUTORIZACIÓN
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'No autenticado' }, 401);

  const clienteUsuario = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await clienteUsuario.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: 'Sesión no válida' }, 401);

  // Se consulta `cliente` CON el token del usuario (no con clave de
  // servicio): si la RLS no le deja ver este cliente, aquí no aparece y no
  // se llega a construir ninguna consulta a Jira con su nombre.
  const { data: cliente, error: errCliente } = await clienteUsuario
    .from('cliente')
    .select('nombre')
    .eq('id', clienteId)
    .single();
  if (errCliente || !cliente?.nombre) {
    return jsonResponse({ error: 'No se encontró el cliente o no tienes acceso.' }, 404);
  }

  // --------------------------------------------------------------- JIRA
  const jql = `(summary ~ "${escaparParaJql(cliente.nombre)}" OR description ~ "${escaparParaJql(cliente.nombre)}") ORDER BY updated DESC`;
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_JIRA_MS);

  let respuestaJira: Response;
  try {
    respuestaJira = await fetch(`${jiraBaseUrl.replace(/\/$/, '')}/rest/api/3/search`, {
      method: 'POST',
      signal: controlador.signal,
      headers: {
        Authorization: `Basic ${btoa(`${jiraEmail}:${jiraApiToken}`)}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jql,
        maxResults: 30,
        fields: ['summary', 'description', 'status', 'priority', 'issuetype', 'updated', 'resolution'],
      }),
    });
  } catch (err) {
    const esAbort = err instanceof DOMException && err.name === 'AbortError';
    return jsonResponse(
      { error: esAbort ? 'Jira ha tardado demasiado en responder.' : 'No se pudo conectar con Jira.' },
      502
    );
  } finally {
    clearTimeout(temporizador);
  }

  if (!respuestaJira.ok) {
    // No se traslada el cuerpo de error de Jira tal cual (podría filtrar
    // detalles internos); solo el código, suficiente para diagnosticar.
    return jsonResponse({ error: `Jira respondió con un error (${respuestaJira.status}).` }, 502);
  }

  let cuerpoJira: { issues?: { key: string; fields: CampoJira }[] };
  try {
    cuerpoJira = await respuestaJira.json();
  } catch {
    return jsonResponse({ error: 'Jira devolvió una respuesta inesperada.' }, 502);
  }

  const tickets: TicketJira[] = (cuerpoJira.issues ?? []).map((issue) => {
    const f = issue.fields ?? {};
    const resumen = f.summary ?? '(sin resumen)';
    const descripcionTexto = textoPlanoDeADF(f.description).toLowerCase();
    return {
      key: issue.key,
      resumen,
      estado: (f.status?.name ?? '').toLowerCase(),
      prioridad: (f.priority?.name ?? '').toLowerCase(),
      tipo: f.issuetype?.name ?? '',
      actualizado: f.updated ?? '',
      textoBusqueda: `${resumen.toLowerCase()} ${descripcionTexto}`,
    };
  });

  return jsonResponse(construirBriefing(tickets));
});
