# Cambios v0.6.1 (corrección de la recolección)

## Síntoma

Al pulsar «Recolectar y pronosticar» la pantalla se quedaba vacía: 0 partidos, 0 pronósticos,
sin ningún error visible.

## Causa

1. **API-Football devuelve HTTP 200 aunque falle.** Cuando se agota la cuota diaria (100 peticiones
   en el plan gratuito) el error viaja en el campo `errors` de la respuesta. El cliente lo ignoraba,
   devolvía una lista vacía y el respaldo automático nunca se activaba. El resultado parecía un día
   sin fútbol.
2. **El respaldo no se usaba para las llamadas posteriores.** Los IDs llevan el proveedor en el
   prefijo (`api-football:team:33`). Si los partidos venían de Football-Data, el resto de llamadas
   seguían intentando API-Football.
3. **Football-Data ocultaba sus errores.** Si las 7 competiciones fallaban (por ejemplo, HTTP 429
   por el límite de 10 peticiones/minuto), devolvía 0 partidos en silencio.
4. **Gasto de cuota sin control.** Cada ciclo pedía el histórico de 40 equipos, H2H y estadísticas
   sin tope, muy por encima de las 100 peticiones/día.

## Correcciones

- El cliente de API-Football lanza un error con código `QUOTA` cuando la respuesta trae `errors`.
  El failover pasa a Football-Data y el ciclo termina con datos reales.
- El failover enruta cada llamada al proveedor dueño del ID, sin mezclar equipos de dos fuentes.
- Football-Data lanza error si ninguna competición responde; ya no confunde un 429 con un día vacío.
- Presupuesto por ciclo:
  - `MAX_REQUESTS_PER_RUN=85` (deja margen para reintentos).
  - `MAX_STATS_PER_RUN=25`.
  - `TEAM_HISTORY_MAX_AGE_DAYS=3`: si el equipo ya tiene un partido reciente en la base, no se
    vuelve a pedir su histórico.
  - El H2H se lee de la base si ya hay 3 o más enfrentamientos guardados.
- La pantalla ya no se queda vacía: si la fecha elegida no tiene partidos, muestra un aviso con
  el día más cercano que sí tiene datos y un botón para ir. Tras una recolección sin partidos,
  salta automáticamente a ese día.
- `statsFetched` solo cuenta estadísticas reales (no las respuestas «no disponible»).
- Versión 0.6.1.

## WhatsApp

No hace falta token para usarlo:

1. Pulsa «⚙» junto a «Enviar por WhatsApp» y escribe el número con código de país
   (solo dígitos, por ejemplo `573001234567`). Se guarda en el navegador.
2. Pulsa «Enviar por WhatsApp»: se abre WhatsApp Web con el Top 10 y las apuestas de valor
   ya escritos. Revisa el mensaje y pulsa Enter.

Para envío automático sin abrir WhatsApp Web hacen falta credenciales de Meta Cloud API o Twilio
(`WHATSAPP_ENABLED=1` en `.env`). Sin credenciales, el botón sigue funcionando por WhatsApp Web.

## Verificación

- `npm.cmd test`: 40/40.
- Recolección real del 27/11/2026 con la cuota de API-Football agotada: 6 partidos de Football-Data,
  6 pronósticos, 0 errores.
- Archivo único regenerado (`dist/HTML_Forecaster.html`, 1,30 MB).
