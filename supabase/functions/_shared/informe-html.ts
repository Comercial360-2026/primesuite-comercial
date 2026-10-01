// supabase/functions/_shared/informe-html.ts
//
// Informe de visita en formato WEB: un único archivo .html (sin dependencias
// locales; las fotos van embebidas) que se abre en cualquier navegador. A
// diferencia del PDF, las fotos y su ubicación van JUNTAS: un mapa con las
// fotos numeradas y, debajo, una ficha por foto (imagen, zona, hora,
// coordenadas, enlace a Google Maps y botón "ver en el mapa"). Pulsar un pin
// del mapa salta a su foto, y el número de la foto salta a su pin.
//
// El mapa usa Leaflet + OpenStreetMap (necesitan conexión). Sin conexión el
// informe sigue entero: el mapa se sustituye por un aviso y cada ficha
// conserva sus coordenadas y su enlace.

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
  zona: string;
  creadoEn: string;
  dataUri: string | null; // null = formato no embebible (está en fotos/ del zip)
  latitud: number | null;
  longitud: number | null;
}

export interface ArchivoHtml {
  titulo: string;
  creadoEn: string;
  ruta: string | null; // ruta relativa dentro del zip (audios/…, documentos/…)
}

export interface DatosInformeHtml {
  clienteNombre: string;
  proyectoNombre: string;
  metaCliente: string;
  lineaVisita: string; // "Visita de seguimiento · 12 de septiembre de 2026 · 10:30"
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
  notas: { titulo: string | null; texto: string | null }[];
  fotos: FotoHtml[];
  audios: ArchivoHtml[];
  documentos: ArchivoHtml[];
  enZip: boolean; // true = los archivos de audios/ y documentos/ están junto a este .html
  avisos: string[]; // "2 fotos no se pudieron recuperar…"
  generadoEn: string; // "2 de octubre de 2026, 10:41"
  logo: string | null; // data URI
}

const esc = (t: unknown) =>
  String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const euros = (n: number) => `${n.toLocaleString('es-ES')} €`;

const enlaceMapa = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

function seccion(titulo: string, cuenta: number | null, cuerpo: string, id?: string) {
  return `<section${id ? ` id="${id}"` : ''}><h2>${esc(titulo)}${cuenta != null ? ` <span class="cuenta">${cuenta}</span>` : ''}</h2>${cuerpo}</section>`;
}

const vacio = (t: string) => `<p class="vacio">${esc(t)}</p>`;

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
  const geo = f.latitud != null && f.longitud != null;
  const img = f.dataUri
    ? `<img src="${f.dataUri}" alt="${esc(f.titulo || `Foto ${f.n}`)}" loading="lazy" data-ampliar>`
    : `<div class="sin-imagen">Formato no embebible: está en la carpeta fotos/ del zip.</div>`;
  const ubicacion = geo
    ? `<div class="geo"><span class="coords">${(f.latitud as number).toFixed(6)}, ${(f.longitud as number).toFixed(6)}</span>
         <a href="${enlaceMapa(f.latitud as number, f.longitud as number)}" target="_blank" rel="noreferrer">Abrir en Google Maps</a>
         <a href="#mapa-fotos" class="ver-mapa" data-pin="${f.n}">Ver en el mapa</a></div>`
    : `<div class="geo sin-gps">Sin ubicación GPS</div>`;
  return `<figure class="foto" id="foto-${f.n}">
    ${img}
    <figcaption>
      <div class="foto__titulo"><span class="num">${f.n}</span>${esc(f.titulo || 'Foto')}<span class="hora">${esc(horaDe(f.creadoEn))}</span></div>
      ${ubicacion}
    </figcaption>
  </figure>`;
}

function seccionFotos(fotos: FotoHtml[]) {
  if (!fotos.length) return seccion('Fotos', 0, vacio('Sin fotografías.'));
  const situadas = fotos.filter((f) => f.latitud != null && f.longitud != null);
  const mapa = situadas.length
    ? `<div class="mapa-bloque">
         <div id="mapa-fotos" class="mapa" aria-label="Mapa con la ubicación de las fotos"></div>
         <p class="mapa-nota">${situadas.length} de ${fotos.length} fotos con ubicación. Pulsa un número para ir a su foto.</p>
       </div>`
    : `<p class="vacio">Ninguna foto de esta visita lleva ubicación GPS.</p>`;

  const porZona = new Map<string, FotoHtml[]>();
  for (const f of fotos) porZona.set(f.zona, [...(porZona.get(f.zona) ?? []), f]);
  const grupos = [...porZona.entries()]
    .map(([zona, lista]) => `<h3>${esc(zona)} <span class="cuenta">${lista.length}</span></h3><div class="fotos">${lista.map(fichaFoto).join('')}</div>`)
    .join('');
  return seccion('Fotos y ubicación', fotos.length, mapa + grupos, 'fotos');
}

