# Johnny's League

Web de Johnny's League, una liga privada de Biwenger con 12 presidentes. El dueño es Rubén (GitHub: LeRaiben). No es técnico: hazlo todo tú de principio a fin.

## Dónde está publicada

- La web está en GitHub Pages: https://leraiben.github.io/johnnys-league/
- NO usamos Netlify. (El antiguo `netlify.toml` era un resto de las instrucciones iniciales y se ha borrado.)
- Cada commit a `main` publica la web automáticamente en GitHub Pages. No hay otro paso de despliegue.

## Servicios (solo estos dos)

1. **GitHub**: el código, la publicación (Pages) y un workflow de GitHub Actions.
2. **Supabase**: proyecto "johnnys-league", id `hgmswhslnuqlzqbvuifw`. Ahí está todo lo dinámico: tablón (mensajes, encuestas, likes), chat en directo, duelos, suscripciones push y la Edge Function `send-push`. Las notificaciones se disparan solas al insertar en la tabla `mensajes`.

No hay servidores propios, ni Netlify, ni Vercel, ni ningún otro servicio.

## De dónde salen los datos de la liga

- Los commits "Datos actualizados" los hace el workflow `.github/workflows/actualizar-datos.yml`. Ejecuta `scripts/fetch-biwenger.mjs` según su cron, lee la API de Biwenger y hace commit de `data/liga.json` y `data/historico.json` solo si algo ha cambiado.
- Por eso `main` cambia sola cada pocos minutos: haz siempre `git pull --rebase` justo antes de cada push.
- Usa el secret `BIWENGER_TOKEN` del repo. Si el workflow falla con 401 o 403, el token ha caducado y hay que regenerarlo.
- Las páginas son HTML/CSS/JS estático y leen esos JSON.

## Estructura

- Páginas: `index`, `tablon`, `duelos`, `presidentes`, `hemeroteca`, `estadisticas`, `jugadores`, `calendario`, `comparador` y `oportunidades` (oculta del menú y con contraseña).
- Estilos comunes en `assets/estilo.css`. `assets/cierre.js` controla el aviso de normas y oculta Oportunidades del menú.
- Todo el texto de la web va en español.

## Cómo trabajar

- Haz tú los cambios, pruébalos en local y luego haz commit y push a `main`. No le des instrucciones a Rubén para que lo haga él.
- Después del push, comprueba que el cambio se ve en la web publicada (Pages tarda uno o dos minutos).
- Para la base de datos, usa Supabase directamente.
- Si tienes que preguntar algo, una sola pregunta clara cada vez.
- Si dudas de cómo está hecho algo, investígalo en el código o en Supabase antes de preguntar.
