// supabase/functions/_shared/informe-pdf.ts
//
// Piezas comunes a los dos informes PDF de PrimeNotes:
//   - generar-backup-visita   (zip con informe.pdf de UNA visita + adjuntos)
//   - generar-informe-proyecto (PDF de UN proyecto con sus N visitas)
//
// Aquí vive todo lo que NO puede divergir entre ambos: la marca (COLOR,
// logo, fuente), los diccionarios de negocio (etiquetas legibles de los
// enum de texto libre) y los bloques de maquetación reutilizables
// (tabla de oportunidades, lista de hallazgos, tabla de próximos pasos).
// Cada informe compone luego su propia portada y su propio orden de
// secciones con estas piezas.
//
// Motor del PDF: pdfmake (ver la nota larga en generar-backup-visita sobre
// por qué no @react-pdf/renderer). La fuente Roboto se pisa con una versión
// sin ligaduras para que Ctrl+F / copiar-pegar / lector de pantalla no se
// coman letras (scripts/fuentes-informe/README.md).

// @ts-ignore — default export presente en runtime aunque el .d.ts de esm.sh diga que no
import pdfMake from 'https://esm.sh/pdfmake@0.2.10/build/pdfmake.js';
// @ts-ignore — idem
import pdfFonts from 'https://esm.sh/pdfmake@0.2.10/build/vfs_fonts.js';
import { ROBOTO_SIN_LIGADURAS } from './roboto-sin-ligaduras.ts';
import { PRIMION_LOGO } from './primion-logo.ts';

export { pdfMake, PRIMION_LOGO };

// vfs_fonts.js expone el objeto de fuentes en una forma u otra según cómo lo
// resuelva esm.sh — cubrimos las dos. Pisamos las 4 caras de Roboto con la
// versión de tabla GSUB recortada (sin liga/dlig). pdfmake mapea la familia
// 'Roboto' a estos mismos nombres de fichero, así que no hay que tocar
// `pdfMake.fonts` ni `defaultStyle`.
// deno-lint-ignore no-explicit-any
const _fonts = pdfFonts as any;
const _vfsStock = _fonts.pdfMake ? _fonts.pdfMake.vfs : _fonts.vfs;
// deno-lint-ignore no-explicit-any
(pdfMake as any).vfs = { ..._vfsStock, ...ROBOTO_SIN_LIGADURAS };

// ---------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------
// Marca — espejo 1:1 de src/styles/tokens.css. Cualquier cambio de marca se
// hace allí primero y se copia aquí (el PDF no puede importar el CSS).
// ---------------------------------------------------------------------

export const COLOR = {
  ink900: '#161A1E',
  ink700: '#3D4450',
  ink400: '#7C8492',
  ink200: '#D4D8DE',
  ink100: '#E8EAED',
  brand600: '#1A3654',
  brand700: '#13283F',
  signal600: '#EF4136',
  risk600: '#6E2430',
  purple600: '#6E4C9E',
  success600: '#3A7D4F',
  warning600: '#A87A12',
  warning050: '#F5EFE0',
  danger600: '#B23A3A',
};

// ---------------------------------------------------------------------
// Diccionario de negocio — etiquetas legibles de los enum de texto libre.
// ---------------------------------------------------------------------

export const ETAPA_LABEL: Record<string, string> = {
  latente: 'Idea',
  cualificada: 'Interés',
  en_propuesta: 'En propuesta',
  cerrada: 'Cerrada',
};

export const PRIORIDAD_LABEL: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', estrategica: 'Estratégica' };
export const PRIORIDAD_ORDEN: Record<string, number> = { estrategica: 0, alta: 1, media: 2, baja: 3 };

export const HORIZONTE_LABEL: Record<string, string> = {
  '0-3 meses': '0–3 meses',
  '3-6 meses': '3–6 meses',
  '6-12 meses': '6–12 meses',
  'mas de 12 meses': 'Más de 12 meses',
  'sin fecha definida': 'Sin fecha definida',
};

export const ESTADO_PASO_LABEL: Record<string, string> = { pendiente: 'Pendiente', completado: 'Hecho', cancelado: 'Cancelado' };

export const TIPO_VISITA_LABEL: Record<string, string> = {
  comercial: 'Comercial',
  demo: 'Demostración',
  tecnica: 'Técnica',
  seguimiento: 'Seguimiento',
  relacion: 'Relación',
};
// Frase completa para la línea de portada ("Visita de seguimiento", no "Visita seguimiento").
export const TIPO_VISITA_FRASE: Record<string, string> = {
  comercial: 'Visita comercial',
  demo: 'Visita de demostración',
  tecnica: 'Visita técnica',
  seguimiento: 'Visita de seguimiento',
  relacion: 'Visita de relación',
};

