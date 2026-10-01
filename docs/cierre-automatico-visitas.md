# Cierre automático de visitas abandonadas

Migración 135. Recupera, con otras reglas, el cierre automático que la migración 102 (7 sept) quitó
(«una visita la cierra el comercial, punto»): entonces cerraba a las 48 h sin avisar y no existía
reabrir (llegó en la 100, 21 sept).

## Regla
Una visita EN CURSO con algo capturado (captura, hallazgo, oportunidad o próximo paso) y **sin
actividad durante 18 h** (`ajustes_app.visita_autocierre_horas`; `valor` = activo) se cierra sola cada hora.
- Actividad = lo más reciente entre `ultima_actividad_en`, `en_curso_desde`, `actualizado_en` de la visita y
  lo capturado (la hora de una captura es la de su sincronización con el servidor).
- `cerrada_en` = su última actividad (no la hora del cron); `cierre_automatico = true`.
- Las visitas vacías no se cierran (se descartan desde el panel de visitas abiertas).
- Al reabrir, `cierre_automatico` se limpia y `ultima_actividad_en = now()` (no se recierra al instante).
- El resumen automático no se genera en el servidor: la visita cerrada lo genera al abrirse la primera vez
  (`regenerarResumenSiAuto`; uno escrito a mano nunca se toca).

## Avisos
- Desde las 8 h sin actividad: aviso en la visita en curso y en la fila del panel «visitas abiertas»
  («sin actividad N h · se cierra sola en M h»).
- Visita cerrada así: aviso «Cerrada automáticamente» con la vía de reabrir; la pantalla de captura dice
  «Se cerró sola por inactividad».

## Efectos en cadena
Cerrar dispara la copia a SharePoint en ≤10 min (`docs/archivado-sharepoint/`) y borra el briefing pendiente.
Una captura sin sincronizar en el móvil que llega después del cierre se sube igual y se copia sola.

## Encenderlo (tras desplegar el PR #24)
El cron (cada hora, minuto 7) ya está programado pero el ajuste nace **apagado**, para no cerrar visitas reales antes de que la app muestre los avisos:
`update ajustes_app set valor = true where clave = 'visita_autocierre_horas';`

## Apagarlo / ajustarlo
`update ajustes_app set valor = false where clave = 'visita_autocierre_horas';` (apagado) ·
`update ajustes_app set valor_numero = 24 where clave = 'visita_autocierre_horas';` (horas).
