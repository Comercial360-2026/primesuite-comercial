import { supabase } from '@/lib/supabase-client';
import { generarResumenReglas } from '@/lib/resumen-visita';

// Prompt maestro 11, Fase 3 (decisión de Cesar). El párrafo "Resumen" de
// una visita cerrada (`visita.resumen_texto`) se congela al cerrarla. Si
// después se convierte / edita / borra algo (una nota pasa a hallazgo, se
// borra una oportunidad…), ese párrafo se quedaba diciendo "2 notas"
// cuando ya hay "1 nota y 1 hallazgo" — información falsa.
//
// Regla: si el resumen es el AUTOMÁTICO (`resumen_origen = 'reglas'`) se
// regenera con el contenido actual; si el comercial lo reescribió a mano
// (`'manual'`) NO se toca — son sus palabras.
//
// Se llama tras cualquier cambio de contenido de una visita ya
// consolidada. En una visita en curso no hace nada (el resumen se genera
// al cerrar).
export async function regenerarResumenSiAuto(visitaId: string | undefined): Promise<void> {
  if (!visitaId) return;

  const { data: v } = await supabase
    .from('visita')
    .select('objetivo, resumen_origen, estado_captura')
    .eq('id', visitaId)
    .maybeSingle();
  if (!v || v.resumen_origen !== 'reglas' || v.estado_captura !== 'consolidada') return;

  const [{ data: capturas }, { data: hallazgos }, { data: oportunidades }, { data: pasos }] =
    await Promise.all([
      supabase.from('captura_libre').select('tipo').eq('visita_id', visitaId),
      supabase.from('hallazgo').select('nota').eq('visita_id', visitaId),
      supabase.from('oportunidad').select('titulo').eq('visita_origen_id', visitaId),
      supabase.from('proximo_paso').select('descripcion, fecha_objetivo').eq('visita_id', visitaId),
    ]);

  const texto = generarResumenReglas({
    objetivo: v.objetivo,
    hallazgos: (hallazgos ?? []).map((h) => ({ nota: h.nota ?? null })),
    oportunidades: (oportunidades ?? []).map((o) => ({ titulo: o.titulo })),
    pasos: (pasos ?? []).map((p) => ({ descripcion: p.descripcion, fecha: p.fecha_objetivo ?? null })),
    nFotos: (capturas ?? []).filter((c) => c.tipo === 'foto').length,
    nAudios: (capturas ?? []).filter((c) => c.tipo === 'audio').length,
    nNotas: (capturas ?? []).filter((c) => c.tipo === 'nota').length,
  });

  await supabase.from('visita').update({ resumen_texto: texto || null }).eq('id', visitaId);
}
