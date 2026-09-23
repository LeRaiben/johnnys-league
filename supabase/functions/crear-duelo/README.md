# crear-duelo

Monta un duelo: genera las ocho preguntas, las guarda e inserta el reto en el
tablón (lo que dispara la push que ya existe a todo el grupo).

## Por qué las preguntas se generan aquí

Si las generase el navegador del retador, ese navegador conocería las respuestas
antes de jugar. La respuesta de la función lleva solo el `duelo_id`; las
preguntas se piden después con `duelo_preguntas_para_jugar`, que nunca devuelve
la columna `correcta`.

## Llamada

    POST /functions/v1/crear-duelo
    { "retador_id": 11412340, "rival_id": 10272194 }

Los ids son los de Biwenger (`clasificacion[].id` de `liga.json`), no los
nombres: el nombre del equipo se puede cambiar en Biwenger y partiría el
ranking en dos. Los nombres para mostrar los saca la función de la
clasificación, nunca del cuerpo de la petición.

Respuestas:

| Código | Cuándo |
|---|---|
| 200 | `{ duelo_id }` |
| 400 | faltan ids, son iguales, o ese presidente no juega esta liga |
| 409 | ya hay un duelo pendiente entre esos dos |
| 503 | no se ha podido leer `liga.json`, o no salen las ocho preguntas |

## preguntas-duelo.js

Es una **copia exacta** de `assets/preguntas-duelo.js`, que es el original y el
que prueba `npm run probar-duelos`. El test falla si las dos dejan de ser
iguales, para que no se separen sin que nadie se entere.

Al tocar el generador:

    cp assets/preguntas-duelo.js supabase/functions/crear-duelo/preguntas-duelo.js
    npm run probar-duelos
    # y volver a desplegar la función
