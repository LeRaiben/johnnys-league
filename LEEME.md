# Johnny's League

Web pública de la liga: clasificación y mercado que se actualizan solos desde Biwenger,
más portadas y crónicas que subís vosotros.

---

## Qué hay aquí

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La web entera |
| `assets/escudo.png` | El escudo de la liga |
| `data/liga.json` | Clasificación y mercado. **Se genera solo, no lo toques** |
| `data/contenido.json` | Portada, crónicas y hemeroteca. **Este sí lo editas tú** |
| `scripts/fetch-biwenger.mjs` | El script que va a buscar los datos a Biwenger |
| `.github/workflows/` | La automatización que lo ejecuta dos veces al día |

---

## Paso 1 — Ver la web en tu ordenador

Necesitas Node.js instalado (descárgalo de nodejs.org si no lo tienes).

Abre una terminal en esta carpeta y escribe:

```
npm run servir
```

Te dará una dirección tipo `http://localhost:3000`. Ábrela en el navegador.
De momento verás datos de ejemplo, es normal.

> Ojo: no abras `index.html` con doble clic. El navegador bloquea la carga de datos
> si no hay un servidor detrás. Usa siempre `npm run servir`.

---

## Paso 2 — Conectar tu liga de Biwenger

1. Duplica el archivo `.env.example` y renombra la copia a `.env`
2. Abre `.env` y rellena los tres valores siguiendo las instrucciones que hay dentro
3. En la terminal:

```
npm run datos
```

Si todo va bien verás cuántos equipos y jugadores ha encontrado, y `data/liga.json`
se rellenará con los datos reales. Vuelve a abrir la web y ahí estará tu liga.

**Si da error 401 o 403:** el token ha caducado. Vuelve a copiarlo del navegador
y actualiza el `.env`. Los tokens de Biwenger duran bastante, pero no para siempre.

---

## Paso 3 — Subirlo a internet

### 3.1 GitHub

1. Crea una cuenta en github.com si no la tienes
2. Crea un repositorio nuevo, por ejemplo `johnnys-league`
3. Sube esta carpeta entera

   El archivo `.env` **no se sube**, ya está protegido por el `.gitignore`.
   Eso es intencionado: tu token no debe estar nunca en internet.

### 3.2 Netlify

1. Crea una cuenta en netlify.com (puedes entrar con GitHub)
2. "Add new site" → "Import an existing project" → elige tu repositorio
3. No hace falta configurar nada, ya está en el `netlify.toml`
4. En un minuto tendrás una dirección tipo `johnnys-league.netlify.app`

Ya está online. Compártela con el grupo.

### 3.3 Que se actualice sola

Para que los datos se refresquen sin que hagas nada:

1. En tu repositorio de GitHub, ve a **Settings → Secrets and variables → Actions**
2. Pulsa "New repository secret" y crea tres, con los mismos valores del `.env`:
   - `BIWENGER_TOKEN`
   - `BIWENGER_LEAGUE`
   - `BIWENGER_USER`
3. Listo. A partir de ahí se actualiza a las 8:00 y a las 20:00

   Para lanzarlo a mano: pestaña **Actions** → "Actualizar datos de Biwenger" → "Run workflow"

---

## Paso 4 — Publicar una portada o una crónica

Todo lo editorial vive en `data/contenido.json`. Lo puedes editar directamente
desde GitHub (botón del lápiz) sin descargar nada. Al guardar, la web se actualiza sola.

**Cambiar la portada de la semana:**

```json
"portada": {
  "titular": "Aquí el titular",
  "entradilla": "Dos líneas explicando la movida.",
  "firma": "Redacción de Johnny's League",
  "imagen": "assets/portadas/jornada-6.jpg"
}
```

Para la imagen: sube el archivo a `assets/portadas/` en GitHub y pon esa ruta en `imagen`.
Si lo dejas vacío, sale un marco con un aviso.

**Añadir una crónica:** mete otro bloque en la lista `cronicas`.

**Archivar la portada anterior:** cuando cambies de jornada, añade la anterior
a la lista `hemeroteca` con su jornada, título e imagen.

---

## Dominio propio (opcional)

Si más adelante quieres `johnnysleague.com` en vez de la dirección de Netlify:
cómpralo donde prefieras (unos 12 € al año) y en Netlify ve a
**Domain settings → Add a custom domain**. Te dice exactamente qué tienes que cambiar.

---

## Avisos

- La API de Biwenger no es oficial. Si cambian algo, el script puede dejar de funcionar
  temporalmente. La web seguirá en pie con los últimos datos buenos y la parte
  editorial nunca se ve afectada.
- Tu token es una llave de tu cuenta. No lo pegues en el chat del grupo ni lo subas a GitHub
  fuera de los Secrets.