function tablaOportunidades(ops: OportunidadRow[]) {
  if (!ops.length) return vacio('No se registraron oportunidades en esta visita.');
  const total = ops.reduce((s, o) => s + (o.valor_estimado ?? 0), 0);
  const filas = ops
    .map(
      (o) => `<tr>
        <td><strong>${esc(o.titulo)}</strong>${o.descripcion ? `<div class="sub">${esc(o.descripcion)}</div>` : ''}</td>
        <td>${esc(etiqueta(ETAPA_LABEL, o.etapa))}</td>
        <td>${esc(etiqueta(PRIORIDAD_LABEL, o.prioridad))}</td>
        <td>${esc(o.horizonte_decision ? etiqueta(HORIZONTE_LABEL, o.horizonte_decision) : '—')}</td>
        <td class="num-col">${o.valor_estimado != null ? esc(euros(o.valor_estimado)) : '—'}</td>
      </tr>`
    )
    .join('');
  return `<div class="tabla-scroll"><table><thead><tr><th>Oportunidad</th><th>Etapa</th><th>Prioridad</th><th>Horizonte</th><th class="num-col">Valor</th></tr></thead><tbody>${filas}</tbody>${
    total > 0 ? `<tfoot><tr><td colspan="4">Total estimado</td><td class="num-col">${esc(euros(total))}</td></tr></tfoot>` : ''
  }</table></div>`;
}

function listaHallazgos(hs: HallazgoRow[]) {
  if (!hs.length) return vacio('No se registraron hallazgos en esta visita.');
  return `<ul class="tarjetas">${hs
    .map(
      (h) => `<li>
        <div>${esc(h.nota?.trim() || 'Hallazgo sin texto')}</div>
        ${h.areas.length ? `<div class="chips">${h.areas.map((a) => `<span class="chip">${esc(a.nombre)}</span>`).join('')}</div>` : ''}
        <div class="sub">${[h.zona_texto || h.ubicacion?.nombre, h.fecha_relevante ? `${esc(h.tipo_fecha_relevante ? etiqueta(TIPO_FECHA_LABEL, h.tipo_fecha_relevante) : 'Fecha relevante')}: ${esc(fechaCorta(h.fecha_relevante))}` : null]
          .filter(Boolean)
          .map((t) => (t as string).startsWith('<') ? t : esc(t))
          .join(' · ')}</div>
      </li>`
    )
    .join('')}</ul>`;
}

function tablaPasos(pasos: PasoRow[]) {
  if (!pasos.length) return vacio('No se registraron próximos pasos.');
  return `<div class="tabla-scroll"><table><thead><tr><th>Próximo paso</th><th>Responsable</th><th>Fecha objetivo</th><th>Estado</th></tr></thead><tbody>${pasos
    .map((p) => {
      const vencido = esVencido(p.fecha_objetivo, p.estado);
      return `<tr>
        <td>${esc(p.descripcion)}</td>
        <td>${esc(p.comercial_responsable?.nombre ?? '—')}</td>
        <td class="${vencido ? 'vencido' : ''}">${p.fecha_objetivo ? esc(fechaCorta(p.fecha_objetivo)) : 'Sin fecha'}${vencido ? ' · vencido' : ''}</td>
        <td>${esc(etiqueta(ESTADO_PASO_LABEL, p.estado))}</td>
      </tr>`;
    })
    .join('')}</tbody></table></div>`;
}

function listaArchivos(titulo: string, archivos: ArchivoHtml[], enZip: boolean) {
  if (!archivos.length) return '';
  return seccion(
    titulo,
    archivos.length,
    `<ul class="archivos">${archivos
      .map((a) => {
        const nombre = esc(a.titulo);
        const hora = `<span class="hora">${esc(horaDe(a.creadoEn))}</span>`;
        if (a.ruta && enZip) return `<li><a href="${esc(encodeURI(a.ruta))}">${nombre}</a> ${hora}</li>`;
        return `<li>${nombre} ${hora}${a.ruta ? ` <span class="sub">— en ${esc(a.ruta)} del zip «Todo en ZIP»</span>` : ''}</li>`;
      })
      .join('')}</ul>`
  );
}