export const TIPO_FECHA_LABEL: Record<string, string> = {
  vencimiento_contrato: 'Vencimiento de contrato',
  renovacion: 'Renovación',
  auditoria: 'Auditoría',
  presupuesto: 'Presupuesto',
  implantacion: 'Implantación',
  otro: 'Otro',
};

export const FRANJA_LABEL: Record<string, string> = { manana: 'mañana', tarde: 'tarde' };

// ---------------------------------------------------------------------
// Helpers de texto y fecha
// ---------------------------------------------------------------------

export function capitalizar(texto: string) {
  const limpio = texto.replace(/_/g, ' ');
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

export function etiqueta(mapa: Record<string, string>, valor: string | null | undefined): string {
  if (!valor) return '—';
  return mapa[valor] ?? capitalizar(valor);
}

export function fechaLarga(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
export function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
export function horaDe(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
export function mesesEntre(desdeISO: string, hastaISO: string): number {
  const a = new Date(desdeISO).getTime();
  const b = new Date(hastaISO).getTime();
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24 * 30.44)));
}
export function textoHaceMeses(meses: number): string {
  if (meses <= 0) return 'este mismo mes';
  if (meses === 1) return 'hace 1 mes';
  return `hace ${meses} meses`;
}

export function hoyLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
export function esVencido(fechaObjetivo: string | null, estado: string): boolean {
  if (!fechaObjetivo || estado !== 'pendiente') return false;
  const f = new Date(fechaObjetivo);
  f.setHours(0, 0, 0, 0);
  return f < hoyLocal();
}

export function nombreArchivoLegible(texto: string | null | undefined, reserva: string): string {
  const base = (texto ?? '').trim() || reserva;
  return base.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// ---------------------------------------------------------------------
// Formas de fila — el type-checker de supabase-js no infiere bien un select
// con recursos embebidos, así que cada consulta se castea a estas formas.
// ---------------------------------------------------------------------

export interface Nombrado {
  nombre: string;
}
export interface OportunidadRow {
  id: string;
  titulo: string;
  descripcion: string | null;
  etapa: string;
  prioridad: string;
  valor_estimado: number | null;
  horizonte_decision: string | null;
}
export interface PasoRow {
  id: string;
  descripcion: string;
  fecha_objetivo: string | null;
  estado: string;
  comercial_responsable: Nombrado | null;
}
// Un "área" del hallazgo (PM11 Fase 2): o una categoría del catálogo
// ("Hardware") o un término concreto ("MIFARE › DESFire EV2"). Un hallazgo
// tiene varias. Quien construye el HallazgoRow resuelve el `nombre` desde la
// tabla puente `hallazgo_area` (con la ruta "Padre › Hijo" para los modelos).
export interface AreaHallazgoRow {
  tipo: 'categoria' | 'termino';
  nombre: string;
}
export interface HallazgoRow {
  id: string;
  nota: string | null;
  creado_en: string;
  fecha_relevante: string | null;
  tipo_fecha_relevante: string | null;
  areas: AreaHallazgoRow[];
  zona_texto: string | null;
  ubicacion: Nombrado | null;
}

// Quién estuvo en la visita: el responsable (uno), los acompañantes que
// aceptaron (los 'pendiente'/'rechazado' no cuentan) y los interlocutores del
// cliente con quien se habló. Ambos informes (visita y proyecto) muestran lo
// mismo con `filasQuienes`.
export interface ParticipanteRow {
  rol: string;
  estado: string;
  comercial: Nombrado | null;
}
export interface InterlocutorRow {
  interlocutor: { nombre: string; cargo: string | null } | null;
}
export interface FotoUbicacionRow {
  titulo: string | null;
  latitud: number | null;
  longitud: number | null;
}

// Convierte el recurso embebido `hallazgo_area(categoria(nombre),
// termino(nombre, parent(nombre)))` de un select de supabase-js en la lista
// `areas` de un HallazgoRow. Los dos informes lo usan igual.
export function areasDeFilaHallazgo(hallazgoArea: unknown): AreaHallazgoRow[] {
  const filas = (hallazgoArea ?? []) as {
    categoria: { nombre: string } | null;
    termino: { nombre: string; parent: { nombre: string } | null } | null;
  }[];
  const areas: AreaHallazgoRow[] = [];
  for (const f of filas) {
    if (f.categoria) {
      areas.push({ tipo: 'categoria', nombre: f.categoria.nombre });
    } else if (f.termino) {
      areas.push({
        tipo: 'termino',
        nombre: f.termino.parent ? `${f.termino.parent.nombre} › ${f.termino.nombre}` : f.termino.nombre,
      });
    }
  }
  // Términos (más precisos) antes que categorías sueltas.
  areas.sort((a, b) => (a.tipo === 'termino' ? 0 : 1) - (b.tipo === 'termino' ? 0 : 1));
  return areas;
}

// ---------------------------------------------------------------------
// Piezas de maquetación pdfmake reutilizables
// ---------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
export const layoutTabla: any = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 ? 0 : i === 1 ? 1 : i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: (i: number) => (i === 1 ? COLOR.ink200 : COLOR.ink100),
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 5,
  paddingBottom: () => 5,
};

