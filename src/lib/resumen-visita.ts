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

export function generarResumenReglas(d: DatosResumenVisita): string {
  const frases: string[] = [];

  const objetivo = d.objetivo?.trim();
  if (objetivo) frases.push(`Ibas a: ${capitalizarFrase(objetivo)}.`);

  // Los riesgos llevan su nota entre paréntesis si la hay ("el lector
  // falla dos veces al día") — es lo que da valor al resumen.
  const riesgos = d.hallazgos
    .filter((h) => h.naturaleza === 'riesgo')
    .map((h) => {
      const n = h.nota?.trim();
      return n ? `${h.terminoNombre} (${n})` : h.terminoNombre;
    });
  if (riesgos.length) frases.push(`Riesgo: ${listaCorta(riesgos, 2)}.`);

  const oportunidades = [
    ...d.oportunidades.map((o) => o.titulo),
    ...d.hallazgos.filter((h) => h.naturaleza === 'oportunidad').map((h) => h.terminoNombre),
  ];
  if (oportunidades.length) frases.push(`Oportunidad: ${listaCorta(oportunidades.map(capitalizarFrase))}.`);

  if (d.pasos.length) {
    const pasosTexto = d.pasos
      .slice(0, 3)
      .map((p) => {
        const desc = capitalizarFrase(p.descripcion.trim());
        return p.fecha ? `${desc} (${fechaCorta(p.fecha)})` : desc;
      })
      .join('; ');
    const extra = d.pasos.length > 3 ? ` y ${d.pasos.length - 3} más` : '';
    frases.push(`Próximo paso: ${pasosTexto}${extra}.`);
  }

  // Otros hallazgos que no son riesgo ni oportunidad (contexto, competencia,
  // fortaleza, proyecto activo): se mencionan pero sin protagonismo.
  const otros = d.hallazgos
    .filter((h) => h.naturaleza !== 'riesgo' && h.naturaleza !== 'oportunidad')
    .map((h) => h.terminoNombre);
  if (otros.length) frases.push(`También anotado: ${listaCorta(otros)}.`);

  // Si no hay nada "de fondo" pero sí capturas sueltas, al menos que el
  // resumen diga qué se llevó.
  if (frases.length <= (objetivo ? 1 : 0)) {
    const capturas = [
      d.nFotos && plural(d.nFotos, 'foto', 'fotos'),
      d.nAudios && plural(d.nAudios, 'audio', 'audios'),
      d.nNotas && plural(d.nNotas, 'nota', 'notas'),
    ].filter(Boolean);
    if (capturas.length) frases.push(`Se registraron ${capturas.join(', ')}.`);
  }

  return frases.join(' ').trim();
}
