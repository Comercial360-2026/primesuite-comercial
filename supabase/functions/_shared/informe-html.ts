// supabase/functions/_shared/informe-html.ts
//
// Informe de visita en formato WEB: un único archivo .html que se abre en cualquier navegador y se
// NAVEGA como una página, no se lee como un documento: menú fijo con las secciones (solo las que
// tienen contenido), buscador, filtro por zona (afecta a hallazgos, fotos y mapa), visor de fotos con
// flechas / teclado / deslizar, mapa con pines ligado a las fotos y enlaces a los originales, audios
// y documentos (en SharePoint o en el zip). Las fotos van como MINIATURAS embebidas (~50 KB cada una);
// el original queda en su carpeta (botón «Original»).
//
// El mapa usa Leaflet + OpenStreetMap (necesitan conexión). Sin conexión el informe sigue entero: el
// mapa se sustituye por un aviso y cada foto conserva sus coordenadas y su enlace a Google Maps.

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
  ruta: string | null; // ruta relativa dentro del zip (audios/…, documentos/…)
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
  enZip: boolean; // true = los archivos de audios/ y documentos/ están junto a este .html
  avisos: string[]; // "2 fotos no se pudieron recuperar…"
  generadoEn: string; // "2 de octubre de 2026, 10:41"
  logo: string | null; // data URI
  enlaceApp: string | null; // «Abrir en PrimeNotes» (la visita viva)
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

const zonaDe = (texto: string | null | undefined, ubicacion?: { nombre: string } | null) =>
  (texto || ubicacion?.nombre || '').trim();
const chipZona = (z: string) => (z ? `<span class="chip zona">${esc(z)}</span>` : '');
// Atributos comunes de todo elemento filtrable: tipo, zona ('' = sin zona) y texto de búsqueda.
const attrs = (tipo: string, zona: string, texto: string, clase = '') =>
  `class="${clase ? `${clase} ` : ''}bus" data-t="${tipo}" data-z="${esc(zona)}" data-b="${texto}"`;

