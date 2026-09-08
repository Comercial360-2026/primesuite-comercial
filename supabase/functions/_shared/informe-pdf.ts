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

export const NATURALEZA_ORDEN = ['riesgo', 'proyecto_activo', 'competencia', 'oportunidad', 'fortaleza', 'contexto'];
export const NATURALEZA_LABEL: Record<string, string> = {
  riesgo: 'Riesgo',
  proyecto_activo: 'Proyecto activo',
  competencia: 'Competencia',
  oportunidad: 'Señal de oportunidad',
  fortaleza: 'Fortaleza',
  contexto: 'Contexto',
};
export const NATURALEZA_COLOR: Record<string, string> = {
  riesgo: COLOR.risk600,
  proyecto_activo: COLOR.brand600,
  competencia: COLOR.purple600,
  oportunidad: COLOR.signal600,
  fortaleza: COLOR.success600,
  contexto: COLOR.ink400,
};

export const ETAPA_LABEL: Record<string, string> = {
  latente: 'Latente',
  cualificada: 'Cualificada',
  en_propuesta: 'En propuesta',
  ganada: 'Ganada',
  perdida: 'Perdida',
  descartada: 'Descartada',
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
export interface HallazgoRow {
  id: string;
  nota: string | null;
  naturaleza: string;
  creado_en: string;
  fecha_relevante: string | null;
  tipo_fecha_relevante: string | null;
  // Si el término es un modelo, `parent` trae el término padre para poder
  // imprimir la ruta "MIFARE › DESFire EV2".
  termino: (Nombrado & { parent: Nombrado | null }) | null;
  zona_texto: string | null;
  ubicacion: Nombrado | null;
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

// Lista de hallazgos agrupada por naturaleza, en el orden de NATURALEZA_ORDEN;
// las naturalezas desconocidas van al final en un solo grupo. Si no hay
// ninguno devuelve un único nodo de estado vacío con el texto que se le pase.
// deno-lint-ignore no-explicit-any
export function bloquesHallazgos(hallazgos: HallazgoRow[], textoVacio: string): any[] {
  const naturalezasConocidas = new Set(NATURALEZA_ORDEN);
  const grupos: { naturaleza: string; items: HallazgoRow[] }[] = NATURALEZA_ORDEN
    .map((nat) => ({ naturaleza: nat, items: hallazgos.filter((h) => h.naturaleza === nat) }))
    .filter((g) => g.items.length > 0);
  const otras = hallazgos.filter((h) => !naturalezasConocidas.has(h.naturaleza));
  if (otras.length) {
    grupos.push({ naturaleza: otras[0].naturaleza, items: otras });
  }
  if (!grupos.length) return [estadoVacio(textoVacio)];
  return grupos.flatMap((g) => [
    {
      margin: [0, 4, 0, 6],
      columns: [
        { width: 'auto', ...chip(etiqueta(NATURALEZA_LABEL, g.naturaleza).toUpperCase(), NATURALEZA_COLOR[g.naturaleza] ?? COLOR.ink400) },
        { width: 'auto', text: `  ${g.items.length}`, color: COLOR.ink400, fontSize: 9.5, margin: [8, 3, 0, 0] },
      ],
    },
    ...g.items.map((h) => {
      const term = h.termino as unknown as { nombre: string; parent: { nombre: string } | null } | null;
      const nombreTermino = term
        ? term.parent
          ? `${term.parent.nombre} › ${term.nombre}`
          : term.nombre
        : 'Hallazgo';
      const ubicacionNombre = h.zona_texto || (h.ubicacion as unknown as { nombre: string } | null)?.nombre;
      const venceTexto = h.fecha_relevante
        ? `Vence: ${fechaCorta(h.fecha_relevante)}${h.tipo_fecha_relevante ? ` · ${etiqueta(TIPO_FECHA_LABEL, h.tipo_fecha_relevante)}` : ''}`
        : null;
      return {
        margin: [0, 0, 0, 8],
        stack: [
          {
            text: [
              { text: nombreTermino, bold: true, fontSize: 10.5 },
              venceTexto ? { text: `   ${venceTexto}`, color: COLOR.warning600, bold: true, fontSize: 8.5 } : null,
            ].filter(Boolean),
          },
          h.nota ? { text: h.nota, fontSize: 9.5, color: COLOR.ink700, margin: [0, 2, 0, 0] } : null,
          ubicacionNombre ? { text: `Zona: ${ubicacionNombre}`, fontSize: 8, color: COLOR.ink400, margin: [0, 2, 0, 0] } : null,
        ].filter(Boolean),
      };
    }),
  ]);
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
