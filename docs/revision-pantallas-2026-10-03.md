# Revisión de coherencia de pantallas — 3 oct 2026

Criterio: el estado, la acción que lo cambia y su texto deben estar juntos y arriba; ningún icono ni etiqueta confunde acción con estado; nada se queda sin salida.

## Encontrado y arreglado (todo probado en la app con datos de prueba)
| Pantalla | Problema | Arreglo |
|---|---|---|
| Visita cerrada | «Reabrir visita» y «Adjuntar documento» al final de una pantalla de ~5700 px; zona de scroll diminuta en móvil (Documentos/Reabrir/Borrar fijos debajo) | Franja de estado arriba («Cerrada el … · toca para reabrirla»); Documentos bajo las descargas con «+» redondo; todo dentro del scroll |
| Visita cerrada (cabecera) | «cerrada · cerrada el …» repetido y cortado en móvil | Sin repetir, hasta 3 líneas |
| Visita en curso | Botón ancho de documento fuera de la rejilla; reabierta sin aviso | Icono de documento junto a «Captura lo que veas»; aviso «Visita reabierta» |
| Ficha de cliente | Visitas en la ficha y otra vez en el proyecto; «Cliente inactivo» (estado) como nombre de una acción; «reactívalo al final» | Visitas solo en el proyecto (N visitas · última); «Marcar como inactivo»; «Reactivar cliente» bajo el aviso |
| Proyecto | `limit(10)` sin salida: la visita 11 era inalcanzable | «Ver todas las visitas (N)» |
| Oportunidad, hallazgo, paso, captura | «Guardar» al final del formulario (oportunidad: píxel 970, fuera de pantalla) | `.btn-guardar-fijo` (sticky) |
| Visita planificada | La cabecera no decía su estado | «Planificada · fecha» |
| Yo → sin sincronizar | Error de subida en inglés y 5 reintentos de algo que no se arregla | Mensaje en español, directo a «error», sin «Reintentar ahora» |
| Archivado | Informes agotados (5 intentos) sin aviso | Aviso en Yo → Copia a SharePoint (migración 147) |
| Reabrir/cerrar | Informe duplicado en SharePoint | Huella del contenido (migración 148) |

## Comprobado sin hallazgos
- Datos: 11 comprobaciones de coherencia en la base de datos (visitas sin responsable, cerradas sin fecha, clientes sin proyecto, capturas sin archivo, cuentas CRM inexistentes, visitas abiertas olvidadas…) = 0.
- Vocabulario de acciones (Borrar / Anular / Descartar / Quitar / Dar de baja / Terminar / Pausar): reparto coherente.
- Proyecto (Pausar/Terminar arriba, Borrar al final) y Yo.

## Pendiente de medir o decidir
- **Sin medir en pantalla:** agenda (calendario y día), lista de clientes con filtros, detalle de comercial.
- **Decisión de Cesar:** icono del briefing (ticket, no dice «resumen»); «Dar de baja no borra»; borrado en SharePoint.
- **Sin probar con fallo real:** el `catch` del informe (marcar intento + `informe_error`); probado el RPC y el aviso con estado simulado.
