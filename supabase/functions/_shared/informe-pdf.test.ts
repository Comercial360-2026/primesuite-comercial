// Equivalencia del módulo compartido con el código INLINE que tenía
// generar-backup-visita/index.ts antes de extraerlo (commit previo a
// "PDF de proyecto"). Objetivo: garantizar que el informe de visita sale
// EXACTAMENTE igual tras el refactor.
//
//   deno test supabase/functions/_shared/informe-pdf.test.ts
//
// Los `*_ESPERADO` son copias verbatim del index.ts anterior. Si algún día
// se cambia a propósito la maqueta compartida, este test hay que
// actualizarlo en el mismo commit (y regenerar un informe de visita para
// verlo).

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  COLOR,
  ETAPA_LABEL,
  PRIORIDAD_LABEL,
  HORIZONTE_LABEL,
  ESTADO_PASO_LABEL,
  TIPO_FECHA_LABEL,
  tablaOportunidades,
  bloquesHallazgos,
  tablaPasos,
  filaKPIs,
  type OportunidadRow,
  type PasoRow,
  type HallazgoRow,
} from './informe-pdf.ts';

// ---------------------------------------------------------------------
// 1. Constantes de marca y diccionarios — valores literales del index.ts
//    anterior. Un typo al mover (un hex, un acento) lo caza aquí.
// ---------------------------------------------------------------------

Deno.test('COLOR — espejo de tokens.css sin cambios al mover', () => {
  assertEquals(COLOR, {
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
  });
});

Deno.test('Diccionarios de negocio sin cambios al mover', () => {
  assertEquals(ETAPA_LABEL, {
    latente: 'Latente',
    cualificada: 'Cualificada',
    en_propuesta: 'En propuesta',
    ganada: 'Ganada',
    perdida: 'Perdida',
    descartada: 'Descartada',
  });
  assertEquals(PRIORIDAD_LABEL, { baja: 'Baja', media: 'Media', alta: 'Alta', estrategica: 'Estratégica' });
  assertEquals(HORIZONTE_LABEL, {
    '0-3 meses': '0–3 meses',
    '3-6 meses': '3–6 meses',
    '6-12 meses': '6–12 meses',
    'mas de 12 meses': 'Más de 12 meses',
    'sin fecha definida': 'Sin fecha definida',
  });
  assertEquals(ESTADO_PASO_LABEL, { pendiente: 'Pendiente', completado: 'Hecho', cancelado: 'Cancelado' });
  assertEquals(TIPO_FECHA_LABEL, {
    vencimiento_contrato: 'Vencimiento de contrato',
    renovacion: 'Renovación',
    auditoria: 'Auditoría',
    presupuesto: 'Presupuesto',
    implantacion: 'Implantación',
    otro: 'Otro',
  });
});

// ---------------------------------------------------------------------
// 2. Bloques de maqueta — se comparan contra copias verbatim del index.ts
//    anterior, sobre datos de muestra que tocan todas las ramas.
// ---------------------------------------------------------------------

// --- copias verbatim del index.ts anterior (con COLOR/etiqueta/fechaCorta/
//     esVencido/chip/estadoVacio/layoutTabla locales, idénticos a los de
//     entonces) ---

const _capitalizar = (t: string) => {
  const l = t.replace(/_/g, ' ');
  return l.charAt(0).toUpperCase() + l.slice(1);
};
const _etiqueta = (m: Record<string, string>, v: string | null | undefined) => (!v ? '—' : m[v] ?? _capitalizar(v));
const _fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
const _hoyLocal = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const _esVencido = (fechaObjetivo: string | null, estado: string) => {
  if (!fechaObjetivo || estado !== 'pendiente') return false;
  const f = new Date(fechaObjetivo);
  f.setHours(0, 0, 0, 0);
  return f < _hoyLocal();
};
// deno-lint-ignore no-explicit-any
const _chip = (texto: string, color: string): any => ({
  table: { body: [[{ text: texto, color: '#FFFFFF', fillColor: color, bold: true, fontSize: 7.5, margin: [5, 2, 5, 2] }]] },
  layout: 'noBorders',
});
// deno-lint-ignore no-explicit-any
const _estadoVacio = (texto: string): any => ({ text: texto, italics: true, color: COLOR.ink400, fontSize: 9.5, margin: [0, 2, 0, 4] });
// deno-lint-ignore no-explicit-any
const _layoutTabla: any = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
    i === 0 ? 0 : i === 1 ? 1 : i === node.table.body.length ? 0 : 0.5,
  vLineWidth: () => 0,
  hLineColor: (i: number) => (i === 1 ? COLOR.ink200 : COLOR.ink100),
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 5,
  paddingBottom: () => 5,
};