function seccion(id: string, titulo: string, cuenta: number | null, cuerpo: string) {
  return `<section id="${id}"><h2>${esc(titulo)}${cuenta != null ? ` <span class="cuenta">${cuenta}</span>` : ''}</h2>${cuerpo}</section>`;
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

function seccionMapa(fotos: FotoHtml[]) {
  const situadas = fotos.filter((f) => f.latitud != null && f.longitud != null);
  if (!situadas.length) return '';
  return seccion(
    'mapa-sec',
    'Mapa',
    null,
    `<div id="mapa-fotos" class="mapa" aria-label="Mapa con la ubicación de las fotos"></div>
     <p class="mapa-nota">${situadas.length} de ${fotos.length} fotos con ubicación. Pulsa un pin para ver su foto.</p>`
  );
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

function listaArchivos(id: string, tipo: string, titulo: string, archivos: ArchivoHtml[], enZip: boolean, verbo: string) {
  if (!archivos.length) return '';
  return seccion(
    id,
    titulo,
    archivos.length,
    `<ul class="archivos">${archivos
      .map((a) => {
        const enlace = enZip && a.ruta ? encodeURI(a.ruta) : a.url;
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
main{max-width:980px;margin:0 auto;padding:16px 16px 64px}
.barra{position:sticky;top:0;z-index:1000;background:rgba(255,255,255,.96);backdrop-filter:blur(6px);border-bottom:1px solid var(--ink2)}
.barra__in{max-width:980px;margin:0 auto;padding:8px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px}
.barra__titulo{font-weight:700;color:var(--b7);white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis}
.menu{display:flex;gap:6px;overflow-x:auto;flex:1 1 320px;min-width:0;scrollbar-width:thin}
.menu a{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;text-decoration:none;color:var(--ink7);padding:5px 11px;border-radius:99px;font-size:13px;font-weight:600;background:var(--ink1)}
.menu a:hover,.menu a.activo{background:var(--b6);color:#fff}
.menu a b{font-weight:700;opacity:.7}
.barra input[type=search]{flex:0 1 200px;min-width:120px;border:1px solid var(--ink2);border-radius:99px;padding:6px 14px;font:inherit;font-size:13px}
.btn{display:inline-block;border:1px solid var(--ink2);background:#fff;color:var(--b6);border-radius:99px;padding:5px 13px;font:inherit;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;white-space:nowrap}
.btn:hover{border-color:var(--b6)}
.btn.primario{background:var(--b6);color:#fff;border-color:var(--b6)}
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
.kpis a{text-decoration:none;background:var(--ink1);color:var(--b6);border-radius:99px;padding:3px 12px;font-size:13px;font-weight:600}
.kpis a:hover{background:var(--b6);color:#fff}
.aviso{margin-top:14px;padding:10px 14px;border:1px solid var(--warn);background:var(--warn0);color:var(--warn);border-radius:10px;font-size:13px}
.filtros{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 14px}
.filtros .etq{color:var(--ink4);font-size:13px;font-weight:600;margin-right:4px}
.filtros button{border:1px solid var(--ink2);background:#fff;border-radius:99px;padding:4px 12px;font:inherit;font-size:13px;cursor:pointer;color:var(--ink7)}
.filtros button.on{background:var(--b6);border-color:var(--b6);color:#fff}
#resultados{color:var(--ink4);font-size:13px;margin:0 0 10px;min-height:1em}
section{background:#fff;border:1px solid var(--ink1);border-radius:14px;padding:18px 22px;margin-bottom:14px;scroll-margin-top:72px}
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
.mapa{height:340px;border-radius:12px;border:1px solid var(--ink2);background:var(--ink1);display:flex;align-items:center;justify-content:center;color:var(--ink4);text-align:center;padding:16px;isolation:isolate}
.mapa-nota{margin:8px 0 0;color:var(--ink4);font-size:13px}
.fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.foto{margin:0;border:1px solid var(--ink1);border-radius:10px;overflow:hidden;background:#fff;cursor:zoom-in;outline:none}
.foto:hover,.foto:focus-visible{border-color:var(--b6);box-shadow:0 0 0 2px rgba(26,54,84,.2)}
.foto img{display:block;width:100%;height:120px;object-fit:cover;background:var(--ink1)}
.sin-imagen{height:120px;display:flex;align-items:center;justify-content:center;background:var(--ink1);color:var(--ink4);font-size:12px;padding:8px;text-align:center}
.foto figcaption{display:flex;align-items:center;gap:6px;padding:6px 8px;font-size:12px}
.foto__titulo{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.num{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:99px;background:var(--b6);color:#fff;font-size:11px;font-weight:700}
.hora{margin-left:auto;color:var(--ink4);font-weight:400;font-size:12px}
a{color:var(--b6)}
.archivos{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.archivos li{display:flex;align-items:center;gap:10px;border:1px solid var(--ink1);border-radius:10px;padding:8px 12px}
.archivo__titulo{flex:1;min-width:0;font-weight:600}
.pin{width:28px;height:28px;border-radius:99px;background:var(--b6);color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font:700 12px/1 -apple-system,Segoe UI,Roboto,sans-serif}
.visor{position:fixed;inset:0;background:rgba(10,14,18,.94);display:none;flex-direction:column;z-index:3000}
.visor.abierto{display:flex}
.visor__img{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:12px 56px;position:relative}
.visor__img img{max-width:100%;max-height:100%;border-radius:8px;object-fit:contain}
.visor__nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:99px;border:0;background:rgba(255,255,255,.16);color:#fff;font-size:22px;cursor:pointer}
.visor__nav:hover{background:rgba(255,255,255,.3)} .visor__nav.ant{left:8px} .visor__nav.sig{right:8px}
.visor__cerrar{position:absolute;top:10px;right:12px;z-index:2;width:40px;height:40px;border-radius:99px;border:0;background:rgba(255,255,255,.16);color:#fff;font-size:20px;cursor:pointer}
.visor__pie{padding:12px 16px 16px;color:#fff;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;justify-content:center;font-size:14px}
.visor__pie a,.visor__pie button{color:#fff;border:1px solid rgba(255,255,255,.4);background:transparent;border-radius:99px;padding:4px 12px;font:inherit;font-size:13px;text-decoration:none;cursor:pointer}
.visor__pie a:hover,.visor__pie button:hover{background:rgba(255,255,255,.18)}
.visor__pie .tit{font-weight:700} .visor__pie .meta{opacity:.75}
footer{color:var(--ink4);font-size:12px;text-align:center;margin-top:24px}
.total{margin:10px 0 0;color:var(--ink7);font-size:14px}
.chip.valor{background:var(--warn0);color:var(--warn)}
.chip.vencido-chip{background:#fbe9e9;color:var(--danger)}
.herramientas{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;margin:0 0 12px}
.vistas{display:inline-flex;border:1px solid var(--ink2);border-radius:99px;overflow:hidden;background:#fff}
.vistas button{border:0;background:transparent;padding:5px 14px;font:inherit;font-size:13px;font-weight:600;color:var(--ink7);cursor:pointer}
.vistas button.on{background:var(--b6);color:#fff}
.menu[data-vista=zona]{display:none}
body.modo-zona .menu[data-vista=tipo]{display:none}
body.modo-zona .menu[data-vista=zona]{display:flex}
#vista-zona section h3{margin:16px 0 8px}
#vista-zona .lista{display:grid;gap:10px}
#vista-zona .archivos{margin:0}
[hidden]{display:none!important}
@media(max-width:640px){main{padding:10px 10px 48px} section,header.portada{padding:14px 14px} .barra__titulo{max-width:100%} .portada h1{font-size:23px} .visor__img{padding:8px 8px}}
@media print{body{background:#fff}.barra,.filtros,#resultados,.mapa-bloque,.visor,.btn{display:none!important}section,header.portada{border:0;padding:0;break-inside:avoid-page}.foto{break-inside:avoid}.fotos{grid-template-columns:repeat(4,1fr)}}
`;

// Cliente: buscador + filtro por zona (se combinan), vista por tipo / por zona, visor de fotos y mapa.
// Sin Leaflet (sin conexión) se deja un aviso y el resto del informe no cambia.
const JS = (fotos: unknown[], pines: { n: number; lat: number; lng: number }[], zonas: string[]) => `
(function(){
  var FOTOS=${JSON.stringify(fotos).replace(/</g, '\\u003c')};
  var PINES=${JSON.stringify(pines)};
  var ZONAS=${JSON.stringify(zonas).replace(/</g, '\\u003c')};
  var TIPOS=[['hallazgo','Hallazgos'],['oportunidad','Oportunidades'],['nota','Notas'],['paso','Próximos pasos'],['audio','Audios'],['documento','Documentos'],['foto','Fotos']];
  var norm=function(t){return (t||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')};
  var zona=null,texto='',modo='tipo';
  var res=document.getElementById('resultados');
  var marcadores={},mapa=null;

  function aplicar(){
    var q=norm(texto),visibles=0;
    [].forEach.call(document.querySelectorAll('.bus'),function(el){
      var okT=!q||norm(el.getAttribute('data-b')).indexOf(q)>=0;
      var okZ=zona===null||el.getAttribute('data-z')===zona;
      el.hidden=!(okT&&okZ);
    });
    [].forEach.call(document.querySelectorAll('.vista:not([hidden]) .bus:not([hidden])'),function(){visibles++});
    [].forEach.call(document.querySelectorAll('[data-grupo]'),function(g){g.hidden=!g.querySelector('.foto:not([hidden])')});
    [].forEach.call(document.querySelectorAll('.vista section'),function(s){
      if(s.querySelector('.bus'))s.hidden=!s.querySelector('.bus:not([hidden])');
    });
    if(res)res.textContent=(q||zona!==null)?(visibles+(visibles===1?' resultado':' resultados')):'';
    if(mapa){Object.keys(marcadores).forEach(function(n){
      var f=document.querySelector('#vista-tipo .foto[data-n="'+n+'"]'),on=f&&!f.hidden;
      if(on&&!mapa.hasLayer(marcadores[n]))marcadores[n].addTo(mapa);
      if(!on&&mapa.hasLayer(marcadores[n]))mapa.removeLayer(marcadores[n]);
    })}
  }
  var buscar=document.getElementById('buscar');
  if(buscar)buscar.addEventListener('input',function(){texto=buscar.value;aplicar()});
  [].forEach.call(document.querySelectorAll('#zonas button'),function(b){
    b.addEventListener('click',function(){
      var z=b.getAttribute('data-z');zona=(z===null||z==='*')?null:z;
      [].forEach.call(document.querySelectorAll('#zonas button'),function(x){x.classList.toggle('on',x===b)});
      aplicar();
    });
  });
  var imp=document.getElementById('imprimir');if(imp)imp.addEventListener('click',function(){window.print()});

  // Vista por zona: se construye una vez con copias de lo que ya hay (las fotos no pesan dos veces).
  function construirZonas(){
    var cont=document.getElementById('vista-zona');if(!cont||cont.getAttribute('data-ok'))return;
    var origen=[].slice.call(document.querySelectorAll('#vista-tipo .bus'));
    var nav=document.querySelector('.menu[data-vista=zona]');
    ZONAS.forEach(function(z,i){
      var sec=document.createElement('section');sec.id='zona-'+i;
      var h=document.createElement('h2');h.textContent=z||'Sin zona';sec.appendChild(h);
      TIPOS.forEach(function(t){
        var its=origen.filter(function(e){return e.getAttribute('data-t')===t[0]&&(e.getAttribute('data-z')||'')===z});
        if(!its.length)return;
        var h3=document.createElement('h3');h3.textContent=t[1]+' ('+its.length+')';sec.appendChild(h3);
        var caja=document.createElement('div');caja.className=t[0]==='foto'?'fotos':'lista';
        its.forEach(function(e){var c=e.cloneNode(true);c.removeAttribute('id');caja.appendChild(c)});
        sec.appendChild(caja);
      });
      if(!sec.querySelector('.bus'))return;
      cont.appendChild(sec);
      var a=document.createElement('a');a.href='#zona-'+i;a.textContent=z||'Sin zona';nav.appendChild(a);
    });
    cont.setAttribute('data-ok','1');
  }
  [].forEach.call(document.querySelectorAll('#vistas button'),function(b){
    b.addEventListener('click',function(){
      modo=b.getAttribute('data-modo');
      if(modo==='zona')construirZonas();
      document.getElementById('vista-tipo').hidden=modo==='zona';
      document.getElementById('vista-zona').hidden=modo!=='zona';
      document.body.classList.toggle('modo-zona',modo==='zona');
      [].forEach.call(document.querySelectorAll('#vistas button'),function(x){x.classList.toggle('on',x===b)});
      aplicar();window.scrollTo({top:0});
    });
  });

  // Menú: marca la sección que se está viendo.
  if('IntersectionObserver' in window){
    var obs=new IntersectionObserver(function(es){es.forEach(function(e){
      if(e.isIntersecting)[].forEach.call(document.querySelectorAll('.menu a'),function(a){a.classList.toggle('activo',a.getAttribute('href')==='#'+e.target.id)});
    })},{rootMargin:'-20% 0px -70% 0px'});
    [].forEach.call(document.querySelectorAll('main section'),function(s){obs.observe(s)});
  }

  // Visor de fotos.
  var visor=document.getElementById('visor'),vImg=document.getElementById('visor-img'),vPie=document.getElementById('visor-pie');
  var lista=[],pos=0;
  function visibles2(){return [].slice.call(document.querySelectorAll('.vista:not([hidden]) .foto:not([hidden])')).map(function(e){return +e.getAttribute('data-n')})}
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
    var b=vPie.querySelector('[data-mapa]');if(b)b.addEventListener('click',function(){cerrar();irAlMapa(f.n)});
  }
  function abrir(n){lista=visibles2();pos=Math.max(0,lista.indexOf(n));if(!lista.length)return;visor.classList.add('abierto');mostrar();document.body.style.overflow='hidden'}
  function cerrar(){visor.classList.remove('abierto');document.body.style.overflow=''}
  function mover(d){if(!lista.length)return;pos=(pos+d+lista.length)%lista.length;mostrar()}
  document.addEventListener('click',function(e){var f=e.target.closest&&e.target.closest('.foto');if(f&&!visor.contains(f))abrir(+f.getAttribute('data-n'))});
  document.addEventListener('keydown',function(e){
    if(visor.classList.contains('abierto')){
      if(e.key==='Escape')cerrar();if(e.key==='ArrowLeft')mover(-1);if(e.key==='ArrowRight')mover(1);return;
    }
    if((e.key==='Enter'||e.key===' ')&&e.target.classList&&e.target.classList.contains('foto')){e.preventDefault();abrir(+e.target.getAttribute('data-n'))}
  });
  document.getElementById('visor-cerrar').addEventListener('click',cerrar);
  document.getElementById('visor-ant').addEventListener('click',function(){mover(-1)});
  document.getElementById('visor-sig').addEventListener('click',function(){mover(1)});
  visor.addEventListener('click',function(e){if(e.target===visor||e.target.id==='visor-imgbox')cerrar()});
  var x0=null;
  visor.addEventListener('touchstart',function(e){x0=e.touches[0].clientX},{passive:true});
  visor.addEventListener('touchend',function(e){if(x0==null)return;var dx=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(dx)>50)mover(dx<0?1:-1)});

  // Mapa (Leaflet + OpenStreetMap).
  function irAlMapa(n){
    var el=document.getElementById('mapa-fotos');if(!el)return;
    el.scrollIntoView({behavior:'smooth',block:'center'});
    if(mapa&&marcadores[n]){mapa.flyTo(marcadores[n].getLatLng(),18)}
  }
  var el=document.getElementById('mapa-fotos');
  if(el&&PINES.length){
    if(!window.L){el.textContent='El mapa necesita conexión a internet. Las coordenadas de cada foto están en su visor (Google Maps).'}
    else{
      mapa=L.map(el,{scrollWheelZoom:false});
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(mapa);
      var pts=[];
      PINES.forEach(function(p){
        var m=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:'<div class="pin">'+p.n+'</div>',iconSize:[28,28],iconAnchor:[14,14]})}).addTo(mapa);
        m.on('click',function(){
          var f=document.querySelector('#vista-tipo .foto[data-n="'+p.n+'"]');
          if(f&&f.hidden){var todas=document.querySelector('#zonas button[data-z="*"]');if(todas)todas.click()}
          abrir(p.n);
        });
        marcadores[p.n]=m;pts.push([p.lat,p.lng]);
      });
      if(pts.length===1)mapa.setView(pts[0],17);else mapa.fitBounds(pts,{padding:[30,30],maxZoom:18});
    }
  }
})();
`;

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
  // Con nombre, de más a menos elementos; «Sin zona» siempre al final.
  const zonasOrden = [...zonas.keys()].filter((z) => z !== '').sort((a, b) => (zonas.get(b) ?? 0) - (zonas.get(a) ?? 0));
  if (zonas.has('')) zonasOrden.push('');
  const hayZonas = zonasOrden.some((z) => z !== '');

  // Resumen y mapa van siempre arriba; el resto, en la vista «por tipo» (o reorganizado «por zona»).
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

  const fijas: { id: string; label: string; n: number | null; html: string }[] = [];
  if (resumenHtml) fijas.push({ id: 'resumen', label: 'Resumen', n: null, html: seccion('resumen', 'Resumen', null, resumenHtml) });
  const mapa = seccionMapa(d.fotos);
  if (mapa) fijas.push({ id: 'mapa-sec', label: 'Mapa', n: null, html: mapa });

  const tipos: { id: string; label: string; n: number | null; html: string }[] = [];
  if (d.pasos.length) tipos.push({ id: 'pasos', label: 'Próximos pasos', n: d.pasos.length, html: seccion('pasos', 'Próximos pasos', d.pasos.length, listaPasos(d.pasos)) });
  if (d.oportunidades.length)
    tipos.push({ id: 'oportunidades', label: 'Oportunidades', n: d.oportunidades.length, html: seccion('oportunidades', 'Oportunidades', d.oportunidades.length, listaOportunidades(d.oportunidades)) });
  if (d.hallazgos.length)
    tipos.push({ id: 'hallazgos', label: 'Hallazgos', n: d.hallazgos.length, html: seccion('hallazgos', 'Hallazgos', d.hallazgos.length, listaHallazgos(d.hallazgos)) });
  if (d.notas.length) tipos.push({ id: 'notas', label: 'Notas', n: d.notas.length, html: seccion('notas', 'Notas', d.notas.length, listaNotas(d.notas)) });
  if (d.fotos.length) tipos.push({ id: 'fotos', label: 'Fotos', n: d.fotos.length, html: seccionFotos(d.fotos) });
  const audios = listaArchivos('audios', 'audio', 'Audios', d.audios, d.enZip, 'Escuchar');
  if (audios) tipos.push({ id: 'audios', label: 'Audios', n: d.audios.length, html: audios });
  const documentos = listaArchivos('documentos', 'documento', 'Documentos', d.documentos, d.enZip, 'Abrir');
  if (documentos) tipos.push({ id: 'documentos', label: 'Documentos', n: d.documentos.length, html: documentos });

  const menuItems = [...fijas, ...tipos];
  const menu = menuItems.map((s) => `<a href="#${s.id}">${esc(s.label)}${s.n != null ? ` <b>${s.n}</b>` : ''}</a>`).join('');
  const SINGULAR: Record<string, string> = {
    pasos: 'próximo paso', oportunidades: 'oportunidad', hallazgos: 'hallazgo', notas: 'nota', fotos: 'foto', audios: 'audio', documentos: 'documento',
  };
  const kpis = tipos
    .filter((s) => s.n != null)
    .map((s) => `<a href="#${s.id}">${s.n} ${esc(s.n === 1 ? SINGULAR[s.id] ?? s.label.toLowerCase() : s.label.toLowerCase())}</a>`)
    .join('');

  const barra = `<div class="barra"><div class="barra__in">
    <span class="barra__titulo">${esc(d.clienteNombre)}</span>
    <nav class="menu" data-vista="tipo" aria-label="Secciones">${menu}</nav>
    <nav class="menu" data-vista="zona" aria-label="Zonas"></nav>
    <input id="buscar" type="search" placeholder="Buscar en el informe…" aria-label="Buscar en el informe">
    ${d.enlaceApp ? `<a class="btn primario" href="${esc(d.enlaceApp)}" target="_blank" rel="noreferrer">Abrir en PrimeNotes</a>` : ''}
    <button class="btn" id="imprimir" type="button">Imprimir</button>
  </div></div>`;

  const portada = `<header class="portada">
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

  // Herramientas: vista por tipo / por zona y filtro de zona (solo si hay zonas con nombre).
  const herramientas = hayZonas
    ? `<div class="herramientas">
        <div class="vistas" id="vistas" role="group" aria-label="Organizar por"><button type="button" class="on" data-modo="tipo">Por tipo</button><button type="button" data-modo="zona">Por zona</button></div>
        <div class="filtros" id="zonas" style="margin:0"><span class="etq">Zona</span><button type="button" class="on" data-z="*">Todas</button>${zonasOrden
          .map((z) => `<button type="button" data-z="${esc(z)}">${esc(z || 'Sin zona')} ${zonas.get(z)}</button>`)
          .join('')}</div>
      </div>`
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
<body>
${barra}
<main>
${portada}
${herramientas}
<p id="resultados" aria-live="polite"></p>
<div class="vista">${fijas.map((s) => s.html).join('\n')}</div>
<div class="vista" id="vista-tipo">${tipos.map((s) => s.html).join('\n')}</div>
<div class="vista" id="vista-zona" hidden></div>
<footer>Generado el ${esc(d.generadoEn)} por PrimeNotes · documento interno. Refleja el estado de la visita en el momento de generarlo.</footer>
</main>
${visor}
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>${JS(fotosJs, pines, zonasOrden)}</script>
</body></html>`;
}