const CSS = `
:root{--ink9:${COLOR.ink900};--ink7:${COLOR.ink700};--ink4:${COLOR.ink400};--ink2:${COLOR.ink200};--ink1:${COLOR.ink100};--b6:${COLOR.brand600};--b7:${COLOR.brand700};--sig:${COLOR.signal600};--warn:${COLOR.warning600};--warn0:${COLOR.warning050};--danger:${COLOR.danger600}}
*{box-sizing:border-box}
body{margin:0;background:#f6f7f9;color:var(--ink9);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:920px;margin:0 auto;padding:24px 16px 64px}
header.portada{background:#fff;border:1px solid var(--ink1);border-radius:14px;padding:28px 28px 22px;margin-bottom:20px}
.portada .logo{height:34px;margin-bottom:18px}
.portada .tipo{font-size:12px;letter-spacing:.12em;font-weight:700;color:var(--ink4)}
.portada h1{margin:4px 0 2px;font-size:30px;color:var(--b7)}
.portada .proyecto{color:var(--b6);font-weight:700}
.portada .linea{margin-top:14px;font-weight:700;font-size:17px}
.portada .sub,.sub{color:var(--ink4);font-size:13px}
.quienes{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:16px 0 0}
.quienes dt{color:var(--ink4)} .quienes dd{margin:0;font-weight:600}
.aviso{margin-top:16px;padding:10px 14px;border:1px solid var(--warn);background:var(--warn0);color:var(--warn);border-radius:10px;font-size:13px}
section{background:#fff;border:1px solid var(--ink1);border-radius:14px;padding:20px 24px;margin-bottom:16px}
h2{margin:0 0 12px;font-size:19px;color:var(--b7)} h3{margin:22px 0 10px;font-size:15px;color:var(--b6)}
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
.nota{border:1px solid var(--ink1);border-radius:10px;padding:12px 14px;margin-bottom:10px;white-space:pre-wrap}
.nota strong{display:block;margin-bottom:2px}
.mapa{height:380px;border-radius:12px;border:1px solid var(--ink2);background:var(--ink1);display:flex;align-items:center;justify-content:center;color:var(--ink4);text-align:center;padding:16px}
.mapa-nota{margin:8px 0 0;color:var(--ink4);font-size:13px}
.fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px}
.foto{margin:0;border:1px solid var(--ink1);border-radius:12px;overflow:hidden;background:#fff;scroll-margin-top:16px;transition:box-shadow .3s,border-color .3s}
.foto.resaltada{border-color:var(--sig);box-shadow:0 0 0 3px rgba(239,65,54,.25)}
.foto img{display:block;width:100%;height:210px;object-fit:cover;cursor:zoom-in;background:var(--ink1)}
.sin-imagen{height:210px;display:flex;align-items:center;justify-content:center;background:var(--ink1);color:var(--ink4);font-size:13px;padding:12px;text-align:center}
figcaption{padding:10px 12px 12px}
.foto__titulo{display:flex;align-items:center;gap:8px;font-weight:600}
.num{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:99px;background:var(--b6);color:#fff;font-size:12px;font-weight:700}
.hora{margin-left:auto;color:var(--ink4);font-weight:400;font-size:12px}
.geo{margin-top:8px;display:flex;flex-wrap:wrap;gap:4px 12px;font-size:13px;align-items:center}
.coords{font-variant-numeric:tabular-nums;color:var(--ink7)} .sin-gps{color:var(--ink4)}
a{color:var(--b6)} .archivos{margin:0;padding-left:18px}
.pin{width:28px;height:28px;border-radius:99px;background:var(--b6);color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font:700 13px/1 sans-serif}
.visor{position:fixed;inset:0;background:rgba(10,14,18,.92);display:none;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;padding:16px}
.visor.abierto{display:flex} .visor img{max-width:100%;max-height:100%;border-radius:8px}
footer{color:var(--ink4);font-size:12px;text-align:center;margin-top:24px}
@media print{body{background:#fff}section,header.portada{border:0;padding:0;break-inside:avoid-page}.foto{break-inside:avoid}.mapa{display:none}.mapa-nota{display:none}.visor{display:none!important}}
`;