// deno-lint-ignore no-explicit-any
export function chip(texto: string, color: string): any {
  return { table: { body: [[{ text: texto, color: '#FFFFFF', fillColor: color, bold: true, fontSize: 7.5, margin: [5, 2, 5, 2] }]] }, layout: 'noBorders' };
}

// deno-lint-ignore no-explicit-any
export function estadoVacio(texto: string): any {
  return { text: texto, italics: true, color: COLOR.ink400, fontSize: 9.5, margin: [0, 2, 0, 4] };
}

// Fila de KPIs con recuadro: N celdas de igual ancho, cifra grande arriba y
// etiqueta pequeña debajo. `alerta` pinta la cifra en rojo. Misma maqueta en
// el resumen ejecutivo del informe de visita y en el del proyecto.
// deno-lint-ignore no-explicit-any
export function filaKPIs(items: { valor: string; etiqueta: string; alerta?: boolean }[]): any {
  return {
    margin: [0, 6, 0, 12],
    table: {
      widths: items.map(() => '*'),
      body: [
        items.map((it) => ({
          stack: [
            { text: it.valor, bold: true, fontSize: 17, color: it.alerta ? COLOR.danger600 : COLOR.brand700 },
            { text: it.etiqueta, fontSize: 8, color: COLOR.ink400, margin: [0, 3, 0, 0] },
          ],
          margin: [10, 8, 10, 8],
        })),
      ],
    },
    layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => COLOR.ink200, vLineColor: () => COLOR.ink200 },
  };
}

// Numerador de secciones "01 / 02 / …" con su regla inferior. Devuelve una
// función con estado propio (el contador), así que hay que crear una por
// documento. Misma maqueta en el informe de visita y en el de proyecto.
export function crearNumeradorSecciones() {
  let contadorSeccion = 0;
  // deno-lint-ignore no-explicit-any
  return function tituloSeccion(texto: string, extra?: string): any {
    contadorSeccion += 1;
    const numero = String(contadorSeccion).padStart(2, '0');
    return {
      unbreakable: true,
      margin: [0, contadorSeccion === 1 ? 0 : 20, 0, 10],
      stack: [
        {
          columns: [
            // margen superior en el número para bajarlo a la línea base del
            // título (fontSize 10 vs 13.5).
            { width: 22, text: numero, color: COLOR.brand600, bold: true, fontSize: 10, margin: [0, 3, 0, 0] },
            {
              width: '*',
              text: [
                { text: texto, bold: true, fontSize: 13.5, color: COLOR.ink900 },
                extra ? { text: `  ${extra}`, fontSize: 10, color: COLOR.ink400 } : null,
              ].filter(Boolean),
            },
          ],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 499, y2: 4, lineWidth: 1, lineColor: COLOR.ink200 }] },
      ],
    };
  };
}

