// Tipos de las funciones RPC definidas en 10_rpc_functions.sql.
// Idealmente `supabase gen types typescript` ya genera Database['public']['Functions'];
// este fichero re-expone esos tipos con nombres en camelCase coherentes con
// el resto del código TypeScript del proyecto (la base de datos usa snake_case,
// el frontend usa camelCase — el wrapper es también el punto de traducción).

export interface CrearVisitaConResponsableArgs {
  pVisitaId: string;
  pClienteId: string;
  pComercialId: string;
  pTipoVisita?: string | null;
}

export interface VisitaRow {
  id: string;
  cliente_id: string;
  fecha: string;
  resumen: string | null;
  tipo_visita: string | null;
  estado_captura: 'en_curso' | 'consolidada';
  resumen_texto: string | null;
  resumen_origen: 'reglas' | 'ia';
  creado_en: string;
  actualizado_en: string;
}

export type AccionResolucionTermino = 'incorporar' | 'fusionar' | 'descartar';

export interface ResolverTerminoPropuestoArgs {
  pTerminoId: string;
  pAccion: AccionResolucionTermino;
  pTerminoDestinoId?: string | null;
}

export interface TerminoRow {
  id: string;
  categoria_id: string;
  nombre: string;
  rol_funcional: 'tecnologia' | 'solucion' | 'ambos';
  estado_gobierno: 'propuesto' | 'corporativo' | 'descartado';
  fusionado_en_id: string | null;
  propuesto_por_id: string | null;
  visita_origen_id: string | null;
  fecha_propuesta: string | null;
  fecha_resolucion: string | null;
  resuelto_por_id: string | null;
  creado_en: string;
  actualizado_en: string;
}
