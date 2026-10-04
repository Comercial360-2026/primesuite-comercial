// supabase/functions/_shared/informe-html.ts
//
// Informe de visita en formato WEB: un único archivo .html que se abre en cualquier navegador y se
// NAVEGA como una aplicación: menú a la izquierda (por tipo o por zona, con contadores), lo seleccionado
// en el centro y el mapa a la derecha con los pines de las fotos que se ven. Buscador, visor de fotos
// con flechas / teclado / deslizar y enlaces a los originales, audios y documentos (en SharePoint o en
// el zip). En móvil el menú baja desde arriba. La selección va en la URL (#notas, #zona-2). Las fotos
// van como MINIATURAS embebidas (~50 KB cada una); el original queda en su carpeta (botón «Original»).
//
// El mapa usa Leaflet + teselas de OpenStreetMap servidas por la función tile-mapa (necesitan conexión).
// Pedirlas directamente no sirve: OSM bloquea las páginas sin Referer (blob: y archivos descargados) y
// CARTO exige clave. Sin conexión el informe sigue entero: el mapa se sustituye por un aviso y cada foto
// conserva sus coordenadas y su enlace a Google Maps.

import {
  COLOR,
  ETAPA_LABEL,
  PRIORIDAD_LABEL,
  HORIZONTE_LABEL,
  ESTADO_PASO_LABEL,
  TIPO_FECHA_LABEL,
  etiqueta,
  fechaCorta,
  horaDe,
  esVencido,
  type HallazgoRow,
  type OportunidadRow,
  type PasoRow,
  type ParticipanteRow,
  type InterlocutorRow,
} from './informe-pdf.ts';

export interface FotoHtml {
  n: number; // número global de la foto en la visita (1, 2, 3…), el que sale en el pin
  titulo: string | null;
  zona: string; // '' = sin zona
  creadoEn: string;
  dataUri: string | null; // miniatura embebida; null = formato no embebible
  urlOriginal: string | null; // enlace al original (SharePoint, o fotos/… dentro del zip)
  latitud: number | null;
  longitud: number | null;
}

export interface ArchivoHtml {
  titulo: string;
  creadoEn: string;
  zona: string; // '' = sin zona
  url: string | null; // enlace al archivo en SharePoint (solo si ya está copiado)
}

export interface DatosInformeHtml {
  clienteNombre: string;
  proyectoNombre: string;
  metaCliente: string;
  lineaVisita: string; // "Visita (por Teams) · 12 de septiembre de 2026 · 10:30"
  lineaHistorico: string | null;
  participantes: ParticipanteRow[];
  interlocutores: InterlocutorRow[];
  enCurso: boolean;
  resumenTexto: string | null;
  resumenManual: boolean;
  objetivo: string | null;
  oportunidades: OportunidadRow[]; // ya ordenadas
  hallazgos: HallazgoRow[];
  pasos: PasoRow[];
  notas: { titulo: string | null; texto: string | null; zona: string }[];
  fotos: FotoHtml[];
  audios: ArchivoHtml[];
  documentos: ArchivoHtml[];
  avisos: string[]; // "2 fotos no se pudieron recuperar…"
  generadoEn: string; // "2 de octubre de 2026, 10:41"
  logo: string | null; // data URI
  enlaceApp: string | null; // «Abrir la visita» (la visita en la app)
  urlTeselas: string; // proxy de teselas (función tile-mapa): sin él el mapa no carga en blob: ni en archivos
}

const esc = (t: unknown) =>
  String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const euros = (n: number) => `${n.toLocaleString('es-ES')} €`;

const enlaceMapa = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

// Texto en el que busca el buscador (minúsculas y sin tildes se normalizan en el navegador).
const busca = (...partes: unknown[]) => esc(partes.filter((p) => p != null && p !== '').join(' '));

export const zonaDe = (texto: string | null | undefined, ubicacion?: { nombre: string } | null) =>
  (texto || ubicacion?.nombre || '').trim();

// Zonas ('' = sin zona) de más a menos elementos; «Sin zona» siempre al final. Las usan el informe web y el PDF.
export function ordenarZonas(contadores: Map<string, number>): string[] {
  const orden = [...contadores.keys()].filter((z) => z !== '').sort((a, b) => (contadores.get(b) ?? 0) - (contadores.get(a) ?? 0));
  if (contadores.has('')) orden.push('');
  return orden;
}
const chipZona = (z: string) => (z ? `<span class="chip zona">${esc(z)}</span>` : '');
// Atributos comunes de todo elemento filtrable: tipo, zona ('' = sin zona) y texto de búsqueda.
const attrs = (tipo: string, zona: string, texto: string, clase = '') =>
  `class="${clase ? `${clase} ` : ''}bus" data-t="${tipo}" data-z="${esc(zona)}" data-b="${texto}"`;

function seccion(id: string, titulo: string, cuenta: number | null, cuerpo: string) {
  return `<section id="${id}" class="sec" data-sec="${id}"><h2>${esc(titulo)}${cuenta != null ? ` <span class="cuenta">${cuenta}</span>` : ''}</h2>${cuerpo}</section>`;
}