// Tabla de oportunidades. `ordenadas` ya viene con el orden que quiera quien
// llama (por prioridad en el informe de visita); aquí solo se maqueta y se
// suma el total.
// deno-lint-ignore no-explicit-any
export function tablaOportunidades(ordenadas: OportunidadRow[]): any {
  const total = ordenadas.reduce((suma, o) => suma + (o.valor_estimado ?? 0), 0);
  return {
    table: {
      headerRows: 1,
      widths: ['*', 70, 60, 60, 75],
      body: [
        [
          { text: 'OPORTUNIDAD', fontSize: 8, bold: true, color: COLOR.ink400 },
          { text: 'ETAPA', fontSize: 8, bold: true, color: COLOR.ink400 },
          { text: 'PRIORIDAD', fontSize: 8, bold: true, color: COLOR.ink400 },
          { text: 'VALOR', fontSize: 8, bold: true, color: COLOR.ink400, alignment: 'right' },
          { text: 'HORIZONTE', fontSize: 8, bold: true, color: COLOR.ink400 },
        ],
        ...ordenadas.map((o) => [
          {
            stack: [
              { text: o.titulo, bold: true, fontSize: 10 },
              o.descripcion ? { text: o.descripcion, fontSize: 8.5, color: COLOR.ink400, margin: [0, 2, 0, 0] } : null,
            ].filter(Boolean),
          },
          { text: etiqueta(ETAPA_LABEL, o.etapa), fontSize: 9.5 },
          {
            text: etiqueta(PRIORIDAD_LABEL, o.prioridad),
            fontSize: 9.5,
            bold: o.prioridad === 'estrategica' || o.prioridad === 'alta',
            color: o.prioridad === 'estrategica' ? COLOR.signal600 : o.prioridad === 'alta' ? COLOR.warning600 : COLOR.ink700,
          },
          { text: o.valor_estimado != null ? `${o.valor_estimado.toLocaleString('es-ES')} €` : '—', fontSize: 9.5, alignment: 'right' },
          { text: etiqueta(HORIZONTE_LABEL, o.horizonte_decision), fontSize: 9.5 },
        ]),
        [
          { text: 'Total estimado', bold: true, fontSize: 10, colSpan: 3 },
          {},
          {},
          { text: `${total.toLocaleString('es-ES')} €`, bold: true, fontSize: 10, alignment: 'right' },
          { text: '' },
        ],
      ],
    },
    layout: layoutTabla,
  };
}

// Lista de hallazgos (PM11 Fase 4): ya no se agrupan por "naturaleza" —
// como en la app, cada hallazgo es su NOTA en negrita, con una línea gris
// debajo con sus ÁREAS del catálogo ("Software · MIFARE › DESFire EV2") y,
// si la tiene, la fecha relevante y la zona. Vienen ya ordenados por quien
// llama (por fecha de creación). Si no hay ninguno, un nodo de estado vacío.
// deno-lint-ignore no-explicit-any
export function bloquesHallazgos(hallazgos: HallazgoRow[], textoVacio: string): any[] {
  if (!hallazgos.length) return [estadoVacio(textoVacio)];
  return hallazgos.map((h) => {
    const ubicacionNombre = h.zona_texto || (h.ubicacion as unknown as { nombre: string } | null)?.nombre;
    const venceTexto = h.fecha_relevante
      ? `Vence: ${fechaCorta(h.fecha_relevante)}${h.tipo_fecha_relevante ? ` · ${etiqueta(TIPO_FECHA_LABEL, h.tipo_fecha_relevante)}` : ''}`
      : null;
    const areasTexto = (h.areas ?? []).map((a) => a.nombre).join('  ·  ');
    return {
      margin: [0, 0, 0, 8],
      stack: [
        {
          text: [
            { text: h.nota?.trim() || 'Hallazgo', bold: true, fontSize: 10.5 },
            venceTexto ? { text: `   ${venceTexto}`, color: COLOR.warning600, bold: true, fontSize: 8.5 } : null,
          ].filter(Boolean),
        },
        areasTexto ? { text: areasTexto, fontSize: 8.5, color: COLOR.ink400, margin: [0, 2, 0, 0] } : null,
        ubicacionNombre ? { text: `Zona: ${ubicacionNombre}`, fontSize: 8, color: COLOR.ink400, margin: [0, 2, 0, 0] } : null,
      ].filter(Boolean),
    };
  });
}

// Tabla de próximos pasos. `pasos` ya viene ordenado por quien llama.
// deno-lint-ignore no-explicit-any
export function tablaPasos(pasos: PasoRow[]): any {
  return {
    table: {
      headerRows: 1,
      widths: ['*', 90, 65, 70],
      body: [
        [
          { text: 'ACCIÓN', fontSize: 8, bold: true, color: COLOR.ink400 },
          { text: 'RESPONSABLE', fontSize: 8, bold: true, color: COLOR.ink400 },
          { text: 'FECHA OBJETIVO', fontSize: 8, bold: true, color: COLOR.ink400 },
          { text: 'ESTADO', fontSize: 8, bold: true, color: COLOR.ink400 },
        ],
        ...pasos.map((p) => {
          const vencido = esVencido(p.fecha_objetivo, p.estado);
          return [
            { text: p.descripcion, fontSize: 9.5 },
            { text: (p.comercial_responsable as unknown as { nombre: string } | null)?.nombre ?? '—', fontSize: 9.5 },
            {
              text: p.fecha_objetivo ? fechaCorta(p.fecha_objetivo) : '—',
              fontSize: 9.5,
              color: vencido ? COLOR.danger600 : COLOR.ink700,
              bold: vencido,
            },
            vencido ? { ...chip('VENCIDO', COLOR.danger600) } : { text: etiqueta(ESTADO_PASO_LABEL, p.estado), fontSize: 9.5 },
          ];
        }),
      ],
    },
    layout: layoutTabla,
  };
}

