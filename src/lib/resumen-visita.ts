import { capitalizarFrase, plural } from '@/lib/texto';
import { fechaCorta } from '@/lib/fechas';

// Resumen "por reglas" de una visita al cerrarla: no un recuento (eso ya
// está en los chips), sino una micro-historia legible de un vistazo —
// objetivo + lo que de verdad importa (riesgos, oportunidades, próximos
// pasos). Se guarda en `visita.resumen_texto` con `resumen_origen =
// 'reglas'`; el comercial puede reescribirlo a mano desde el detalle de la
// visita (entonces pasa a `'manual'`).

export interface DatosResumenVisita {
  objetivo?: string | null;
  hallazgos: { terminoNombre: string; naturaleza: string; nota?: string | null }[];
  oportunidades: { titulo: string }[];
  pasos: { descripcion: string; fecha?: string | null }[];
  nFotos: number;
  nAudios: number;
  nNotas: number;
}

function listaCorta(nombres: string[], max = 3): string {
  const limpios = nombres.map((n) => n.trim()).filter(Boolean);
  if (limpios.length <= max) return limpios.join(', ');
  return `${limpios.slice(0, max).join(', ')} y ${limpios.length - max} más`;
}

// Fragmentos de texto libre (la nota de un riesgo, la descripción de un
// paso) van EN MEDIO de una frase, dentro de un paréntesis. Si el comercial
// los cerró con punto, sale "…le preocupa.). Oportunidad:" con doble
// puntuación. Se le quita el signo final antes de incrustarlo.
function sinPuntuacionFinal(s: string): string {
  return s.trim().replace(/[.;,\s]+$/, '');
}

export function generarResumenReglas(d: DatosResumenVisita): string {
  const frases: string[] = [];

  const objetivo = d.objetivo?.trim();
  if (objetivo) frases.push(`Ibas a: ${capitalizarFrase(objetivo)}.`);

  // Los riesgos llevan su nota entre paréntesis si la hay ("el lector
  // falla dos veces al día") — es lo que da valor al resumen.
  const riesgos = d.hallazgos
    .filter((h) => h.naturaleza === 'riesgo')
    .map((h) => {
      const t = h.terminoNombre.trim();
      const n = h.nota?.trim();
      // Desde "Anotar" un hallazgo puede no tener término: entonces su
      // propio texto es lo que se muestra.
      if (t && n) return `${t} (${sinPuntuacionFinal(n)})`;
      if (t) return t;
      return n ? sinPuntuacionFinal(n) : 'algo que te preocupa';
    });
  if (riesgos.length) frases.push(`Riesgo: ${listaCorta(riesgos, 2)}.`);

  // Oportunidades = la entidad (ya no hay hallazgos "de oportunidad", prompt
  // maestro 10).
  const oportunidades = d.oportunidades.map((o) => o.titulo);
  if (oportunidades.length) frases.push(`Oportunidad: ${listaCorta(oportunidades.map(capitalizarFrase))}.`);

  if (d.pasos.length) {
    const pasosTexto = d.pasos
      .slice(0, 3)
      .map((p) => {
        const desc = capitalizarFrase(p.descripcion.trim());
        return p.fecha ? `${sinPuntuacionFinal(desc)} (${fechaCorta(p.fecha)})` : desc;
      })
      .join('; ');
    const extra = d.pasos.length > 3 ? ` y ${d.pasos.length - 3} más` : '';
    frases.push(`Próximo paso: ${pasosTexto}${extra}.`);
  }

  // Hallazgos que no son "Me preocupa" (competencia, dato del cliente): se
  // mencionan pero sin protagonismo.
  const otros = d.hallazgos
    .filter((h) => h.naturaleza !== 'riesgo')
    .map((h) => h.terminoNombre.trim() || sinPuntuacionFinal(h.nota?.trim() || ''))
    .filter(Boolean);
  if (otros.length) frases.push(`También anotado: ${listaCorta(otros)}.`);

  // Si no hay nada "de fondo" pero sí capturas sueltas, al menos que el
  // resumen diga qué se llevó.
  if (frases.length <= (objetivo ? 1 : 0)) {
    const capturas = [
      d.nFotos && plural(d.nFotos, 'foto', 'fotos'),
      d.nAudios && plural(d.nAudios, 'audio', 'audios'),
      d.nNotas && plural(d.nNotas, 'nota', 'notas'),
    ].filter((c): c is string => !!c);
    if (capturas.length) {
      // Concordancia del verbo: "Se registró 1 nota" / "Se registraron 2 notas"
      // (una sola captura y en singular → verbo en singular).
      const singular = capturas.length === 1 && capturas[0].startsWith('1 ');
      frases.push(`Se ${singular ? 'registró' : 'registraron'} ${capturas.join(', ')}.`);
    }
  }

  return frases.join(' ').trim();
}