// deno-lint-ignore no-explicit-any
function tablaOportunidadesESPERADO(oportunidadesOrdenadas: OportunidadRow[]): any {
  const totalOportunidades = oportunidadesOrdenadas.reduce((suma, o) => suma + (o.valor_estimado ?? 0), 0);
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
        ...oportunidadesOrdenadas.map((o) => [
          {
            stack: [
              { text: o.titulo, bold: true, fontSize: 10 },
              o.descripcion ? { text: o.descripcion, fontSize: 8.5, color: COLOR.ink400, margin: [0, 2, 0, 0] } : null,
            ].filter(Boolean),
          },
          { text: _etiqueta(ETAPA_LABEL, o.etapa), fontSize: 9.5 },
          {
            text: _etiqueta(PRIORIDAD_LABEL, o.prioridad),
            fontSize: 9.5,
            bold: o.prioridad === 'estrategica' || o.prioridad === 'alta',
            color: o.prioridad === 'estrategica' ? COLOR.signal600 : o.prioridad === 'alta' ? COLOR.warning600 : COLOR.ink700,
          },
          { text: o.valor_estimado != null ? `${o.valor_estimado.toLocaleString('es-ES')} €` : '—', fontSize: 9.5, alignment: 'right' },
          { text: _etiqueta(HORIZONTE_LABEL, o.horizonte_decision), fontSize: 9.5 },
        ]),
        [
          { text: 'Total estimado', bold: true, fontSize: 10, colSpan: 3 },
          {},
          {},
          { text: `${totalOportunidades.toLocaleString('es-ES')} €`, bold: true, fontSize: 10, alignment: 'right' },
          { text: '' },
        ],
      ],
    },
    layout: _layoutTabla,
  };
}

