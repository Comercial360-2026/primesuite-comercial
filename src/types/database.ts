export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      aviso_liberar_espacio: {
        Row: {
          atendido_en: string | null
          comercial_id: string
          creado_en: string
          id: string
          pedido_por: string
        }
        Insert: {
          atendido_en?: string | null
          comercial_id: string
          creado_en?: string
          id?: string
          pedido_por: string
        }
        Update: {
          atendido_en?: string | null
          comercial_id?: string
          creado_en?: string
          id?: string
          pedido_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "aviso_liberar_espacio_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aviso_liberar_espacio_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "aviso_liberar_espacio_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "aviso_liberar_espacio_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "aviso_liberar_espacio_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "aviso_liberar_espacio_pedido_por_fkey"
            columns: ["pedido_por"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aviso_liberar_espacio_pedido_por_fkey"
            columns: ["pedido_por"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "aviso_liberar_espacio_pedido_por_fkey"
            columns: ["pedido_por"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "aviso_liberar_espacio_pedido_por_fkey"
            columns: ["pedido_por"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "aviso_liberar_espacio_pedido_por_fkey"
            columns: ["pedido_por"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
        ]
      }
      captura_libre: {
        Row: {
          categoria_foto: string | null
          clasificacion_ia: Json | null
          cliente_id: string
          comercial_autor_id: string
          contenido_texto: string | null
          creado_en: string
          estado_subida: string
          estado_validacion: string
          hallazgo_id: string | null
          id: string
          latitud: number | null
          longitud: number | null
          oportunidad_id: string | null
          origen: string
          storage_path: string | null
          storage_path_thumbnail: string | null
          tipo: string
          titulo: string | null
          ubicacion_id: string | null
          visita_id: string
        }
        Insert: {
          categoria_foto?: string | null
          clasificacion_ia?: Json | null
          cliente_id: string
          comercial_autor_id: string
          contenido_texto?: string | null
          creado_en?: string
          estado_subida?: string
          estado_validacion?: string
          hallazgo_id?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          oportunidad_id?: string | null
          origen?: string
          storage_path?: string | null
          storage_path_thumbnail?: string | null
          tipo: string
          titulo?: string | null
          ubicacion_id?: string | null
          visita_id: string
        }
        Update: {
          categoria_foto?: string | null
          clasificacion_ia?: Json | null
          cliente_id?: string
          comercial_autor_id?: string
          contenido_texto?: string | null
          creado_en?: string
          estado_subida?: string
          estado_validacion?: string
          hallazgo_id?: string | null
          id?: string
          latitud?: number | null
          longitud?: number | null
          oportunidad_id?: string | null
          origen?: string
          storage_path?: string | null
          storage_path_thumbnail?: string | null
          tipo?: string
          titulo?: string | null
          ubicacion_id?: string | null
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "captura_libre_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captura_libre_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_cliente_resuelto"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "captura_libre_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captura_libre_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "captura_libre_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "captura_libre_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "captura_libre_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "captura_libre_hallazgo_id_fkey"
            columns: ["hallazgo_id"]
            isOneToOne: false
            referencedRelation: "hallazgo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captura_libre_hallazgo_id_fkey"
            columns: ["hallazgo_id"]
            isOneToOne: false
            referencedRelation: "vw_ecosistema_actual_cliente"
            referencedColumns: ["hallazgo_id"]
          },
          {
            foreignKeyName: "captura_libre_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captura_libre_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "vw_mapa_hallazgos_ubicacion"
            referencedColumns: ["ubicacion_id"]
          },
          {
            foreignKeyName: "captura_libre_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captura_libre_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_visita"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "fk_captura_oportunidad"
            columns: ["oportunidad_id"]
            isOneToOne: false
            referencedRelation: "oportunidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_captura_oportunidad"
            columns: ["oportunidad_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["oportunidad_id"]
          },
        ]
      }
      categoria_vocabulario: {
        Row: {
          creado_en: string
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          creado_en?: string
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          creado_en?: string
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      cliente: {
        Row: {
          actualizado_en: string
          creado_en: string
          creado_por: string | null
          estado_fusion: string
          estado_relacion: string
          fusionado_en_id: string | null
          id: string
          nombre: string
          responsable_id: string | null
          sector: string | null
          tamano_aprox: string | null
          ubicacion_general: string | null
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          creado_por?: string | null
          estado_fusion?: string
          estado_relacion?: string
          fusionado_en_id?: string | null
          id?: string
          nombre: string
          responsable_id?: string | null
          sector?: string | null
          tamano_aprox?: string | null
          ubicacion_general?: string | null
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          creado_por?: string | null
          estado_fusion?: string
          estado_relacion?: string
          fusionado_en_id?: string | null
          id?: string
          nombre?: string
          responsable_id?: string | null
          sector?: string | null
          tamano_aprox?: string | null
          ubicacion_general?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_fusionado_en_id_fkey"
            columns: ["fusionado_en_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_fusionado_en_id_fkey"
            columns: ["fusionado_en_id"]
            isOneToOne: false
            referencedRelation: "vw_cliente_resuelto"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      comercial: {
        Row: {
          activo: boolean
          actualizado_en: string
          creado_en: string
          fecha_baja: string | null
          id: string
          nombre: string
          rol: string
          zona_cartera: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          creado_en?: string
          fecha_baja?: string | null
          id?: string
          nombre: string
          rol: string
          zona_cartera?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          creado_en?: string
          fecha_baja?: string | null
          id?: string
          nombre?: string
          rol?: string
          zona_cartera?: string | null
        }
        Relationships: []
      }
      hallazgo: {
        Row: {
          cliente_id: string
          comercial_autor_id: string
          comercial_validador_id: string | null
          creado_en: string
          estado_validacion: string
          fecha_relevante: string | null
          id: string
          naturaleza: string
          nota: string | null
          origen: string
          termino_id: string
          tipo_fecha_relevante: string | null
          ubicacion_id: string | null
          visita_id: string
        }
        Insert: {
          cliente_id: string
          comercial_autor_id: string
          comercial_validador_id?: string | null
          creado_en?: string
          estado_validacion?: string
          fecha_relevante?: string | null
          id?: string
          naturaleza: string
          nota?: string | null
          origen?: string
          termino_id: string
          tipo_fecha_relevante?: string | null
          ubicacion_id?: string | null
          visita_id: string
        }
        Update: {
          cliente_id?: string
          comercial_autor_id?: string
          comercial_validador_id?: string | null
          creado_en?: string
          estado_validacion?: string
          fecha_relevante?: string | null
          id?: string
          naturaleza?: string
          nota?: string | null
          origen?: string
          termino_id?: string
          tipo_fecha_relevante?: string | null
          ubicacion_id?: string | null
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hallazgo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_cliente_resuelto"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "hallazgo_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "hallazgo_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "hallazgo_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "hallazgo_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "hallazgo_comercial_validador_id_fkey"
            columns: ["comercial_validador_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_comercial_validador_id_fkey"
            columns: ["comercial_validador_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "hallazgo_comercial_validador_id_fkey"
            columns: ["comercial_validador_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "hallazgo_comercial_validador_id_fkey"
            columns: ["comercial_validador_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "hallazgo_comercial_validador_id_fkey"
            columns: ["comercial_validador_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "hallazgo_termino_id_fkey"
            columns: ["termino_id"]
            isOneToOne: false
            referencedRelation: "termino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_termino_id_fkey"
            columns: ["termino_id"]
            isOneToOne: false
            referencedRelation: "vw_termino_resuelto"
            referencedColumns: ["termino_id"]
          },
          {
            foreignKeyName: "hallazgo_termino_id_fkey"
            columns: ["termino_id"]
            isOneToOne: false
            referencedRelation: "vw_vocabulario_pendiente_revision"
            referencedColumns: ["termino_id"]
          },
          {
            foreignKeyName: "hallazgo_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "vw_mapa_hallazgos_ubicacion"
            referencedColumns: ["ubicacion_id"]
          },
          {
            foreignKeyName: "hallazgo_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_visita"
            referencedColumns: ["visita_id"]
          },
        ]
      }
      interlocutor: {
        Row: {
          activo: boolean
          actualizado_en: string
          cargo: string | null
          cliente_id: string
          creado_en: string
          email: string | null
          id: string
          nombre: string
          relevancia: string | null
          telefono: string | null
          tipo_influencia: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          cargo?: string | null
          cliente_id: string
          creado_en?: string
          email?: string | null
          id?: string
          nombre: string
          relevancia?: string | null
          telefono?: string | null
          tipo_influencia?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          cargo?: string | null
          cliente_id?: string
          creado_en?: string
          email?: string | null
          id?: string
          nombre?: string
          relevancia?: string | null
          telefono?: string | null
          tipo_influencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interlocutor_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interlocutor_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_cliente_resuelto"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      oportunidad: {
        Row: {
          actualizado_en: string
          cliente_id: string
          comentario_cierre: string | null
          comercial_autor_id: string
          creado_en: string
          descripcion: string | null
          estado_validacion: string
          etapa: string
          hallazgo_origen_id: string | null
          horizonte_decision: string | null
          id: string
          motivo_cierre: string | null
          oportunidad_antecedente_id: string | null
          origen: string
          prioridad: string
          titulo: string
          ubicacion_id: string | null
          valor_estimado: number | null
          visita_origen_id: string
        }
        Insert: {
          actualizado_en?: string
          cliente_id: string
          comentario_cierre?: string | null
          comercial_autor_id: string
          creado_en?: string
          descripcion?: string | null
          estado_validacion?: string
          etapa?: string
          hallazgo_origen_id?: string | null
          horizonte_decision?: string | null
          id?: string
          motivo_cierre?: string | null
          oportunidad_antecedente_id?: string | null
          origen?: string
          prioridad?: string
          titulo: string
          ubicacion_id?: string | null
          valor_estimado?: number | null
          visita_origen_id: string
        }
        Update: {
          actualizado_en?: string
          cliente_id?: string
          comentario_cierre?: string | null
          comercial_autor_id?: string
          creado_en?: string
          descripcion?: string | null
          estado_validacion?: string
          etapa?: string
          hallazgo_origen_id?: string | null
          horizonte_decision?: string | null
          id?: string
          motivo_cierre?: string | null
          oportunidad_antecedente_id?: string | null
          origen?: string
          prioridad?: string
          titulo?: string
          ubicacion_id?: string | null
          valor_estimado?: number | null
          visita_origen_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oportunidad_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidad_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_cliente_resuelto"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "oportunidad_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidad_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "oportunidad_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "oportunidad_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "oportunidad_comercial_autor_id_fkey"
            columns: ["comercial_autor_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "oportunidad_hallazgo_origen_id_fkey"
            columns: ["hallazgo_origen_id"]
            isOneToOne: false
            referencedRelation: "hallazgo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidad_hallazgo_origen_id_fkey"
            columns: ["hallazgo_origen_id"]
            isOneToOne: false
            referencedRelation: "vw_ecosistema_actual_cliente"
            referencedColumns: ["hallazgo_id"]
          },
          {
            foreignKeyName: "oportunidad_oportunidad_antecedente_id_fkey"
            columns: ["oportunidad_antecedente_id"]
            isOneToOne: false
            referencedRelation: "oportunidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidad_oportunidad_antecedente_id_fkey"
            columns: ["oportunidad_antecedente_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["oportunidad_id"]
          },
          {
            foreignKeyName: "oportunidad_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidad_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "vw_mapa_hallazgos_ubicacion"
            referencedColumns: ["ubicacion_id"]
          },
          {
            foreignKeyName: "oportunidad_visita_origen_id_fkey"
            columns: ["visita_origen_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidad_visita_origen_id_fkey"
            columns: ["visita_origen_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_visita"
            referencedColumns: ["visita_id"]
          },
        ]
      }
      oportunidad_termino: {
        Row: {
          oportunidad_id: string
          rol_en_oportunidad: string
          termino_id: string
        }
        Insert: {
          oportunidad_id: string
          rol_en_oportunidad: string
          termino_id: string
        }
        Update: {
          oportunidad_id?: string
          rol_en_oportunidad?: string
          termino_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oportunidad_termino_oportunidad_id_fkey"
            columns: ["oportunidad_id"]
            isOneToOne: false
            referencedRelation: "oportunidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidad_termino_oportunidad_id_fkey"
            columns: ["oportunidad_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["oportunidad_id"]
          },
          {
            foreignKeyName: "oportunidad_termino_termino_id_fkey"
            columns: ["termino_id"]
            isOneToOne: false
            referencedRelation: "termino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidad_termino_termino_id_fkey"
            columns: ["termino_id"]
            isOneToOne: false
            referencedRelation: "vw_termino_resuelto"
            referencedColumns: ["termino_id"]
          },
          {
            foreignKeyName: "oportunidad_termino_termino_id_fkey"
            columns: ["termino_id"]
            isOneToOne: false
            referencedRelation: "vw_vocabulario_pendiente_revision"
            referencedColumns: ["termino_id"]
          },
        ]
      }
      oportunidad_visita_seguimiento: {
        Row: {
          comercial_id: string
          creado_en: string
          etapa_anterior: string | null
          etapa_nueva: string | null
          id: string
          oportunidad_id: string
          visita_id: string
        }
        Insert: {
          comercial_id: string
          creado_en?: string
          etapa_anterior?: string | null
          etapa_nueva?: string | null
          id?: string
          oportunidad_id: string
          visita_id: string
        }
        Update: {
          comercial_id?: string
          creado_en?: string
          etapa_anterior?: string | null
          etapa_nueva?: string | null
          id?: string
          oportunidad_id?: string
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oportunidad_visita_seguimiento_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidad_visita_seguimiento_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "oportunidad_visita_seguimiento_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "oportunidad_visita_seguimiento_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "oportunidad_visita_seguimiento_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "oportunidad_visita_seguimiento_oportunidad_id_fkey"
            columns: ["oportunidad_id"]
            isOneToOne: false
            referencedRelation: "oportunidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidad_visita_seguimiento_oportunidad_id_fkey"
            columns: ["oportunidad_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["oportunidad_id"]
          },
          {
            foreignKeyName: "oportunidad_visita_seguimiento_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidad_visita_seguimiento_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_visita"
            referencedColumns: ["visita_id"]
          },
        ]
      }
      proximo_paso: {
        Row: {
          actualizado_en: string
          comercial_responsable_id: string
          creado_en: string
          descripcion: string
          estado: string
          estado_validacion: string
          fecha_objetivo: string | null
          id: string
          oportunidad_id: string | null
          origen: string
          visita_id: string
        }
        Insert: {
          actualizado_en?: string
          comercial_responsable_id: string
          creado_en?: string
          descripcion: string
          estado?: string
          estado_validacion?: string
          fecha_objetivo?: string | null
          id?: string
          oportunidad_id?: string | null
          origen?: string
          visita_id: string
        }
        Update: {
          actualizado_en?: string
          comercial_responsable_id?: string
          creado_en?: string
          descripcion?: string
          estado?: string
          estado_validacion?: string
          fecha_objetivo?: string | null
          id?: string
          oportunidad_id?: string | null
          origen?: string
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proximo_paso_comercial_responsable_id_fkey"
            columns: ["comercial_responsable_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proximo_paso_comercial_responsable_id_fkey"
            columns: ["comercial_responsable_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "proximo_paso_comercial_responsable_id_fkey"
            columns: ["comercial_responsable_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "proximo_paso_comercial_responsable_id_fkey"
            columns: ["comercial_responsable_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "proximo_paso_comercial_responsable_id_fkey"
            columns: ["comercial_responsable_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "proximo_paso_oportunidad_id_fkey"
            columns: ["oportunidad_id"]
            isOneToOne: false
            referencedRelation: "oportunidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proximo_paso_oportunidad_id_fkey"
            columns: ["oportunidad_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["oportunidad_id"]
          },
          {
            foreignKeyName: "proximo_paso_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proximo_paso_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_visita"
            referencedColumns: ["visita_id"]
          },
        ]
      }
      registro_backup_completo: {
        Row: {
          creado_en: string
          creado_por: string
          id: string
        }
        Insert: {
          creado_en?: string
          creado_por: string
          id?: string
        }
        Update: {
          creado_en?: string
          creado_por?: string
          id?: string
        }
        Relationships: []
      }
      solicitud_acceso: {
        Row: {
          comercial_id: string
          creado_en: string
          email: string
          estado: string
          id: string
          resuelto_en: string | null
          resuelto_por: string | null
        }
        Insert: {
          comercial_id: string
          creado_en?: string
          email: string
          estado?: string
          id?: string
          resuelto_en?: string | null
          resuelto_por?: string | null
        }
        Update: {
          comercial_id?: string
          creado_en?: string
          email?: string
          estado?: string
          id?: string
          resuelto_en?: string | null
          resuelto_por?: string | null
        }
        Relationships: []
      }
      solicitud_reasignacion: {
        Row: {
          comercial_asignado_id: string | null
          comercial_solicitante_id: string
          creado_en: string
          estado: string
          id: string
          nota: string | null
          resuelto_en: string | null
          visita_id: string
        }
        Insert: {
          comercial_asignado_id?: string | null
          comercial_solicitante_id: string
          creado_en?: string
          estado?: string
          id?: string
          nota?: string | null
          resuelto_en?: string | null
          visita_id: string
        }
        Update: {
          comercial_asignado_id?: string | null
          comercial_solicitante_id?: string
          creado_en?: string
          estado?: string
          id?: string
          nota?: string | null
          resuelto_en?: string | null
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitud_reasignacion_comercial_asignado_id_fkey"
            columns: ["comercial_asignado_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_reasignacion_comercial_asignado_id_fkey"
            columns: ["comercial_asignado_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "solicitud_reasignacion_comercial_asignado_id_fkey"
            columns: ["comercial_asignado_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "solicitud_reasignacion_comercial_asignado_id_fkey"
            columns: ["comercial_asignado_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "solicitud_reasignacion_comercial_asignado_id_fkey"
            columns: ["comercial_asignado_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "solicitud_reasignacion_comercial_solicitante_id_fkey"
            columns: ["comercial_solicitante_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_reasignacion_comercial_solicitante_id_fkey"
            columns: ["comercial_solicitante_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "solicitud_reasignacion_comercial_solicitante_id_fkey"
            columns: ["comercial_solicitante_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "solicitud_reasignacion_comercial_solicitante_id_fkey"
            columns: ["comercial_solicitante_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "solicitud_reasignacion_comercial_solicitante_id_fkey"
            columns: ["comercial_solicitante_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "solicitud_reasignacion_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitud_reasignacion_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_visita"
            referencedColumns: ["visita_id"]
          },
        ]
      }
      termino: {
        Row: {
          actualizado_en: string
          categoria_id: string
          creado_en: string
          estado_gobierno: string
          fecha_propuesta: string | null
          fecha_resolucion: string | null
          fusionado_en_id: string | null
          id: string
          nombre: string
          propuesto_por_id: string | null
          resuelto_por_id: string | null
          rol_funcional: string
          visita_origen_id: string | null
        }
        Insert: {
          actualizado_en?: string
          categoria_id: string
          creado_en?: string
          estado_gobierno?: string
          fecha_propuesta?: string | null
          fecha_resolucion?: string | null
          fusionado_en_id?: string | null
          id?: string
          nombre: string
          propuesto_por_id?: string | null
          resuelto_por_id?: string | null
          rol_funcional: string
          visita_origen_id?: string | null
        }
        Update: {
          actualizado_en?: string
          categoria_id?: string
          creado_en?: string
          estado_gobierno?: string
          fecha_propuesta?: string | null
          fecha_resolucion?: string | null
          fusionado_en_id?: string | null
          id?: string
          nombre?: string
          propuesto_por_id?: string | null
          resuelto_por_id?: string | null
          rol_funcional?: string
          visita_origen_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_termino_visita_origen"
            columns: ["visita_origen_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_termino_visita_origen"
            columns: ["visita_origen_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_visita"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "termino_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categoria_vocabulario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termino_fusionado_en_id_fkey"
            columns: ["fusionado_en_id"]
            isOneToOne: false
            referencedRelation: "termino"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termino_fusionado_en_id_fkey"
            columns: ["fusionado_en_id"]
            isOneToOne: false
            referencedRelation: "vw_termino_resuelto"
            referencedColumns: ["termino_id"]
          },
          {
            foreignKeyName: "termino_fusionado_en_id_fkey"
            columns: ["fusionado_en_id"]
            isOneToOne: false
            referencedRelation: "vw_vocabulario_pendiente_revision"
            referencedColumns: ["termino_id"]
          },
          {
            foreignKeyName: "termino_propuesto_por_id_fkey"
            columns: ["propuesto_por_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termino_propuesto_por_id_fkey"
            columns: ["propuesto_por_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "termino_propuesto_por_id_fkey"
            columns: ["propuesto_por_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "termino_propuesto_por_id_fkey"
            columns: ["propuesto_por_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "termino_propuesto_por_id_fkey"
            columns: ["propuesto_por_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "termino_resuelto_por_id_fkey"
            columns: ["resuelto_por_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termino_resuelto_por_id_fkey"
            columns: ["resuelto_por_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "termino_resuelto_por_id_fkey"
            columns: ["resuelto_por_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "termino_resuelto_por_id_fkey"
            columns: ["resuelto_por_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "termino_resuelto_por_id_fkey"
            columns: ["resuelto_por_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
        ]
      }
      ubicacion: {
        Row: {
          actualizado_en: string
          cliente_id: string
          creado_en: string
          id: string
          nombre: string
        }
        Insert: {
          actualizado_en?: string
          cliente_id: string
          creado_en?: string
          id?: string
          nombre: string
        }
        Update: {
          actualizado_en?: string
          cliente_id?: string
          creado_en?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "ubicacion_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ubicacion_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_cliente_resuelto"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      visita: {
        Row: {
          actualizado_en: string
          cliente_id: string
          creado_en: string
          estado_captura: string
          fecha: string
          franja: string | null
          hora_definida: boolean
          id: string
          objetivo: string | null
          resumen: string | null
          resumen_origen: string | null
          resumen_texto: string | null
          tipo_visita: string | null
        }
        Insert: {
          actualizado_en?: string
          cliente_id: string
          creado_en?: string
          estado_captura?: string
          fecha?: string
          franja?: string | null
          hora_definida?: boolean
          id?: string
          objetivo?: string | null
          resumen?: string | null
          resumen_origen?: string | null
          resumen_texto?: string | null
          tipo_visita?: string | null
        }
        Update: {
          actualizado_en?: string
          cliente_id?: string
          creado_en?: string
          estado_captura?: string
          fecha?: string
          franja?: string | null
          hora_definida?: boolean
          id?: string
          objetivo?: string | null
          resumen?: string | null
          resumen_origen?: string | null
          resumen_texto?: string | null
          tipo_visita?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visita_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_cliente_resuelto"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      visita_interlocutor: {
        Row: {
          interlocutor_id: string
          visita_id: string
        }
        Insert: {
          interlocutor_id: string
          visita_id: string
        }
        Update: {
          interlocutor_id?: string
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visita_interlocutor_interlocutor_id_fkey"
            columns: ["interlocutor_id"]
            isOneToOne: false
            referencedRelation: "interlocutor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_interlocutor_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_interlocutor_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_visita"
            referencedColumns: ["visita_id"]
          },
        ]
      }
      visita_participante: {
        Row: {
          comercial_id: string
          creado_en: string
          id: string
          rol: string
          visita_id: string
        }
        Insert: {
          comercial_id: string
          creado_en?: string
          id?: string
          rol: string
          visita_id: string
        }
        Update: {
          comercial_id?: string
          creado_en?: string
          id?: string
          rol?: string
          visita_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visita_participante_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_participante_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "visita_participante_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "visita_participante_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "visita_participante_comercial_id_fkey"
            columns: ["comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "visita_participante_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_participante_visita_id_fkey"
            columns: ["visita_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_visita"
            referencedColumns: ["visita_id"]
          },
        ]
      }
    }
    Views: {
      vw_actividad_comercial: {
        Row: {
          comercial_id: string | null
          nombre: string | null
          num_audios: number | null
          num_fotos: number | null
          num_hallazgos: number | null
          num_notas: number | null
          num_oportunidades_creadas: number | null
          num_oportunidades_en_curso: number | null
          num_visitas: number | null
        }
        Relationships: []
      }
      vw_calendario: {
        Row: {
          anio: number | null
          anio_mes: string | null
          dia_semana: number | null
          fecha: string | null
          mes: number | null
          trimestre: number | null
        }
        Relationships: []
      }
      vw_cliente_resuelto: {
        Row: {
          cliente_id: string | null
          cliente_maestro_id: string | null
          cliente_maestro_nombre: string | null
        }
        Relationships: []
      }
      vw_comercial_resuelto: {
        Row: {
          activo: boolean | null
          comercial_id: string | null
          nombre: string | null
          rol: string | null
        }
        Insert: {
          activo?: boolean | null
          comercial_id?: string | null
          nombre?: string | null
          rol?: string | null
        }
        Update: {
          activo?: boolean | null
          comercial_id?: string | null
          nombre?: string | null
          rol?: string | null
        }
        Relationships: []
      }
      vw_ecosistema_actual_cliente: {
        Row: {
          cliente_id: string | null
          estado_validacion: string | null
          fecha_hallazgo: string | null
          hallazgo_id: string | null
          naturaleza: string | null
          nota: string | null
          termino_id: string | null
          ubicacion_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hallazgo_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hallazgo_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "vw_mapa_hallazgos_ubicacion"
            referencedColumns: ["ubicacion_id"]
          },
        ]
      }
      vw_mapa_hallazgos_ubicacion: {
        Row: {
          cliente_id: string | null
          naturaleza: string | null
          num_hallazgos: number | null
          ubicacion_id: string | null
          ubicacion_nombre: string | null
        }
        Relationships: []
      }
      vw_motivos_perdida: {
        Row: {
          cliente_id: string | null
          comercial_id: string | null
          motivo_cierre: string | null
          num_oportunidades: number | null
          solucion: string | null
        }
        Relationships: []
      }
      vw_pipeline_oportunidades: {
        Row: {
          actualizado_en: string | null
          cliente_id: string | null
          cliente_nombre: string | null
          comercial_id: string | null
          comercial_nombre: string | null
          creado_en: string | null
          dias_en_etapa_actual: number | null
          etapa: string | null
          horizonte_decision: string | null
          oportunidad_id: string | null
          prioridad: string | null
          soluciones_asociadas: string | null
          titulo: string | null
          valor_estimado: number | null
        }
        Relationships: []
      }
      vw_resumen_visita: {
        Row: {
          cliente_nombre: string | null
          comercial_responsable: string | null
          estado_captura: string | null
          fecha: string | null
          num_audios: number | null
          num_fotos: number | null
          num_hallazgos: number | null
          num_oportunidades: number | null
          num_proximos_pasos: number | null
          num_riesgos: number | null
          num_senales_oportunidad: number | null
          tipo_visita: string | null
          visita_id: string | null
        }
        Relationships: []
      }
      vw_semaforo_cliente: {
        Row: {
          cliente_id: string | null
          cliente_nombre: string | null
          oportunidades_activas: number | null
          semaforo: string | null
          ultima_visita: string | null
        }
        Relationships: []
      }
      vw_termino_demanda: {
        Row: {
          etapa: string | null
          num_oportunidades: number | null
          termino_id: string | null
          termino_nombre: string | null
        }
        Relationships: []
      }
      vw_termino_resuelto: {
        Row: {
          termino_id: string | null
          termino_maestro_id: string | null
          termino_maestro_nombre: string | null
        }
        Relationships: []
      }
      vw_vocabulario_pendiente_revision: {
        Row: {
          categoria: string | null
          fecha_propuesta: string | null
          nombre: string | null
          propuesto_por_id: string | null
          propuesto_por_nombre: string | null
          termino_id: string | null
          visita_origen_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_termino_visita_origen"
            columns: ["visita_origen_id"]
            isOneToOne: false
            referencedRelation: "visita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_termino_visita_origen"
            columns: ["visita_origen_id"]
            isOneToOne: false
            referencedRelation: "vw_resumen_visita"
            referencedColumns: ["visita_id"]
          },
          {
            foreignKeyName: "termino_propuesto_por_id_fkey"
            columns: ["propuesto_por_id"]
            isOneToOne: false
            referencedRelation: "comercial"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termino_propuesto_por_id_fkey"
            columns: ["propuesto_por_id"]
            isOneToOne: false
            referencedRelation: "vw_actividad_comercial"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "termino_propuesto_por_id_fkey"
            columns: ["propuesto_por_id"]
            isOneToOne: false
            referencedRelation: "vw_comercial_resuelto"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "termino_propuesto_por_id_fkey"
            columns: ["propuesto_por_id"]
            isOneToOne: false
            referencedRelation: "vw_motivos_perdida"
            referencedColumns: ["comercial_id"]
          },
          {
            foreignKeyName: "termino_propuesto_por_id_fkey"
            columns: ["propuesto_por_id"]
            isOneToOne: false
            referencedRelation: "vw_pipeline_oportunidades"
            referencedColumns: ["comercial_id"]
          },
        ]
      }
    }
    Functions: {
      crear_visita_con_responsable: {
        Args: {
          p_cliente_id: string
          p_comercial_id: string
          p_estado_captura?: string
          p_fecha?: string
          p_tipo_visita?: string
          p_visita_id: string
        }
        Returns: {
          actualizado_en: string
          cliente_id: string
          creado_en: string
          estado_captura: string
          fecha: string
          franja: string | null
          hora_definida: boolean
          id: string
          resumen: string | null
          resumen_origen: string | null
          resumen_texto: string | null
          tipo_visita: string | null
        }
        SetofOptions: {
          from: "*"
          to: "visita"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      eliminar_cliente_completo: {
        Args: { p_cliente_id: string }
        Returns: undefined
      }
      eliminar_oportunidad_completa: {
        Args: { p_oportunidad_id: string }
        Returns: undefined
      }
      eliminar_ubicacion: {
        Args: { p_ubicacion_id: string }
        Returns: undefined
      }
      eliminar_visita_completa: {
        Args: { p_visita_id: string }
        Returns: undefined
      }
      fn_comercial_actual_activo: { Args: never; Returns: boolean }
      fn_consolidar_visitas_antiguas: { Args: never; Returns: undefined }
      fn_cuota_comercial_bytes: { Args: never; Returns: number }
      fn_es_participante_de_visita: {
        Args: { p_comercial_id?: string; p_visita_id: string }
        Returns: boolean
      }
      fn_espacio_equipo: {
        Args: never
        Returns: {
          presupuesto: number
          usado_total: number
        }[]
      }
      fn_espacio_por_comercial: {
        Args: never
        Returns: {
          bytes: number
          comercial_id: string
          nombre: string
        }[]
      }
      fn_espacio_storage_usado: { Args: never; Returns: number }
      fn_estado_captura_visita: {
        Args: { p_visita_id: string }
        Returns: string
      }
      fn_limpiar_backups_antiguos: { Args: never; Returns: undefined }
      fn_marcar_capturas_error: { Args: never; Returns: undefined }
      fn_mi_espacio_total: { Args: never; Returns: number }
      fn_mis_visitas_espacio: {
        Args: never
        Returns: {
          bytes: number
          cliente_nombre: string
          creado_en: string
          visita_id: string
        }[]
      }
      fn_rol_actual: { Args: never; Returns: string }
      fn_rol_lectura_ampliada: { Args: never; Returns: boolean }
      fn_visita_sin_participantes: {
        Args: { p_visita_id: string }
        Returns: boolean
      }
      previsualizar_borrado_cliente: {
        Args: { p_cliente_id: string }
        Returns: {
          num_audios: number
          num_fotos: number
          num_hallazgos: number
          num_notas: number
          num_oportunidades: number
          num_proximos_pasos: number
          num_ubicaciones: number
          num_visitas: number
          rutas_storage: string[]
        }[]
      }
      previsualizar_borrado_ubicacion: {
        Args: { p_ubicacion_id: string }
        Returns: {
          num_audios: number
          num_fotos: number
          num_hallazgos: number
          num_notas: number
          num_oportunidades: number
        }[]
      }
      previsualizar_borrado_visita: {
        Args: { p_visita_id: string }
        Returns: {
          num_audios: number
          num_fotos: number
          num_hallazgos: number
          num_notas: number
          num_oportunidades: number
          num_proximos_pasos: number
          rutas_storage: string[]
        }[]
      }
      resolver_termino_propuesto: {
        Args: {
          p_accion: string
          p_termino_destino_id?: string
          p_termino_id: string
        }
        Returns: {
          actualizado_en: string
          categoria_id: string
          creado_en: string
          estado_gobierno: string
          fecha_propuesta: string | null
          fecha_resolucion: string | null
          fusionado_en_id: string | null
          id: string
          nombre: string
          propuesto_por_id: string | null
          resuelto_por_id: string | null
          rol_funcional: string
          visita_origen_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "termino"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