// Cliente: pins numerados + enlaces foto<->pin. Sin Leaflet (sin conexión) se
// deja un aviso y el resto del informe no cambia.
const JS = (pines: { n: number; lat: number; lng: number }[]) => `
(function(){
  var pines=${JSON.stringify(pines)};
  var visor=document.createElement('div');visor.className='visor';visor.innerHTML='<img alt="">';document.body.appendChild(visor);
  visor.addEventListener('click',function(){visor.classList.remove('abierto')});
  document.querySelectorAll('img[data-ampliar]').forEach(function(i){i.addEventListener('click',function(){visor.firstChild.src=i.src;visor.classList.add('abierto')})});
  function resaltar(n){var f=document.getElementById('foto-'+n);if(!f)return;f.scrollIntoView({behavior:'smooth',block:'center'});f.classList.add('resaltada');setTimeout(function(){f.classList.remove('resaltada')},1800)}
  var el=document.getElementById('mapa-fotos');if(!el||!pines.length)return;
  if(!window.L){el.textContent='El mapa necesita conexión a internet. Las coordenadas y el enlace de cada foto están debajo.';return}
  var mapa=L.map(el,{scrollWheelZoom:false});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(mapa);
  var marcadores={},pts=[];
  pines.forEach(function(p){
    var m=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:'<div class="pin">'+p.n+'</div>',iconSize:[28,28],iconAnchor:[14,14]})}).addTo(mapa);
    m.on('click',function(){resaltar(p.n)});marcadores[p.n]=m;pts.push([p.lat,p.lng]);
  });
  if(pts.length===1)mapa.setView(pts[0],17);else mapa.fitBounds(pts,{padding:[30,30],maxZoom:18});
  document.querySelectorAll('[data-pin]').forEach(function(a){a.addEventListener('click',function(e){
    e.preventDefault();var m=marcadores[a.getAttribute('data-pin')];el.scrollIntoView({behavior:'smooth',block:'center'});
    if(m){mapa.flyTo(m.getLatLng(),18);m.openPopup&&0}
  })});
})();
`;

export function generarInformeHtml(d: DatosInformeHtml): string {
  const kpis = [
    `${d.fotos.length} foto${d.fotos.length === 1 ? '' : 's'}`,
    `${d.hallazgos.length} hallazgo${d.hallazgos.length === 1 ? '' : 's'}`,
    `${d.oportunidades.length} oportunidad${d.oportunidades.length === 1 ? '' : 'es'}`,
    `${d.pasos.length} próximo${d.pasos.length === 1 ? '' : 's'} paso${d.pasos.length === 1 ? '' : 's'}`,
  ];
  const pines = d.fotos
    .filter((f) => f.latitud != null && f.longitud != null)
    .map((f) => ({ n: f.n, lat: f.latitud as number, lng: f.longitud as number }));

  const portada = `<header class="portada">
    ${d.logo ? `<img class="logo" src="${d.logo}" alt="Primion">` : ''}
    <div class="tipo">INFORME DE VISITA</div>
    <h1>${esc(d.clienteNombre)}</h1>
    <div class="proyecto">Proyecto · ${esc(d.proyectoNombre)}</div>
    ${d.metaCliente ? `<div class="sub">${esc(d.metaCliente)}</div>` : ''}
    <div class="linea">${esc(d.lineaVisita)}</div>
    ${d.lineaHistorico ? `<div class="sub">${esc(d.lineaHistorico)}</div>` : ''}
    ${bloqueQuienes(d.participantes, d.interlocutores)}
    <div class="chips" style="margin-top:16px">${kpis.map((k) => `<span class="chip">${esc(k)}</span>`).join('')}</div>
    ${d.enCurso ? `<div class="aviso">Esta visita figura como en curso: puede haber información registrada después de generar este informe que aquí no aparece.</div>` : ''}
    ${d.avisos.map((a) => `<div class="aviso">${esc(a)}</div>`).join('')}
  </header>`;

  const cuerpo = [
    seccion(
      'Resumen',
      null,
      d.resumenTexto
        ? `<p style="margin:0;white-space:pre-wrap">${esc(d.resumenTexto)}</p>${d.resumenManual ? '<p class="sub">Resumen editado a mano por el comercial.</p>' : ''}`
        : vacio('Sin resumen.')
    ),
    seccion('Objetivo', null, d.objetivo ? `<p style="margin:0">${esc(d.objetivo)}</p>` : vacio('Sin objetivo registrado para esta visita.')),
    seccion('Oportunidades', d.oportunidades.length, tablaOportunidades(d.oportunidades)),
    seccion('Hallazgos', d.hallazgos.length, listaHallazgos(d.hallazgos)),
    seccion('Próximos pasos', d.pasos.length, tablaPasos(d.pasos)),
    seccion(
      'Notas',
      d.notas.length,
      d.notas.length
        ? d.notas.map((n) => `<div class="nota">${n.titulo ? `<strong>${esc(n.titulo)}</strong>` : ''}${esc(n.texto)}</div>`).join('')
        : vacio('No se registraron notas en esta visita.')
    ),
    seccionFotos(d.fotos),
    listaArchivos('Audios', d.audios, d.enZip),
    listaArchivos('Documentos', d.documentos, d.enZip),
  ].join('\n');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe de visita · ${esc(d.clienteNombre)}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>${CSS}</style></head>
<body><main>
${portada}
${cuerpo}
<footer>Generado el ${esc(d.generadoEn)} por PrimeNotes · documento interno. Refleja el estado de la visita en el momento de generarlo.</footer>
</main>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>${JS(pines)}</script>
</body></html>`;
}