// deno-lint-ignore no-explicit-any
function bloquesHallazgosESPERADO(hallazgos: HallazgoRow[]): any[] {
  if (!hallazgos.length) return [_estadoVacio('No se registraron hallazgos en esta visita.')];
  return hallazgos.map((h) => {
    const ubicacionNombre = h.zona_texto || (h.ubicacion as unknown as { nombre: string } | null)?.nombre;
    const venceTexto = h.fecha_relevante
      ? `Vence: ${_fechaCorta(h.fecha_relevante)}${h.tipo_fecha_relevante ? ` · ${_etiqueta(TIPO_FECHA_LABEL, h.tipo_fecha_relevante)}` : ''}`
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

// deno-lint-ignore no-explicit-any
function filaKPIsESPERADO(items: { valor: string; etiqueta: string; alerta?: boolean }[]): any {
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

// deno-lint-ignore no-explicit-any
function tablaPasosESPERADO(pasosOrdenados: PasoRow[]): any {
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
        ...pasosOrdenados.map((p) => {
          const vencido = _esVencido(p.fecha_objetivo, p.estado);
          return [
            { text: p.descripcion, fontSize: 9.5 },
            { text: (p.comercial_responsable as unknown as { nombre: string } | null)?.nombre ?? '—', fontSize: 9.5 },
            {
              text: p.fecha_objetivo ? _fechaCorta(p.fecha_objetivo) : '—',
              fontSize: 9.5,
              color: vencido ? COLOR.danger600 : COLOR.ink700,
              bold: vencido,
            },
            vencido ? { ..._chip('VENCIDO', COLOR.danger600) } : { text: _etiqueta(ESTADO_PASO_LABEL, p.estado), fontSize: 9.5 },
          ];
        }),
      ],
    },
    layout: _layoutTabla,
  };
}

// --- fixtures ---

const OPS: OportunidadRow[] = [
  { id: 'o1', titulo: 'Torniquetes vestíbulo', descripcion: 'Cambio de 6 uds', etapa: 'en_propuesta', prioridad: 'estrategica', valor_estimado: 42000, horizonte_decision: '3-6 meses' },
  { id: 'o2', titulo: 'Lectoras oficinas', descripcion: null, etapa: 'latente', prioridad: 'media', valor_estimado: null, horizonte_decision: null },
  { id: 'o3', titulo: 'Mantenimiento', descripcion: 'Anual', etapa: 'ganada', prioridad: 'alta', valor_estimado: 8000, horizonte_decision: 'raro-no-mapeado' },
];

const HALL: HallazgoRow[] = [
  { id: 'h1', nota: 'Compite con Dorlet', creado_en: '2026-09-01T10:00:00Z', fecha_relevante: null, tipo_fecha_relevante: null, areas: [{ tipo: 'termino', nombre: 'Dorlet' }], zona_texto: 'Vestíbulo', ubicacion: null },
  { id: 'h2', nota: null, creado_en: '2026-09-01T10:05:00Z', fecha_relevante: '2026-12-31', tipo_fecha_relevante: 'vencimiento_contrato', areas: [{ tipo: 'termino', nombre: 'MIFARE › DESFire EV2' }], zona_texto: null, ubicacion: { nombre: 'CPD' } },
  { id: 'h3', nota: 'Interesados en móvil', creado_en: '2026-09-01T10:10:00Z', fecha_relevante: null, tipo_fecha_relevante: null, areas: [], zona_texto: null, ubicacion: null },
  { id: 'h4', nota: '  ', creado_en: '2026-09-01T10:15:00Z', fecha_relevante: null, tipo_fecha_relevante: null, areas: [{ tipo: 'categoria', nombre: 'Hardware' }, { tipo: 'termino', nombre: 'Lector' }], zona_texto: null, ubicacion: null },
];

const PASOS: PasoRow[] = [
  { id: 'p1', descripcion: 'Enviar propuesta', fecha_objetivo: '2000-01-01', estado: 'pendiente', comercial_responsable: { nombre: 'Ana' } },
  { id: 'p2', descripcion: 'Llamar a compras', fecha_objetivo: '2999-01-01', estado: 'pendiente', comercial_responsable: null },
  { id: 'p3', descripcion: 'Cerrada ya', fecha_objetivo: null, estado: 'completado', comercial_responsable: { nombre: 'Luis' } },
];

const j = (x: unknown) => JSON.stringify(x);

Deno.test('tablaOportunidades — igual que el inline anterior', () => {
  assertEquals(j(tablaOportunidades(OPS)), j(tablaOportunidadesESPERADO(OPS)));
  assertEquals(j(tablaOportunidades([])), j(tablaOportunidadesESPERADO([])));
});

Deno.test('bloquesHallazgos — igual que el inline anterior', () => {
  assertEquals(j(bloquesHallazgos(HALL, 'No se registraron hallazgos en esta visita.')), j(bloquesHallazgosESPERADO(HALL)));
  assertEquals(j(bloquesHallazgos([], 'No se registraron hallazgos en esta visita.')), j(bloquesHallazgosESPERADO([])));
});

Deno.test('tablaPasos — igual que el inline anterior', () => {
  assertEquals(j(tablaPasos(PASOS)), j(tablaPasosESPERADO(PASOS)));
  assertEquals(j(tablaPasos([])), j(tablaPasosESPERADO([])));
});

Deno.test('filaKPIs — igual que el inline anterior', () => {
  const kpis = [
    { valor: '3', etiqueta: 'Visitas cerradas' },
    { valor: '0', etiqueta: 'Riesgos' },
    { valor: '2', etiqueta: 'Pasos vencidos', alerta: true },
  ];
  assertEquals(j(filaKPIs(kpis)), j(filaKPIsESPERADO(kpis)));
});
