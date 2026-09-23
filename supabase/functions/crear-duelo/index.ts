// Edge Function crear-duelo
//
// Monta un duelo entre dos presidentes: elige las ocho preguntas, las guarda y
// publica el reto en el tablón. Devuelve solo el id del duelo.
//
// Las preguntas se generan AQUÍ y no en el navegador del retador a propósito:
// si las generase su móvil, ese móvil conocería las respuestas antes de jugar.
// Por lo mismo, la respuesta de esta función no lleva ni las preguntas ni las
// correctas; el que juega las pide luego con duelo_preguntas_para_jugar.
//
// preguntas-duelo.js es una copia exacta de assets/preguntas-duelo.js. El test
// del repo (npm run probar-duelos) falla si las dos dejan de ser idénticas.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { generarPreguntas } from "./preguntas-duelo.js";

const DATOS = "https://leraiben.github.io/johnnys-league/data";

const CABECERAS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: CABECERAS });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CABECERAS });
  }

  try {
    const cuerpo = await req.json().catch(() => ({}));
    const retadorId = Number(cuerpo.retador_id);
    const rivalId = Number(cuerpo.rival_id);

    if (!Number.isFinite(retadorId) || !Number.isFinite(rivalId)) {
      return responder({ error: "Faltan el retador o el rival" }, 400);
    }
    if (retadorId === rivalId) {
      return responder({ error: "No puedes retarte a ti mismo" }, 400);
    }

    // Los datos de la liga, de la web publicada. Son los mismos que ve todo el
    // mundo y se regeneran cada diez minutos.
    const [liga, historico] = await Promise.all([
      fetch(`${DATOS}/liga.json`).then((r) => r.json()),
      fetch(`${DATOS}/historico.json`).then((r) => r.json()),
    ]).catch(() => [null, null]);

    if (!liga || !Array.isArray(liga.clasificacion)) {
      return responder({ error: "No se han podido leer los datos de la liga" }, 503);
    }

    // Los nombres salen de la clasificación, nunca de lo que mande el cliente:
    // si no, cualquiera se inventa el nombre del rival en el mensaje del tablón.
    const buscar = (id: number) =>
      liga.clasificacion.find((e: { id: number }) => Number(e.id) === id);
    const retador = buscar(retadorId);
    const rival = buscar(rivalId);

    if (!retador || !rival) {
      return responder({ error: "Ese presidente no juega esta liga" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Un solo duelo pendiente por pareja, o se acumulan diez. La base de datos
    // lo impide igualmente con un índice único; esto es para poder avisar bien.
    const { data: pendiente } = await supabase
      .from("duelos")
      .select("id")
      .eq("estado", "pendiente")
      .or(
        `and(retador_id.eq.${retadorId},rival_id.eq.${rivalId}),` +
        `and(retador_id.eq.${rivalId},rival_id.eq.${retadorId})`,
      )
      .limit(1);

    if (pendiente && pendiente.length) {
      return responder(
        { error: `Ya tienes un duelo sin terminar con ${rival.equipo}`, duelo_id: pendiente[0].id },
        409,
      );
    }

    const preguntas = generarPreguntas(liga, historico, 8);
    if (preguntas.length < 8) {
      // Mejor no crear el duelo que crearlo con seis preguntas.
      return responder(
        { error: "No hay datos suficientes para montar las ocho preguntas" },
        503,
      );
    }

    const { data: duelo, error: errorDuelo } = await supabase
      .from("duelos")
      .insert({
        retador_id: retadorId,
        retador_nombre: retador.equipo,
        rival_id: rivalId,
        rival_nombre: rival.equipo,
      })
      .select("id")
      .single();

    if (errorDuelo || !duelo) {
      // 23505 = el índice único de pareja pendiente. Alguien se ha adelantado
      // por milisegundos desde otro móvil.
      if (errorDuelo?.code === "23505") {
        return responder({ error: `Ya tienes un duelo sin terminar con ${rival.equipo}` }, 409);
      }
      return responder({ error: "No se ha podido crear el duelo" }, 500);
    }

    const { error: errorPreguntas } = await supabase.from("duelo_preguntas").insert(
      preguntas.map((p: { orden: number; enunciado: string; opciones: string[]; correcta: number; categoria: string }) => ({
        duelo_id: duelo.id,
        orden: p.orden,
        enunciado: p.enunciado,
        opciones: p.opciones,
        correcta: p.correcta,
        categoria: p.categoria,
      })),
    );

    if (errorPreguntas) {
      // Un duelo sin preguntas no se puede jugar y encima bloquea a la pareja
      // por el índice único. Se borra y que lo vuelva a intentar.
      await supabase.from("duelos").delete().eq("id", duelo.id);
      return responder({ error: "No se han podido guardar las preguntas" }, 500);
    }

    // El aviso al rival es este mensaje: dispara la push que ya existe a todo
    // el grupo. Es menos trabajo que una push dirigida y además hace más pique,
    // porque el reto lo ve todo el mundo.
    const { error: errorMensaje } = await supabase.from("mensajes").insert({
      nombre: "Duelos",
      texto: `⚔️ ${retador.equipo} ha retado a ${rival.equipo}`,
    });

    // Si falla el mensaje, el duelo ya está creado y es jugable: no se tira por
    // esto. Se avisa por si el de enfrente no se entera por la notificación.
    if (errorMensaje) {
      return responder({ duelo_id: duelo.id, aviso: "El duelo está creado, pero no se ha podido publicar el reto en el tablón" });
    }

    return responder({ duelo_id: duelo.id });
  } catch (err) {
    return responder({ error: (err as Error).message }, 500);
  }
});