function bloqueQuienes(p: ParticipanteRow[], i: InterlocutorRow[]) {
  const responsable = p.find((x) => x.rol === 'responsable');
  const acompanantes = p
    .filter((x) => x.rol !== 'responsable' && x.estado === 'aceptado')
    .map((x) => x.comercial?.nombre)
    .filter((n): n is string => !!n);
  const interlocutores = i
    .map((v) => (v.interlocutor ? (v.interlocutor.cargo ? `${v.interlocutor.nombre} (${v.interlocutor.cargo})` : v.interlocutor.nombre) : null))
    .filter((t): t is string => !!t);
  const filas: [string, string][] = [];
  if (responsable) filas.push(['Responsable', responsable.comercial?.nombre ?? '—']);
  if (acompanantes.length) filas.push([acompanantes.length === 1 ? 'Acompañante' : 'Acompañantes', acompanantes.join(' · ')]);
  if (interlocutores.length) filas.push(['Interlocutores', interlocutores.join(' · ')]);
  if (!filas.length) return '';
  return `<dl class="quienes">${filas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

function fichaFoto(f: FotoHtml) {
  const img = f.dataUri
    ? `<img src="${f.dataUri}" alt="${esc(f.titulo || `Foto ${f.n}`)}" loading="lazy">`
    : `<div class="sin-imagen">Formato no embebible${f.urlOriginal ? ': usa «Original»' : ''}.</div>`;
  return `<figure id="foto-${f.n}" data-n="${f.n}" ${attrs('foto', f.zona, busca(f.titulo, f.zona, `foto ${f.n}`), 'foto')} tabindex="0" role="button" aria-label="Ampliar foto ${f.n}">
    ${img}
    <figcaption><span class="num">${f.n}</span><span class="foto__titulo">${esc(f.titulo || 'Foto')}</span><span class="hora">${esc(horaDe(f.creadoEn))}</span></figcaption>
  </figure>`;
}

function seccionFotos(fotos: FotoHtml[]) {
  if (!fotos.length) return '';
  const porZona = new Map<string, FotoHtml[]>();
  for (const f of fotos) porZona.set(f.zona, [...(porZona.get(f.zona) ?? []), f]);
  const grupos = [...porZona.entries()]
    .map(
      ([zona, lista]) =>
        `<div class="grupo" data-grupo><h3>${esc(zona || 'Sin zona')} <span class="cuenta">${lista.length}</span></h3><div class="fotos">${lista.map(fichaFoto).join('')}</div></div>`
    )
    .join('');
  return seccion('fotos', 'Fotos', fotos.length, grupos);
}

function listaOportunidades(ops: OportunidadRow[]) {
  const total = ops.reduce((s, o) => s + (o.valor_estimado ?? 0), 0);
  const tarjetas = ops
    .map((o) => {
      const z = zonaDe(o.zona_texto, o.ubicacion);
      return `<li ${attrs('oportunidad', z, busca(o.titulo, o.descripcion, z, etiqueta(ETAPA_LABEL, o.etapa)))}>
        <div><strong>${esc(o.titulo)}</strong>${o.descripcion ? `<div class="sub">${esc(o.descripcion)}</div>` : ''}</div>
        <div class="chips">${chipZona(z)}<span class="chip">${esc(etiqueta(ETAPA_LABEL, o.etapa))}</span><span class="chip">${esc(etiqueta(PRIORIDAD_LABEL, o.prioridad))}</span>${
          o.horizonte_decision ? `<span class="chip">${esc(etiqueta(HORIZONTE_LABEL, o.horizonte_decision))}</span>` : ''
        }${o.valor_estimado != null ? `<span class="chip valor">${esc(euros(o.valor_estimado))}</span>` : ''}</div>
      </li>`;
    })
    .join('');
  return `<ul class="tarjetas">${tarjetas}</ul>${total > 0 ? `<p class="total">Total estimado <strong>${esc(euros(total))}</strong></p>` : ''}`;
}

function listaHallazgos(hs: HallazgoRow[]) {
  return `<ul class="tarjetas">${hs
    .map((h) => {
      const z = zonaDe(h.zona_texto, h.ubicacion);
      const fecha = h.fecha_relevante
        ? `${h.tipo_fecha_relevante ? etiqueta(TIPO_FECHA_LABEL, h.tipo_fecha_relevante) : 'Fecha relevante'}: ${fechaCorta(h.fecha_relevante)}`
        : '';
      return `<li ${attrs('hallazgo', z, busca(h.nota, z, h.areas.map((a) => a.nombre).join(' ')))}>
        <div>${esc(h.nota?.trim() || 'Hallazgo sin texto')}</div>
        ${h.areas.length || z ? `<div class="chips">${chipZona(z)}${h.areas.map((a) => `<span class="chip">${esc(a.nombre)}</span>`).join('')}</div>` : ''}
        ${fecha ? `<div class="sub">${esc(fecha)}</div>` : ''}
      </li>`;
    })
    .join('')}</ul>`;
}

function listaPasos(pasos: PasoRow[]) {
  return `<ul class="tarjetas">${pasos
    .map((p) => {
      const z = zonaDe(p.zona_texto);
      const vencido = esVencido(p.fecha_objetivo, p.estado);
      return `<li ${attrs('paso', z, busca(p.descripcion, z, p.comercial_responsable?.nombre))}>
        <div>${esc(p.descripcion)}</div>
        <div class="chips">${chipZona(z)}${p.comercial_responsable?.nombre ? `<span class="chip">${esc(p.comercial_responsable.nombre)}</span>` : ''}<span class="chip${vencido ? ' vencido-chip' : ''}">${
          p.fecha_objetivo ? esc(fechaCorta(p.fecha_objetivo)) : 'Sin fecha'
        }${vencido ? ' · vencido' : ''}</span><span class="chip">${esc(etiqueta(ESTADO_PASO_LABEL, p.estado))}</span></div>
      </li>`;
    })
    .join('')}</ul>`;
}

function listaNotas(notas: { titulo: string | null; texto: string | null; zona: string }[]) {
  return notas
    .map(
      (n) =>
        `<div ${attrs('nota', n.zona, busca(n.titulo, n.texto, n.zona), 'nota')}>${n.zona ? `<div class="chips" style="margin:0 0 6px">${chipZona(n.zona)}</div>` : ''}${n.titulo ? `<strong>${esc(n.titulo)}</strong>` : ''}${esc(n.texto)}</div>`
    )
    .join('');
}

function listaArchivos(id: string, tipo: string, titulo: string, archivos: ArchivoHtml[], verbo: string) {
  if (!archivos.length) return '';
  return seccion(
    id,
    titulo,
    archivos.length,
    `<ul class="archivos">${archivos
      .map((a) => {
        const enlace = a.url;
        const boton = enlace
          ? `<a class="btn" href="${esc(enlace)}" target="_blank" rel="noreferrer">${esc(verbo)}</a>`
          : `<span class="sub">en la carpeta de la visita</span>`;
        return `<li ${attrs(tipo, a.zona, busca(a.titulo, a.zona))}>${chipZona(a.zona)}<span class="archivo__titulo">${esc(a.titulo)}</span><span class="hora">${esc(horaDe(a.creadoEn))}</span>${boton}</li>`;
      })
      .join('')}</ul>`
  );
}

const CSS = `
:root{--ink9:${COLOR.ink900};--ink7:${COLOR.ink700};--ink4:${COLOR.ink400};--ink2:${COLOR.ink200};--ink1:${COLOR.ink100};--b6:${COLOR.brand600};--b7:${COLOR.brand700};--sig:${COLOR.signal600};--warn:${COLOR.warning600};--warn0:${COLOR.warning050};--danger:${COLOR.danger600}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:#f6f7f9;color:var(--ink9);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--b6)}
[hidden]{display:none!important}

/* --- Estructura: menú a la izquierda, contenido en el centro, mapa a la derecha --- */
.app{display:grid;grid-template-columns:268px minmax(0,1fr) minmax(320px,440px);min-height:100vh;max-width:1760px;margin:0 auto}
.app.sin-mapa{grid-template-columns:268px minmax(0,1fr)}
.lateral{position:sticky;top:0;height:100vh;height:100dvh;overflow-y:auto;display:flex;flex-direction:column;gap:14px;padding:20px 14px 16px;background:#fff;border-right:1px solid var(--ink2)}
.lateral__cab{padding:0 6px}
.lateral__cliente{font-weight:700;font-size:17px;line-height:1.25;color:var(--b7);overflow-wrap:anywhere}
.lateral__sub{margin-top:2px;color:var(--ink4);font-size:12px;letter-spacing:.08em;font-weight:700}
.lateral__cerrar{display:none}
.busca{position:relative}
.busca svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--ink4);pointer-events:none}
.busca input{width:100%;border:1px solid var(--ink2);border-radius:99px;padding:9px 14px 9px 36px;font:inherit;font-size:14px;background:#fff;color:var(--ink9)}
.busca input:focus{outline:2px solid var(--b6);outline-offset:1px}
.vistas{display:flex;border:1px solid var(--ink2);border-radius:99px;overflow:hidden;background:#fff}
.vistas button{flex:1;border:0;background:transparent;padding:8px 10px;font:inherit;font-size:13px;font-weight:600;color:var(--ink7);cursor:pointer}
.vistas button.on{background:var(--b6);color:#fff}
.nav{display:flex;flex-direction:column;gap:2px}
.nav a{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;border-radius:10px;color:var(--ink7);text-decoration:none;font-size:14px;font-weight:600}
.nav a span{min-width:0;overflow-wrap:anywhere}
.nav a b{flex:none;min-width:24px;text-align:center;padding:1px 8px;border-radius:99px;background:var(--ink1);color:var(--ink7);font-size:12px;font-weight:600}
.nav a:hover{background:var(--ink1)}
.nav a.activo{background:var(--b6);color:#fff}
.nav a.activo b{background:rgba(255,255,255,.25);color:#fff}
.lateral__pie{margin-top:auto;display:flex;flex-wrap:wrap;gap:8px;padding-top:12px;border-top:1px solid var(--ink1)}
.accion{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--ink2);background:#fff;color:var(--b7);border-radius:99px;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer}
.accion:hover{border-color:var(--b6)}
.accion svg{width:16px;height:16px;flex:none}
.centro{min-width:0;padding:22px 26px 64px}
.centro > *{max-width:880px}
.derecha{position:sticky;top:0;height:100vh;height:100dvh;display:flex;flex-direction:column;gap:8px;padding:14px 16px 14px 0}
.derecha__tit{font-weight:700;color:var(--b7);padding:6px 4px 0}
.mapa{flex:1;min-height:240px;border-radius:14px;border:1px solid var(--ink2);background:var(--ink1);display:flex;align-items:center;justify-content:center;color:var(--ink4);text-align:center;padding:16px;isolation:isolate}
.mapa-nota{margin:0;padding:0 4px;color:var(--ink4);font-size:13px}
.topbar,.velo,#subir{display:none}

/* --- Contenido --- */
.sec.fuera{display:none}
#resultados{color:var(--ink4);font-size:14px;margin:0 0 12px;min-height:0}
#resultados:empty{display:none}
header.portada{background:#fff;border:1px solid var(--ink1);border-radius:14px;padding:24px 26px 20px;margin-bottom:14px}
.portada .logo{height:30px;margin-bottom:14px}
.portada .tipo{font-size:12px;letter-spacing:.12em;font-weight:700;color:var(--ink4)}
.portada h1{margin:4px 0 2px;font-size:28px;color:var(--b7)}
.portada .proyecto{color:var(--b6);font-weight:700}
.portada .linea{margin-top:12px;font-weight:700;font-size:16px}
.portada .sub,.sub{color:var(--ink4);font-size:13px}
.quienes{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:14px 0 0}
.quienes dt{color:var(--ink4)} .quienes dd{margin:0;font-weight:600}
.kpis{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.kpis span{background:var(--ink1);color:var(--b6);border-radius:99px;padding:3px 12px;font-size:13px;font-weight:600}
.aviso{margin-top:14px;padding:10px 14px;border:1px solid var(--warn);background:var(--warn0);color:var(--warn);border-radius:10px;font-size:13px}
section{background:#fff;border:1px solid var(--ink1);border-radius:14px;padding:18px 22px;margin-bottom:14px}
h2{margin:0 0 12px;font-size:19px;color:var(--b7)} h3{margin:20px 0 10px;font-size:15px;color:var(--b6)}
.cuenta{display:inline-block;margin-left:6px;padding:0 8px;border-radius:99px;background:var(--ink1);color:var(--ink7);font-size:12px;font-weight:600;vertical-align:2px}
.vacio{color:var(--ink4);font-style:italic;margin:0}
.tabla-scroll{overflow-x:auto} table{border-collapse:collapse;width:100%;font-size:14px}
th{text-align:left;color:var(--ink4);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid var(--ink2);padding:8px 10px}
td{border-bottom:1px solid var(--ink1);padding:9px 10px;vertical-align:top} .num-col{text-align:right;white-space:nowrap}
tfoot td{font-weight:700;border-top:2px solid var(--ink2);border-bottom:0} .vencido{color:var(--danger);font-weight:600}
.tarjetas{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.tarjetas li{border:1px solid var(--ink1);border-radius:10px;padding:12px 14px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}
.chip{background:var(--ink1);color:var(--b6);border-radius:99px;padding:2px 10px;font-size:12px;font-weight:600}
.chip.zona{background:var(--b6);color:#fff}
.nota{border:1px solid var(--ink1);border-radius:10px;padding:12px 14px;margin-bottom:10px;white-space:pre-wrap}
.nota strong{display:block;margin-bottom:2px}
.fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.foto{margin:0;border:1px solid var(--ink1);border-radius:10px;overflow:hidden;background:#fff;cursor:zoom-in;outline:none}
.foto:hover,.foto:focus-visible{border-color:var(--b6);box-shadow:0 0 0 2px rgba(26,54,84,.2)}
.foto img{display:block;width:100%;height:120px;object-fit:cover;background:var(--ink1)}
.sin-imagen{height:120px;display:flex;align-items:center;justify-content:center;background:var(--ink1);color:var(--ink4);font-size:12px;padding:8px;text-align:center}
.foto figcaption{display:flex;align-items:flex-start;gap:6px;padding:6px 8px;font-size:12px}
.foto__titulo{flex:1;min-width:0;overflow-wrap:anywhere;font-weight:600}
.num{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:99px;background:var(--b6);color:#fff;font-size:11px;font-weight:700}
.hora{margin-left:auto;color:var(--ink4);font-weight:400;font-size:12px}
.btn{display:inline-block;border:1px solid var(--ink2);background:#fff;color:var(--b6);border-radius:99px;padding:5px 13px;font:inherit;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;white-space:nowrap}
.btn:hover{border-color:var(--b6)}
.archivos{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.archivos li{display:flex;align-items:center;gap:10px;border:1px solid var(--ink1);border-radius:10px;padding:8px 12px}
.archivo__titulo{flex:1;min-width:0;font-weight:600}
.pin{width:28px;height:28px;border-radius:99px;background:var(--b6);color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font:700 12px/1 -apple-system,Segoe UI,Roboto,sans-serif;transition:transform .12s,background .12s}
.pin.sel{background:var(--sig);transform:scale(1.3)}
.visor{position:fixed;inset:0;background:rgba(10,14,18,.94);display:none;flex-direction:column;z-index:3000}
.visor.abierto{display:flex}
.visor__img{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:12px 56px;position:relative}
.visor__img img{max-width:100%;max-height:100%;border-radius:8px;object-fit:contain}
.visor__nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:99px;border:0;background:rgba(255,255,255,.16);color:#fff;font-size:22px;cursor:pointer}
.visor__nav:hover{background:rgba(255,255,255,.3)} .visor__nav.ant{left:8px} .visor__nav.sig{right:8px}
.visor__cerrar{position:absolute;top:10px;right:12px;z-index:2;width:40px;height:40px;border-radius:99px;border:0;background:rgba(255,255,255,.16);color:#fff;font-size:20px;cursor:pointer}
.visor__pie{padding:12px 16px 16px;color:#fff;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;justify-content:center;font-size:14px}
.visor__pie a,.visor__pie button{color:#fff;border:1px solid rgba(255,255,255,.4);background:transparent;border-radius:99px;padding:9px 16px;font:inherit;font-size:14px;text-decoration:none;cursor:pointer}
.visor__pie a:hover,.visor__pie button:hover{background:rgba(255,255,255,.18)}
.visor__pie .tit{font-weight:700} .visor__pie .meta{opacity:.75}
footer{color:var(--ink4);font-size:12px;text-align:center;margin-top:24px}
.total{margin:10px 0 0;color:var(--ink7);font-size:14px}
.chip.valor{background:var(--warn0);color:var(--warn)}
.chip.vencido-chip{background:#fbe9e9;color:var(--danger)}
.zona-bloque h2{font-size:21px}
.zona-bloque .zona-resumen{margin:-6px 0 4px}
.zona-bloque .zsub{margin-top:20px} .zona-bloque .zsub h3{margin:0 0 10px}
.zona-bloque .chip.zona{display:none}
body.buscando .zona-resumen{display:none}

/* --- Móvil y tableta: el menú baja desde arriba y el mapa va sobre el contenido --- */
@media(max-width:900px){
  .app,.app.sin-mapa{display:flex;flex-direction:column}
  .topbar{display:flex;align-items:center;gap:8px;order:0;position:sticky;top:0;z-index:1000;padding:8px 10px;background:rgba(255,255,255,.97);backdrop-filter:blur(6px);border-bottom:1px solid var(--ink2)}
  .topbar button{display:flex;align-items:center;gap:8px;min-height:44px;border:1px solid var(--ink2);border-radius:12px;background:#fff;color:var(--b7);padding:0 14px;font:inherit;font-weight:700;cursor:pointer}
  .topbar #menu-abrir{flex:1;min-width:0;text-align:left}
  .topbar #menu-abrir span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .topbar svg{width:20px;height:20px;flex:none}
  .velo{position:fixed;inset:0;background:rgba(10,14,18,.4);z-index:1500}
  .velo.abierto{display:block}
  .lateral{position:fixed;top:0;left:0;right:0;height:auto;max-height:88vh;max-height:88dvh;z-index:2000;border-right:0;border-radius:0 0 18px 18px;box-shadow:0 12px 32px rgba(0,0,0,.25);transform:translateY(-105%);transition:transform .22s ease;padding:14px 14px 18px;visibility:hidden}
  .lateral.abierto{transform:none;visibility:visible}
  .lateral__cab{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
  .lateral__cerrar{display:inline-flex;align-items:center;justify-content:center;flex:none;width:44px;height:44px;border:1px solid var(--ink2);border-radius:12px;background:#fff;color:var(--b7);font-size:18px;cursor:pointer}
  .nav a{padding:12px 12px;font-size:15px}
  .vistas button{padding:11px 10px}
  .busca input{padding:12px 14px 12px 36px;font-size:16px}
  .derecha{display:none;order:1;position:static;height:280px;padding:10px 10px 0}
  body.forzar-mapa .derecha{display:flex}
  .topbar{flex-wrap:wrap}
  .topbusca{flex:0 0 100%}
  .topbusca .busca input{min-height:44px}
  body:not(.con-mapa) #mapa-abrir{display:none}
  #mapa-abrir.on{background:var(--b6);color:#fff}
  .fotos{grid-template-columns:repeat(3,1fr);gap:6px}
  .foto img,.sin-imagen{height:96px}
  .foto figcaption{padding:4px 6px}
  .foto__titulo,.foto .hora{display:none}
  #subir{position:fixed;right:14px;bottom:14px;z-index:900;width:46px;height:46px;border-radius:99px;border:0;background:var(--b6);color:#fff;font-size:22px;box-shadow:0 4px 12px rgba(0,0,0,.3);display:none;align-items:center;justify-content:center;cursor:pointer}
  #subir.ver{display:flex}
  /* Zonas plegadas: con decenas de capturas, una lista seguida de miles de píxeles no se recorre en el móvil. */
  .zona-bloque h2{display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;min-height:44px}
  .zona-bloque h2::after{content:'▾';color:var(--ink4);font-size:16px}
  .zona-bloque.plegada h2::after{content:'▸'}
  .zona-bloque.plegada{padding-bottom:10px}
  .zona-bloque.plegada > *:not(h2):not(.zona-resumen){display:none}
  .zona-bloque.plegada h2{margin-bottom:0}
  .centro{order:2;padding:12px 10px 48px}
  section,header.portada{padding:14px 14px}
  .portada h1{font-size:23px}
  .visor__img{padding:8px 8px}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.lateral{transition:none}.pin{transition:none}}

/* --- Impresión: informe lineal, sin menú ni mapa --- */
@media print{
  body{background:#fff}
  .lateral,.derecha,.topbar,.velo,.visor,#resultados,.btn{display:none!important}
  .app,.app.sin-mapa{display:block}
  .centro{padding:0}.centro > *{max-width:none}
  .sec.fuera{display:block!important}
  .zona-bloque.plegada > *{display:block!important}
  .zona-bloque h2::after,#subir,#mapa-abrir,.topbusca{display:none!important}
  body.con-zonas #vista-tipo{display:none!important}
  section,header.portada{border:0;padding:0;break-inside:avoid-page}
  .foto{break-inside:avoid}.fotos{grid-template-columns:repeat(4,1fr)}
}
`;

// Cliente: menú lateral (por tipo / por zona), buscador, visor de fotos y mapa ligado a lo que se ve.
// La selección vive en la URL (#notas, #zona-2, #zonas): se puede compartir y funciona atrás/adelante.
// Sin Leaflet (sin conexión) se deja un aviso en el mapa y el resto del informe no cambia.
const JS = (fotos: unknown[], pines: { n: number; lat: number; lng: number }[], zonas: string[], secciones: string[], urlTeselas: string, hayZonas: boolean) => `
(function(){
  var FOTOS=${JSON.stringify(fotos).replace(/</g, '\\u003c')};
  var PINES=${JSON.stringify(pines)};
  var ZONAS=${JSON.stringify(zonas).replace(/</g, '\\u003c')};
  var SECS=${JSON.stringify(secciones)};
  var URL_TESELAS=${JSON.stringify(urlTeselas)};
  var HAY_ZONAS=${hayZonas};
  // [clave, título, singular, plural, etiqueta del contenedor, clase] en el orden en que se cuenta una zona.
  var TIPOS=[['oportunidad','Oportunidades','oportunidad','oportunidades','ul','tarjetas'],['hallazgo','Hallazgos','hallazgo','hallazgos','ul','tarjetas'],['nota','Notas','nota','notas','div','lista-notas'],['paso','Próximos pasos','próximo paso','próximos pasos','ul','tarjetas'],['audio','Audios','audio','audios','ul','archivos'],['documento','Documentos','documento','documentos','ul','archivos'],['foto','Fotos','foto','fotos','div','fotos']];
  var body=document.body;
  var norm=function(t){return (t||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')};
  var $=function(id){return document.getElementById(id)};
  var todos=function(q){return [].slice.call(document.querySelectorAll(q))};
  // Con zonas, el documento se cuenta zona a zona (lo de cada zona junto); «por tipo» es la alternativa.
  var modo=HAY_ZONAS?'zona':'tipo',vista='resumen',zona=null,texto='';
  var ultimoTipo=SECS[1]||SECS[0],ultimaZona='zonas',cambiandoVista=false;
  var res=$('resultados'),marcadores={},mapa=null;
  var movil=window.matchMedia('(max-width:900px)');

  // --- Filtro: la zona elegida y el texto del buscador se combinan.
  function aplicar(){
    var q=norm(texto),visibles=0,filtrando=!!q||zona!==null;
    todos('.bus').forEach(function(el){
      var okT=!q||norm(el.getAttribute('data-b')).indexOf(q)>=0;
      var okZ=zona===null||el.getAttribute('data-z')===zona;
      el.hidden=!(okT&&okZ);
      if(!el.hidden&&el.closest('#vista-tipo'))visibles++;
    });
    todos('[data-grupo]').forEach(function(g){g.hidden=!g.querySelector('.foto:not([hidden])')});
    todos('.sec').forEach(function(s){
      if(!s.querySelector('.bus'))return;
      var n=s.querySelectorAll('.bus:not([hidden])').length;
      s.hidden=!n;
      var c=s.querySelector('h2 .cuenta');if(c)c.textContent=n;
    });
    todos('.zsub').forEach(function(z){
      var n=z.querySelectorAll('.bus:not([hidden])').length;
      z.hidden=!n;
      var c=z.querySelector('h3 .cuenta');if(c)c.textContent=n;
    });
    todos('.total').forEach(function(t){t.hidden=filtrando});
    if(res)res.textContent=q?(visibles?visibles+(visibles===1?' resultado':' resultados'):'Nada coincide con la búsqueda.'):'';
    actualizarMapa();
  }

  // --- Vista por zona: un bloque por zona con todo lo suyo (copias de lo que ya hay; las fotos no pesan dos veces).
  function construirZonas(){
    var cont=$('vista-zona');
    if(!cont||!HAY_ZONAS||cont.getAttribute('data-ok'))return;
    var origen=todos('#vista-tipo .bus');
    ZONAS.forEach(function(z,i){
      var sec=document.createElement('section');
      sec.className='sec zona-bloque';sec.id='zb-'+i;sec.setAttribute('data-sec','zona-'+i);sec.setAttribute('data-i',i);
      var h=document.createElement('h2');h.textContent=z||'Sin zona';sec.appendChild(h);
      var partes=[],cuerpo=document.createDocumentFragment();
      TIPOS.forEach(function(t){
        var its=origen.filter(function(e){return e.getAttribute('data-t')===t[0]&&(e.getAttribute('data-z')||'')===z});
        if(!its.length)return;
        partes.push(its.length+' '+(its.length===1?t[2]:t[3]));
        var sub=document.createElement('div');sub.className='zsub';
        var h3=document.createElement('h3'),c=document.createElement('span');
        c.className='cuenta';c.textContent=its.length;
        h3.appendChild(document.createTextNode(t[1]+' '));h3.appendChild(c);sub.appendChild(h3);
        var caja=document.createElement(t[4]);caja.className=t[5];
        its.forEach(function(e){var k=e.cloneNode(true);k.removeAttribute('id');caja.appendChild(k)});
        sub.appendChild(caja);cuerpo.appendChild(sub);
      });
      if(!partes.length)return;
      var p=document.createElement('p');p.className='sub zona-resumen';p.textContent=partes.join(' · ');
      sec.appendChild(p);sec.appendChild(cuerpo);cont.appendChild(sec);
    });
    cont.setAttribute('data-ok','1');
  }

  // --- Qué se ve: el resumen, una zona (o todas, una tras otra), una sección por tipo o los resultados de la búsqueda.
  function seleccionar(){
    var buscando=!!norm(texto);
    var zi=vista.indexOf('zona-')===0?parseInt(vista.slice(5),10):-1;
    zona=zi>=0&&!buscando?ZONAS[zi]:null;
    body.setAttribute('data-modo',modo);
    body.classList.toggle('buscando',buscando);
    body.classList.remove('forzar-mapa');
    var bm2=$('mapa-abrir');if(bm2)bm2.classList.remove('on');
    todos('.sec').forEach(function(s){
      var id=s.getAttribute('data-sec'),ver;
      if(s.classList.contains('zona-bloque'))ver=modo==='zona'&&(buscando||vista==='zonas'||s.getAttribute('data-i')===String(zi));
      else if(id==='resumen')ver=!buscando&&vista==='resumen';
      else ver=modo==='tipo'&&(buscando||id===vista);
      s.classList.toggle('fuera',!ver);
      if(s.classList.contains('zona-bloque'))s.classList.toggle('plegada',movil.matches&&!buscando&&vista==='zonas');
    });
    var nt=$('nav-tipo'),nz=$('nav-zona');
    if(nt)nt.hidden=modo==='zona';
    if(nz)nz.hidden=modo!=='zona';
    todos('#vistas button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-modo')===modo)});
    var nombre='';
    todos('.nav a').forEach(function(a){
      var on=a.getAttribute('href')==='#'+vista&&!a.parentNode.hidden;
      a.classList.toggle('activo',on);
      if(on){a.setAttribute('aria-current','page');nombre=a.querySelector('span').textContent}else a.removeAttribute('aria-current');
    });
    var tit=$('menu-actual');if(tit)tit.textContent=nombre;
    body.classList.toggle('con-mapa',(modo==='zona'&&vista!=='resumen')||vista==='fotos');
    aplicar();
    ajustarMapa(true);
  }

  function leerHash(){
    var h=decodeURIComponent(location.hash.slice(1));
    if(!h||h==='resumen')vista='resumen';
    else if(HAY_ZONAS&&h==='zonas'){modo='zona';vista=h;ultimaZona=h}
    else if(HAY_ZONAS&&h.indexOf('zona-')===0&&ZONAS[parseInt(h.slice(5),10)]!==undefined){modo='zona';vista=h;ultimaZona=h}
    else if(SECS.indexOf(h)>=0){modo='tipo';vista=h;ultimoTipo=h}
    seleccionar();
    // Cambiar entre «Por zona» y «Por tipo» deja el menú abierto (falta elegir); elegir algo lo cierra.
    if(!cambiandoVista)cerrarMenu();
    cambiandoVista=false;
    window.scrollTo(0,0);
  }
  window.addEventListener('hashchange',leerHash);

  [].forEach.call(document.querySelectorAll('#vistas button'),function(b){
    b.addEventListener('click',function(){
      var m=b.getAttribute('data-modo');
      if(m===modo)return;
      if(vista==='resumen'){modo=m;seleccionar();return}
      var destino=m==='zona'?ultimaZona:ultimoTipo;
      cambiandoVista=destino!==decodeURIComponent(location.hash.slice(1));
      location.hash='#'+destino;
    });
  });

  var buscar=$('buscar');
  if(buscar){
    buscar.addEventListener('input',function(){texto=buscar.value;seleccionar()});
    buscar.addEventListener('keydown',function(e){if(e.key==='Escape'&&buscar.value){buscar.value='';texto='';seleccionar()}});
  }
  var imp=$('imprimir');if(imp)imp.addEventListener('click',function(){window.print()});

  // --- Menú en móvil: baja desde arriba.
  var lat=$('lateral'),velo=$('velo'),bm=$('menu-abrir');
  function abrirMenu(foco){lat.classList.add('abierto');velo.classList.add('abierto');if(bm)bm.setAttribute('aria-expanded','true');if(foco&&buscar)setTimeout(function(){buscar.focus()},230)}
  function cerrarMenu(){if(!lat)return;lat.classList.remove('abierto');velo.classList.remove('abierto');if(bm)bm.setAttribute('aria-expanded','false')}
  if(bm)bm.addEventListener('click',function(){lat.classList.contains('abierto')?cerrarMenu():abrirMenu(false)});
  // En móvil el buscador sale en la barra de arriba (dentro del menú, que tapa la pantalla, los resultados no se veían).
  var ba=$('buscar-abrir'),tb=$('topbusca'),cb=document.querySelector('.busca'),cbPadre=cb&&cb.parentNode,cbSig=cb&&cb.nextSibling;
  function colocarBuscador(){
    if(!cb||!tb)return;
    if(movil.matches)tb.appendChild(cb);
    else{cbPadre.insertBefore(cb,cbSig);tb.hidden=true}
  }
  if(movil.addEventListener)movil.addEventListener('change',colocarBuscador);
  colocarBuscador();
  if(ba)ba.addEventListener('click',function(){
    if(!movil.matches){abrirMenu(true);return}
    cerrarMenu();
    tb.hidden=!tb.hidden;
    if(!tb.hidden&&buscar)buscar.focus();
    else if(buscar&&buscar.value){buscar.value='';texto='';seleccionar()}
  });
  var bmapa=$('mapa-abrir');
  if(bmapa)bmapa.addEventListener('click',function(){
    var on=body.classList.toggle('forzar-mapa');
    bmapa.classList.toggle('on',on);
    if(on){ajustarMapa(true);window.scrollTo(0,0)}
  });
  var sub=$('subir');
  if(sub){
    window.addEventListener('scroll',function(){sub.classList.toggle('ver',window.scrollY>600)},{passive:true});
    sub.addEventListener('click',function(){window.scrollTo(0,0)});
  }
  document.addEventListener('click',function(e){
    var h=e.target.closest&&e.target.closest('.zona-bloque h2');
    if(h&&movil.matches)h.parentNode.classList.toggle('plegada');
  });
  var mc=$('menu-cerrar');if(mc)mc.addEventListener('click',cerrarMenu);
  if(velo)velo.addEventListener('click',cerrarMenu);

  // --- Visor de fotos.
  var visor=$('visor'),vImg=$('visor-img'),vPie=$('visor-pie');
  var lista=[],pos=0;
  function numeros(q){return [].slice.call(document.querySelectorAll(q)).map(function(e){return +e.getAttribute('data-n')})}
  function visibles2(){return numeros(modo==='zona'?'#vista-zona .zona-bloque:not(.fuera) .foto:not([hidden])':'#fotos .foto:not([hidden])')}
  function esc(t){return String(t==null?'':t).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
  function attr(t){return esc(t).replace(/"/g,'&quot;')}
  function mostrar(){
    var n=lista[pos],f=FOTOS.filter(function(x){return x.n===n})[0];if(!f)return;
    var src=document.querySelector('#foto-'+n+' img');
    vImg.src=src?src.src:'';vImg.alt=f.titulo||('Foto '+f.n);
    var h='<span class="tit">'+f.n+' · '+esc(f.titulo||'Foto')+'</span><span class="meta">'+esc(f.zona||'Sin zona')+' · '+esc(f.hora)+' · '+(pos+1)+'/'+lista.length+'</span>';
    if(f.url)h+='<a href="'+attr(f.url)+'" target="_blank" rel="noreferrer">Original</a>';
    if(f.lat!=null)h+='<a href="https://www.google.com/maps/search/?api=1&query='+f.lat+','+f.lng+'" target="_blank" rel="noreferrer">Google Maps</a><button type="button" data-mapa="'+f.n+'">Ver en el mapa</button>';
    vPie.innerHTML=h;
    resaltar(n);
    var b=vPie.querySelector('[data-mapa]');if(b)b.addEventListener('click',function(){cerrar();irAlMapa(f.n)});
  }
  function abrir(n){lista=visibles2();if(lista.indexOf(n)<0)lista=numeros('#fotos .foto:not([hidden])');pos=Math.max(0,lista.indexOf(n));if(!lista.length)return;visor.classList.add('abierto');mostrar();document.body.style.overflow='hidden'}
  function cerrar(){visor.classList.remove('abierto');document.body.style.overflow=''}
  function mover(d){if(!lista.length)return;pos=(pos+d+lista.length)%lista.length;mostrar()}
  document.addEventListener('click',function(e){var f=e.target.closest&&e.target.closest('.foto');if(f&&!visor.contains(f))abrir(+f.getAttribute('data-n'))});
  // Al pasar por una foto se marca su pin en el mapa.
  document.addEventListener('mouseover',function(e){var f=e.target.closest&&e.target.closest('.foto');if(f&&!visor.contains(f))resaltar(+f.getAttribute('data-n'))});
  document.addEventListener('keydown',function(e){
    if(visor.classList.contains('abierto')){
      if(e.key==='Escape')cerrar();if(e.key==='ArrowLeft')mover(-1);if(e.key==='ArrowRight')mover(1);return;
    }
    if(e.key==='Escape')cerrarMenu();
    if((e.key==='Enter'||e.key===' ')&&e.target.classList&&e.target.classList.contains('foto')){e.preventDefault();abrir(+e.target.getAttribute('data-n'))}
  });
  $('visor-cerrar').addEventListener('click',cerrar);
  $('visor-ant').addEventListener('click',function(){mover(-1)});
  $('visor-sig').addEventListener('click',function(){mover(1)});
  visor.addEventListener('click',function(e){if(e.target===visor||e.target.id==='visor-imgbox')cerrar()});
  var x0=null;
  visor.addEventListener('touchstart',function(e){x0=e.touches[0].clientX},{passive:true});
  visor.addEventListener('touchend',function(e){if(x0==null)return;var dx=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(dx)>50)mover(dx<0?1:-1)});

  // --- Mapa (Leaflet + OpenStreetMap a través de la función tile-mapa: el servidor pide la tesela con
  // el User-Agent y el Referer que OSM exige, así cargan también las páginas blob: y los archivos descargados).
  function resaltar(n){
    Object.keys(marcadores).forEach(function(k){
      var m=marcadores[k],e=m.getElement&&m.getElement();
      if(e&&e.firstChild)e.firstChild.classList.toggle('sel',+k===n);
      m.setZIndexOffset(+k===n?1000:0);
    });
  }
  function irAlMapa(n){
    var el=$('mapa-fotos');if(!el||!mapa||!marcadores[n])return;
    body.classList.add('forzar-mapa');
    setTimeout(function(){
      mapa.invalidateSize();
      if(!mapa.hasLayer(marcadores[n]))marcadores[n].addTo(mapa);
      mapa.flyTo(marcadores[n].getLatLng(),18);resaltar(n);
      el.scrollIntoView({behavior:'smooth',block:'center'});
    },60);
  }
  function actualizarMapa(){
    if(!mapa)return;
    var k=0;
    PINES.forEach(function(p){
      var f=$('foto-'+p.n),on=f&&!f.hidden,m=marcadores[p.n];
      if(on)k++;
      if(on&&!mapa.hasLayer(m))m.addTo(mapa);
      if(!on&&mapa.hasLayer(m))mapa.removeLayer(m);
    });
    var nota=$('mapa-nota');
    if(nota)nota.textContent=k?k+(k===1?' foto con ubicación en esta vista. Pulsa un pin para verla.':' fotos con ubicación en esta vista. Pulsa un pin para verlas.'):'Ninguna foto de esta vista tiene ubicación.';
  }
  function ajustarMapa(encuadrar){
    if(!mapa)return;
    setTimeout(function(){
      mapa.invalidateSize();
      if(!encuadrar)return;
      var pts=PINES.filter(function(p){return mapa.hasLayer(marcadores[p.n])}).map(function(p){return [p.lat,p.lng]});
      if(pts.length===1)mapa.setView(pts[0],17);else if(pts.length)mapa.fitBounds(pts,{padding:[30,30],maxZoom:18});
    },60);
  }
  window.addEventListener('resize',function(){ajustarMapa(false)});
  var elMapa=$('mapa-fotos');
  if(elMapa&&PINES.length){
    if(!window.L){elMapa.textContent='El mapa necesita conexión a internet. Las coordenadas de cada foto están en su visor (Google Maps).'}
    else{
      mapa=L.map(elMapa,{scrollWheelZoom:true});
      L.tileLayer(URL_TESELAS+'?z={z}&x={x}&y={y}',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(mapa);
      PINES.forEach(function(p){
        var m=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:'<div class="pin">'+p.n+'</div>',iconSize:[28,28],iconAnchor:[14,14]})});
        m.on('click',function(){abrir(p.n)});
        marcadores[p.n]=m;
      });
      mapa.setView([PINES[0].lat,PINES[0].lng],15);
    }
  }
  construirZonas();
  leerHash();
})();
`;

const ICONO = {
  buscar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  abrir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  imprimir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z"/></svg>',
};

export function generarInformeHtml(d: DatosInformeHtml): string {
  const pines = d.fotos
    .filter((f) => f.latitud != null && f.longitud != null)
    .map((f) => ({ n: f.n, lat: f.latitud as number, lng: f.longitud as number }));
  const fotosJs = d.fotos.map((f) => ({
    n: f.n,
    titulo: f.titulo,
    zona: f.zona,
    hora: horaDe(f.creadoEn),
    url: f.urlOriginal,
    lat: f.latitud,
    lng: f.longitud,
  }));

  // Zonas ('' = sin zona) y cuántos elementos tiene cada una, de todo lo que lleva zona.
  const zonas = new Map<string, number>();
  const cuenta = (z: string) => zonas.set(z, (zonas.get(z) ?? 0) + 1);
  d.fotos.forEach((f) => cuenta(f.zona));
  d.hallazgos.forEach((h) => cuenta(zonaDe(h.zona_texto, h.ubicacion)));
  d.oportunidades.forEach((o) => cuenta(zonaDe(o.zona_texto, o.ubicacion)));
  d.pasos.forEach((p) => cuenta(zonaDe(p.zona_texto)));
  d.notas.forEach((n) => cuenta(n.zona));
  d.audios.forEach((a) => cuenta(a.zona));
  d.documentos.forEach((a) => cuenta(a.zona));
  const zonasOrden = ordenarZonas(zonas);
  const hayZonas = zonasOrden.some((z) => z !== '');
  const totalElementos = [...zonas.values()].reduce((s, n) => s + n, 0);

  // «Resumen» = portada + resumen/objetivo. Siempre existe: la portada lleva lo esencial de la visita.
  const resumenHtml =
    d.resumenTexto || d.objetivo
      ? [
          d.resumenTexto
            ? `<p style="margin:0;white-space:pre-wrap">${esc(d.resumenTexto)}</p>${d.resumenManual ? '<p class="sub">Resumen editado a mano por el comercial.</p>' : ''}`
            : '',
          // El resumen automático ya empieza por «Ibas a: <objetivo>»: no se repite.
          d.objetivo && !(d.resumenTexto ?? '').includes(d.objetivo)
            ? `<p style="margin:${d.resumenTexto ? '10px' : '0'} 0 0"><strong>Objetivo:</strong> ${esc(d.objetivo)}</p>`
            : '',
        ].join('')
      : '';

  const tipos: { id: string; label: string; n: number | null; html: string }[] = [];
  if (d.pasos.length) tipos.push({ id: 'pasos', label: 'Próximos pasos', n: d.pasos.length, html: seccion('pasos', 'Próximos pasos', d.pasos.length, listaPasos(d.pasos)) });
  if (d.oportunidades.length)
    tipos.push({ id: 'oportunidades', label: 'Oportunidades', n: d.oportunidades.length, html: seccion('oportunidades', 'Oportunidades', d.oportunidades.length, listaOportunidades(d.oportunidades)) });
  if (d.hallazgos.length)
    tipos.push({ id: 'hallazgos', label: 'Hallazgos', n: d.hallazgos.length, html: seccion('hallazgos', 'Hallazgos', d.hallazgos.length, listaHallazgos(d.hallazgos)) });
  if (d.notas.length) tipos.push({ id: 'notas', label: 'Notas', n: d.notas.length, html: seccion('notas', 'Notas', d.notas.length, listaNotas(d.notas)) });
  if (d.fotos.length) tipos.push({ id: 'fotos', label: 'Fotos', n: d.fotos.length, html: seccionFotos(d.fotos) });
  const audios = listaArchivos('audios', 'audio', 'Audios', d.audios, 'Escuchar');
  if (audios) tipos.push({ id: 'audios', label: 'Audios', n: d.audios.length, html: audios });
  const documentos = listaArchivos('documentos', 'documento', 'Documentos', d.documentos, 'Abrir');
  if (documentos) tipos.push({ id: 'documentos', label: 'Documentos', n: d.documentos.length, html: documentos });

  const secciones = ['resumen', ...tipos.map((t) => t.id)];
  const SINGULAR: Record<string, string> = {
    pasos: 'próximo paso', oportunidades: 'oportunidad', hallazgos: 'hallazgo', notas: 'nota', fotos: 'foto', audios: 'audio', documentos: 'documento',
  };
  const kpis = tipos
    .filter((s) => s.n != null)
    .map((s) => `<span>${s.n} ${esc(s.n === 1 ? SINGULAR[s.id] ?? s.label.toLowerCase() : s.label.toLowerCase())}</span>`)
    .join('');

  const item = (href: string, label: string, n: number | null) =>
    `<a href="#${href}"><span>${esc(label)}</span>${n != null ? `<b>${n}</b>` : ''}</a>`;
  const navTipo = [item('resumen', 'Resumen', null), ...tipos.map((t) => item(t.id, t.label, t.n))].join('');
  const navZona = hayZonas
    ? [item('resumen', 'Resumen', null), item('zonas', 'Todas las zonas', totalElementos), ...zonasOrden.map((z, i) => item(`zona-${i}`, z || 'Sin zona', zonas.get(z) ?? 0))].join('')
    : '';

  const lateral = `<aside class="lateral" id="lateral" aria-label="Navegación del informe">
    <div class="lateral__cab">
      <div><div class="lateral__cliente">${esc(d.clienteNombre)}</div><div class="lateral__sub">INFORME DE VISITA</div></div>
      <button class="lateral__cerrar" id="menu-cerrar" type="button" aria-label="Cerrar el menú">✕</button>
    </div>
    <div class="busca">${ICONO.buscar}<input id="buscar" type="search" placeholder="Buscar en el informe" aria-label="Buscar en el informe"></div>
    ${hayZonas ? `<div class="vistas" id="vistas" role="group" aria-label="Ver por"><button type="button" class="on" data-modo="zona">Por zona</button><button type="button" data-modo="tipo">Por tipo</button></div>` : ''}
    <nav class="nav" id="nav-tipo" aria-label="Por tipo"${hayZonas ? ' hidden' : ''}>${navTipo}</nav>
    ${hayZonas ? `<nav class="nav" id="nav-zona" aria-label="Por zona">${navZona}</nav>` : ''}
    <div class="lateral__pie">
      ${d.enlaceApp ? `<a class="accion" href="${esc(d.enlaceApp)}" target="_blank" rel="noreferrer">${ICONO.abrir}Abrir la visita</a>` : ''}
      <button class="accion" id="imprimir" type="button">${ICONO.imprimir}Imprimir</button>
    </div>
  </aside>`;

  const topbar = `<header class="topbar">
    <button id="menu-abrir" type="button" aria-expanded="false" aria-controls="lateral">${ICONO.menu}<span id="menu-actual">Resumen</span></button>
    ${pines.length ? `<button id="mapa-abrir" type="button" aria-label="Ver el mapa de las fotos">Mapa</button>` : ''}
    <button id="buscar-abrir" type="button" aria-label="Buscar en el informe">${ICONO.buscar}</button>
    <div class="topbusca" id="topbusca" hidden></div>
  </header>
  <div class="velo" id="velo"></div>`;

  const portada = `<header class="portada sec" data-sec="resumen">
    ${d.logo ? `<img class="logo" src="${d.logo}" alt="Primion">` : ''}
    <div class="tipo">INFORME DE VISITA</div>
    <h1>${esc(d.clienteNombre)}</h1>
    <div class="proyecto">Proyecto · ${esc(d.proyectoNombre)}</div>
    ${d.metaCliente ? `<div class="sub">${esc(d.metaCliente)}</div>` : ''}
    <div class="linea">${esc(d.lineaVisita)}</div>
    ${d.lineaHistorico ? `<div class="sub">${esc(d.lineaHistorico)}</div>` : ''}
    ${bloqueQuienes(d.participantes, d.interlocutores)}
    ${kpis ? `<div class="kpis">${kpis}</div>` : ''}
    ${d.enCurso ? `<div class="aviso">Esta visita figura como en curso: puede haber información registrada después de generar este informe que aquí no aparece.</div>` : ''}
    ${d.avisos.map((a) => `<div class="aviso">${esc(a)}</div>`).join('')}
  </header>`;

  const resumen = resumenHtml ? seccion('resumen', 'Resumen', null, resumenHtml) : '';

  const mapa = pines.length
    ? `<aside class="derecha" id="derecha" aria-label="Mapa de las fotos">
        <div class="derecha__tit">Mapa de fotos</div>
        <div id="mapa-fotos" class="mapa" aria-label="Mapa con la ubicación de las fotos"></div>
        <p class="mapa-nota" id="mapa-nota">${pines.length} de ${d.fotos.length} fotos con ubicación.</p>
      </aside>`
    : '';

  const visor = `<div class="visor" id="visor" role="dialog" aria-modal="true" aria-label="Visor de fotos">
    <button class="visor__cerrar" id="visor-cerrar" type="button" aria-label="Cerrar">✕</button>
    <div class="visor__img" id="visor-imgbox"><button class="visor__nav ant" id="visor-ant" type="button" aria-label="Foto anterior">‹</button><img id="visor-img" alt=""><button class="visor__nav sig" id="visor-sig" type="button" aria-label="Foto siguiente">›</button></div>
    <div class="visor__pie" id="visor-pie"></div>
  </div>`;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe de visita · ${esc(d.clienteNombre)}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>${CSS}</style></head>
<body${hayZonas ? ' class="con-zonas"' : ''}>
<div class="app${pines.length ? '' : ' sin-mapa'}">
${topbar}
${lateral}
<main class="centro" id="centro">
<p id="resultados" aria-live="polite"></p>
${portada}
${resumen}
<div id="vista-tipo">${tipos.map((s) => s.html).join('\n')}</div>
<div id="vista-zona"></div>
<footer>Generado el ${esc(d.generadoEn)} por PrimeNotes · documento interno. Refleja el estado de la visita en el momento de generarlo.</footer>
</main>
${mapa}
</div>
${visor}
<button id="subir" type="button" aria-label="Volver arriba">↑</button>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>${JS(fotosJs, pines, zonasOrden, secciones, d.urlTeselas, hayZonas)}</script>
</body></html>`;
}