// Bloque "Responsable / Acompañantes / Interlocutores" de una visita: antes
// solo vivía en generar-backup-visita (portada de la visita individual);
// generar-informe-proyecto lo necesita igual por cada visita de su
// cronología, así que se extrae aquí para que ambos informes muestren
// exactamente lo mismo, no una versión resumida en uno y completa en otro.
// deno-lint-ignore no-explicit-any
export function filasQuienes(participantes: ParticipanteRow[], interlocutores: InterlocutorRow[]): any[] {
  const responsable = participantes.find((p) => p.rol === 'responsable');
  const acompanantes = participantes
    .filter((p) => p.rol !== 'responsable' && p.estado === 'aceptado')
    .map((p) => (p.comercial as unknown as { nombre: string } | null)?.nombre)
    .filter((n): n is string => !!n);
  const interlocutoresTexto = interlocutores
    .map((v) => {
      const i = v.interlocutor as unknown as { nombre: string; cargo: string | null } | null;
      if (!i) return null;
      return i.cargo ? `${i.nombre} (${i.cargo})` : i.nombre;
    })
    .filter((t): t is string => !!t);

  // deno-lint-ignore no-explicit-any
  const filas: any[] = [];
  if (responsable) {
    filas.push([
      { text: 'Responsable', color: COLOR.ink400, fontSize: 9.5 },
      { text: (responsable.comercial as unknown as { nombre: string } | null)?.nombre ?? '—', bold: true, fontSize: 9.5 },
    ]);
  }
  if (acompanantes.length) {
    filas.push([
      { text: acompanantes.length === 1 ? 'Acompañante' : 'Acompañantes', color: COLOR.ink400, fontSize: 9.5 },
      { text: acompanantes.join(' · '), fontSize: 9.5 },
    ]);
  }
  if (interlocutoresTexto.length) {
    filas.push([
      { text: 'Interlocutores', color: COLOR.ink400, fontSize: 9.5 },
      { text: interlocutoresTexto.join(' · '), fontSize: 9.5 },
    ]);
  }
  return filas;
}

// Coordenadas GPS de las fotos que las tienen (best-effort, la app las
// guarda al hacer la foto) + enlace a Google Maps. No se dibuja un mapa
// real (pediría un proveedor de pago); solo el dato y el enlace. Extraído
// de generar-backup-visita para que generar-informe-proyecto lo use igual
// por cada visita de su cronología.
// deno-lint-ignore no-explicit-any
export function bloqueFotosConUbicacion(fotos: FotoUbicacionRow[]): any[] {
  const situadas = fotos.filter((f) => f.latitud != null && f.longitud != null);
  if (!situadas.length) return [];
  // deno-lint-ignore no-explicit-any
  const bloques: any[] = [
    { text: 'Fotos con ubicación', bold: true, fontSize: 9.5, color: COLOR.ink700, margin: [0, 14, 0, 4] },
  ];
  let idx = 0;
  for (const f of situadas) {
    idx += 1;
    const lat = f.latitud as number;
    const lng = f.longitud as number;
    bloques.push({
      margin: [8, 2, 0, 0],
      fontSize: 9,
      text: [
        { text: `•  ${f.titulo || `Foto ${idx}`}  ·  `, color: COLOR.ink700 },
        { text: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, color: COLOR.ink400 },
        { text: '   Ver en el mapa', color: COLOR.brand600, link: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` },
      ],
    });
  }
  return bloques;
}

// Nota discreta cuando el comercial reescribió a mano el resumen que la app
// genera sola al cerrar ("por reglas") — el lector del informe (Dirección,
// el propio comercial más tarde) no tenía forma de saber si el resumen es
// el automático o uno editado. Silenciosa en el caso normal (autogenerado
// o sin resumen): solo aparece cuando de verdad aporta algo.
// deno-lint-ignore no-explicit-any
export function notaResumenManual(resumenOrigen: string | null | undefined): any | null {
  if (resumenOrigen !== 'manual') return null;
  return { text: 'Resumen editado a mano por el comercial.', fontSize: 8, italics: true, color: COLOR.ink400, margin: [0, 4, 0, 0] };
}

// Genera los bytes del PDF a partir de un docDefinition de pdfmake.
export function generarPdfBytes(docDefinition: unknown): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    try {
      // deno-lint-ignore no-explicit-any
      (pdfMake as any).createPdf(docDefinition).getBuffer((buffer: Uint8Array) => resolve(buffer));
    } catch (e) {
      reject(e);
    }
  });
}
