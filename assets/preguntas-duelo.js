// Generador de preguntas para los duelos de presidentes.
//
// Se usa desde la Edge Function crear-duelo (Deno), no desde el navegador del
// retador: si las preguntas las generase su móvil, ese móvil conocería las
// respuestas antes de jugar.
//
//   import { generarPreguntas } from './preguntas-duelo.js';
//   const preguntas = generarPreguntas(liga, historico, 8);
//   // -> [{ orden: 1, categoria: 'plantilla', enunciado, opciones: [...], correcta: 2 }, ...]
//
// Cada pregunta sale de una categoría distinta y todos los distractores son
// datos reales de la liga: otros presidentes, otros jugadores, otros precios.
// Nada inventado, porque un distractor inventado se huele a la primera.
//
// Reglas que cumple todo lo que sale de aquí, pase lo que pase con los datos:
//   - exactamente 4 opciones, todas distintas
//   - la correcta nunca repetida entre los distractores
//   - si a una categoría le falta un dato, se cae ella sola y las demás siguen


// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

// El azar se inyecta para poder fijar una semilla en las pruebas.
function barajar(lista, azar) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function elegir(lista, azar) {
  if (!lista || !lista.length) return null;
  return lista[Math.floor(azar() * lista.length)];
}

// 12130300 -> "12,1 M". Mismo formato que usa el resto de la web.
function millones(bruto) {
  return (Math.round(bruto / 100000) / 10).toFixed(1).replace('.', ',') + ' M';
}

// Único sitio por el que se monta una pregunta. Aquí se garantiza que hay
// cuatro opciones distintas y que la correcta no está duplicada: si una
// categoría se despista, el que se cae es el embudo, no el duelo entero.
function montar(azar, categoria, enunciado, correcta, distractores) {
  const buena = String(correcta == null ? '' : correcta).trim();
  if (!buena || !enunciado) return null;

  const vistas = new Set([buena.toLowerCase()]);
  const elegidos = [];

  for (const bruto of distractores || []) {
    const texto = String(bruto == null ? '' : bruto).trim();
    if (!texto) continue;
    const clave = texto.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    elegidos.push(texto);
    if (elegidos.length === 3) break;
  }

  if (elegidos.length < 3) return null;

  const opciones = barajar([buena].concat(elegidos), azar);
  return { categoria, enunciado, opciones, correcta: opciones.indexOf(buena) };
}

// Los presidentes que tienen un número en ese campo. presidentes[] es la fuente
// rica (clausulasHechas, clausulasSufridas, valorBruto); clasificacion[] el plan B.
function presidentesCon(liga, campo) {
  const fuente = (liga.presidentes && liga.presidentes.length ? liga.presidentes : liga.clasificacion) || [];
  return fuente.filter((p) => p && p.equipo && Number.isFinite(p[campo]));
}

// El primero de la lista por ese campo, con el resto detrás. Devuelve null si
// hay empate arriba: una pregunta con dos respuestas buenas no es una pregunta.
function extremo(lista, campo, mayor) {
  if (!lista || lista.length < 4) return null;
  const orden = lista.slice().sort((a, b) => (mayor ? b[campo] - a[campo] : a[campo] - b[campo]));
  if (orden[0][campo] === orden[1][campo]) return null;
  return { primero: orden[0], resto: orden.slice(1) };
}

// Varias formas de preguntar lo mismo, barajadas. Se queda con la primera que
// salga bien: si a una variante le falta un dato o le empatan los números, se
// prueba la siguiente en vez de perder la categoría entera.
function primeraQueSalga(variantes, contexto) {
  for (const variante of barajar(variantes, contexto.azar)) {
    let pregunta = null;
    try {
      pregunta = variante(contexto);
    } catch (error) {
      pregunta = null;
    }
    if (pregunta) return pregunta;
  }
  return null;
}

// Una jornada del histórico con tabla suficiente para montar cuatro opciones.
function jornadaAlAzar(historico, azar) {
  const jornadas = (historico || []).filter((j) => {
    if (!j || !Array.isArray(j.equipos)) return false;
    return j.equipos.filter((e) => e && e.equipo && Number.isFinite(e.posicion)).length >= 4;
  });
  const jornada = elegir(jornadas, azar);
  if (!jornada) return null;
  return {
    jornada: jornada.jornada,
    equipos: jornada.equipos.filter((e) => e && e.equipo && Number.isFinite(e.posicion)),
  };
}

// "¿Quién iba <mote> en la jornada N?" para un puesto concreto de la tabla.
function enPuesto(historico, azar, puesto, mote) {
  const jornada = jornadaAlAzar(historico, azar);
  if (!jornada) return null;

  const enEsePuesto = jornada.equipos.find((e) => e.posicion === puesto);
  if (!enEsePuesto) return null;

  // Los vecinos de tabla primero: un distractor del otro extremo no cuela.
  const vecinos = jornada.equipos
    .filter((e) => e.equipo !== enEsePuesto.equipo)
    .sort((a, b) => Math.abs(a.posicion - puesto) - Math.abs(b.posicion - puesto));

  return montar(azar, 'historico', `¿Quién iba ${mote} en la jornada ${jornada.jornada}?`,
    enEsePuesto.equipo, barajar(vecinos.slice(0, 5), azar).concat(vecinos.slice(5)).map((e) => e.equipo));
}

// Nombres de los doce presidentes. La clasificación es la fuente buena (trae
// también el id de Biwenger); presidentes[] es el plan B.
function nombresEquipos(liga) {
  const desde = (lista) => (Array.isArray(lista) ? lista : [])
    .map((e) => e && e.equipo)
    .filter(Boolean);
  const cl = desde(liga.clasificacion);
  return cl.length ? cl : desde(liga.presidentes);
}


// ---------------------------------------------------------------------------
// Las categorías
// ---------------------------------------------------------------------------
// Cada una devuelve una pregunta o null si le faltan datos. Para añadir una
// nueva basta con meterla en esta lista: el juego no se toca.

export const CATEGORIAS = [

  // ¿De quién es Vinícius Jr?
  {
    clave: 'plantilla',
    construir({ liga, azar, equipos, libre, marcar }) {
      const conDuenyo = (liga.jugadores || []).filter((j) => j && j.nombre && j.presidente);
      if (conDuenyo.length < 4 || equipos.length < 4) return null;

      // De los más caros: si preguntas por el suplente de nadie, no hay pique.
      const conocidos = conDuenyo
        .slice()
        .sort((a, b) => (b.precio || 0) - (a.precio || 0))
        .slice(0, 40)
        .filter((j) => libre(j.nombre));

      const jugador = elegir(conocidos, azar);
      if (!jugador) return null;
      marcar(jugador.nombre);

      const otros = barajar(equipos.filter((e) => e !== jugador.presidente), azar);
      return montar(azar, 'plantilla', `¿De quién es ${jugador.nombre}?`, jugador.presidente, otros);
    },
  },

  // ¿Quién pagó los 12,1 M por Kang-in Lee?
  {
    clave: 'clausula_cara',
    construir({ liga, azar, equipos, libre, marcar }) {
      const clausulas = (liga.mercadoPresidentes || []).filter(
        (m) => m && m.tipo === 'clausula' && m.comprador && m.nombre && m.pideBruto > 0
      );
      if (!clausulas.length) return null;

      // Las diez más caras: son las que dolieron y las que todo el mundo recuerda.
      const gordas = clausulas
        .slice()
        .sort((a, b) => b.pideBruto - a.pideBruto)
        .slice(0, 10)
        .filter((c) => libre(c.nombre));
      const c = elegir(gordas, azar);
      if (!c) return null;
      marcar(c.nombre);

      const precio = c.pide || millones(c.pideBruto);
      // El vendedor entra como distractor a propósito: es el que más confunde.
      const otros = barajar(equipos.filter((e) => e !== c.comprador), azar);
      return montar(
        azar,
        'clausula_cara',
        `¿Quién pagó los ${precio} por ${c.nombre}?`,
        c.comprador,
        otros
      );
    },
  },

  // ¿Cuántos puntos lleva CD Tiro Buchón?
  {
    clave: 'puntos',
    construir({ liga, azar }) {
      const cl = (liga.clasificacion || []).filter(
        (e) => e && e.equipo && Number.isFinite(e.puntos)
      );
      if (!cl.length) return null;

      const equipo = elegir(cl, azar);
      if (!equipo) return null;

      // Cerca, para que haya que saberlo de verdad y no valga con estimar.
      //
      // Las formas van con las cuatro repartiones posibles y a partes iguales:
      // si los distractores fueran siempre unos por debajo y otros por encima,
      // la correcta nunca sería ni la más alta ni la más baja, y bastaría con
      // tirar a las dos de en medio para acertar el doble sin saber nada.
      const formas = [
        [-8, -15, -22],   // todos por debajo: la correcta es la más alta
        [-8, -15, 9],
        [-9, 8, 15],
        [8, 15, 22],      // todos por encima: la correcta es la más baja
      ];
      const desvios = elegir(formas, azar).concat([-8, 9, 15, 22, 30, 37]);

      const distractores = [];
      for (const d of desvios) {
        const valor = equipo.puntos + d;
        if (valor >= 0) distractores.push(String(valor));
      }

      return montar(
        azar,
        'puntos',
        `¿Cuántos puntos lleva ${equipo.equipo}?`,
        String(equipo.puntos),
        distractores
      );
    },
  },

  // ¿Quién iba líder en la jornada 3?
  //
  // También con variantes: en siete jornadas el líder ha sido casi siempre el
  // mismo, así que preguntar solo por el primero se memoriza igual de rápido.
  // Se pregunta por el primero, el segundo, el tercero, el último y por el
  // puesto de uno concreto.
  {
    clave: 'historico',
    construir: (contexto) => primeraQueSalga([

      ({ historico, azar }) => enPuesto(historico, azar, 1, 'líder'),
      ({ historico, azar }) => enPuesto(historico, azar, 2, 'segundo'),
      ({ historico, azar }) => enPuesto(historico, azar, 3, 'tercero'),

      ({ historico, azar }) => {
        const jornada = jornadaAlAzar(historico, azar);
        if (!jornada) return null;
        const ultimo = Math.max(...jornada.equipos.map((e) => e.posicion || 0));
        return enPuesto([jornada], azar, ultimo, 'último');
      },

      // Al revés: te doy el equipo y dime el puesto. Los distractores son los
      // puestos reales que ocupaban otros esa jornada.
      ({ historico, azar }) => {
        const jornada = jornadaAlAzar(historico, azar);
        if (!jornada) return null;
        const equipo = elegir(jornada.equipos, azar);
        if (!equipo || !Number.isFinite(equipo.posicion)) return null;
        const otros = barajar(jornada.equipos.filter((e) => e.equipo !== equipo.equipo), azar);
        return montar(azar, 'historico',
          `¿En qué puesto iba ${equipo.equipo} en la jornada ${jornada.jornada}?`,
          equipo.posicion + 'º', otros.map((e) => e.posicion + 'º'));
      },

    ], contexto),
  },

  // ¿Quién fue el paquete de la jornada 7?
  {
    clave: 'paquete',
    construir({ liga, azar }) {
      const paquete = liga.premios && liga.premios.paquete;
      if (!paquete || !paquete.nombre) return null;

      // Distractores entre los peores: si pones estrellas, canta cuál es.
      const malos = (liga.jugadores || [])
        .filter((j) => j && j.nombre && j.nombre !== paquete.nombre && Number.isFinite(j.media))
        .sort((a, b) => a.media - b.media)
        .slice(0, 40);
      if (malos.length < 3) return null;

      const jornada = String(paquete.jornada || 'jornada').toLowerCase();
      return montar(
        azar,
        'paquete',
        `¿Quién fue el paquete de la ${jornada}?`,
        paquete.nombre,
        barajar(malos, azar).map((j) => j.nombre)
      );
    },
  },

  // ¿Qué plantilla vale más?
  //
  // Con una sola forma de preguntarlo la respuesta sería la misma durante
  // semanas y se memorizaría en dos duelos. Por eso van cuatro variantes: la
  // más cara y la más barata de cuatro al azar (la respuesta cambia según a
  // quién le toque salir), la más cara de toda la liga, y cuánto vale una.
  {
    clave: 'valor',
    construir: (contexto) => primeraQueSalga([

      ({ liga, azar }) => {
        const cuatro = barajar(presidentesCon(liga, 'valorBruto'), azar).slice(0, 4);
        const e = extremo(cuatro, 'valorBruto', true);
        if (!e) return null;
        return montar(azar, 'valor', '¿Cuál de estas cuatro plantillas vale más?',
          e.primero.equipo, e.resto.map((p) => p.equipo));
      },

      ({ liga, azar }) => {
        const cuatro = barajar(presidentesCon(liga, 'valorBruto'), azar).slice(0, 4);
        const e = extremo(cuatro, 'valorBruto', false);
        if (!e) return null;
        return montar(azar, 'valor', '¿Cuál de estas cuatro plantillas vale menos?',
          e.primero.equipo, e.resto.map((p) => p.equipo));
      },

      ({ liga, azar }) => {
        const e = extremo(presidentesCon(liga, 'valorBruto'), 'valorBruto', true);
        if (!e) return null;
        return montar(azar, 'valor', '¿Quién tiene la plantilla más cara de la liga?',
          e.primero.equipo, barajar(e.resto, azar).map((p) => p.equipo));
      },

      // Aquí los distractores son los valores reales de otros presidentes, no
      // cifras redondeadas: así no se puede descartar por lo que no existe.
      ({ liga, azar }) => {
        const todos = presidentesCon(liga, 'valorBruto');
        if (todos.length < 4) return null;
        const p = elegir(todos, azar);
        if (!p) return null;
        const texto = (x) => x.valor || millones(x.valorBruto);
        return montar(azar, 'valor', `¿Cuánto vale la plantilla de ${p.equipo}?`,
          texto(p), barajar(todos.filter((x) => x.equipo !== p.equipo), azar).map(texto));
      },

    ], contexto),
  },

  // ¿Quién ha clausulado más veces?
  //
  // Mismo problema que 'valor': el que más clausula lo es durante media
  // temporada. Las variantes preguntan por el de toda la liga, por el mejor de
  // cuatro al azar, por el que más las ha sufrido (que es otro) y por cuántas
  // lleva uno concreto.
  {
    clave: 'clausulador',
    construir: (contexto) => primeraQueSalga([

      ({ liga, azar, equipos }) => {
        const e = extremo(presidentesCon(liga, 'clausulasHechas'), 'clausulasHechas', true);
        if (e) {
          return montar(azar, 'clausulador', '¿Quién ha clausulado más veces esta temporada?',
            e.primero.equipo, barajar(e.resto, azar).map((p) => p.equipo));
        }
        // Plan B si no hubiera presidentes[]: el ranking de cláusulas, que solo
        // trae el top cinco y hay que completar con el resto de equipos.
        const ranking = (liga.rankingClausulas || [])
          .filter((r) => r && r.nombre && Number.isFinite(r.veces))
          .sort((a, b) => b.veces - a.veces);
        if (ranking.length < 2 || ranking[0].veces === ranking[1].veces) return null;
        const lider = ranking[0].nombre;
        const perseguidores = ranking.slice(1).map((r) => r.nombre);
        const otros = barajar(equipos.filter((x) => x !== lider && !perseguidores.includes(x)), azar);
        return montar(azar, 'clausulador', '¿Quién ha clausulado más veces esta temporada?',
          lider, perseguidores.concat(otros));
      },

      ({ liga, azar }) => {
        const cuatro = barajar(presidentesCon(liga, 'clausulasHechas'), azar).slice(0, 4);
        const e = extremo(cuatro, 'clausulasHechas', true);
        if (!e) return null;
        return montar(azar, 'clausulador', '¿Cuál de estos cuatro ha clausulado más veces?',
          e.primero.equipo, e.resto.map((p) => p.equipo));
      },

      // La otra cara: quien más las sufre no suele ser quien más las hace.
      ({ liga, azar }) => {
        const e = extremo(presidentesCon(liga, 'clausulasSufridas'), 'clausulasSufridas', true);
        if (!e) return null;
        return montar(azar, 'clausulador', '¿A quién le han clausulado más jugadores?',
          e.primero.equipo, barajar(e.resto, azar).map((p) => p.equipo));
      },

      ({ liga, azar }) => {
        const todos = presidentesCon(liga, 'clausulasHechas');
        if (todos.length < 4) return null;
        const p = elegir(todos, azar);
        if (!p) return null;
        return montar(azar, 'clausulador', `¿Cuántas cláusulas ha hecho ${p.equipo}?`,
          String(p.clausulasHechas),
          barajar(todos.filter((x) => x.equipo !== p.equipo), azar).map((x) => String(x.clausulasHechas)));
      },

    ], contexto),
  },

  // ¿Cuánto vale Mbappé en el mercado?
  {
    clave: 'precio',
    construir({ liga, azar, libre, marcar }) {
      // Solo jugadores de cierto precio: con los baratos, el ±20% redondea al
      // mismo "0,2 M" y te quedas sin opciones distintas.
      const caros = (liga.jugadores || [])
        .filter((j) => j && j.nombre && Number.isFinite(j.precio) && j.precio >= 2000000)
        .sort((a, b) => b.precio - a.precio)
        .slice(0, 40)
        .filter((j) => libre(j.nombre));
      if (!caros.length) return null;

      const jugador = elegir(caros, azar);
      if (!jugador) return null;
      marcar(jugador.nombre);

      // Mismo cuidado que en 'puntos': las cuatro formas a partes iguales, para
      // que la correcta caiga igual de a menudo en cualquiera de las cuatro
      // posiciones al ordenar de barata a cara. Si no, se acierta a ciegas.
      const formas = [
        [0.72, 0.8, 0.88],   // todos por debajo: la correcta es la más cara
        [0.76, 0.84, 1.18],
        [0.82, 1.16, 1.24],
        [1.12, 1.2, 1.3],    // todos por encima: la correcta es la más barata
      ];
      // La cola es la red por si el redondeo a un decimal hace chocar a dos.
      const factores = elegir(formas, azar).concat([0.6, 1.4, 0.5, 1.6, 0.4, 1.9]);
      const distractores = factores.map((f) => millones(jugador.precio * f));

      return montar(
        azar,
        'precio',
        `¿Cuánto vale ${jugador.nombre} en el mercado?`,
        jugador.precioTexto || millones(jugador.precio),
        distractores
      );
    },
  },

];


// ---------------------------------------------------------------------------
// Generador
// ---------------------------------------------------------------------------

/**
 * Construye las preguntas de un duelo, una por categoría y en orden aleatorio.
 *
 * @param {object} liga       contenido de data/liga.json
 * @param {Array}  historico  contenido de data/historico.json
 * @param {number} n          cuántas preguntas (8 en el juego)
 * @param {object} [opciones] { azar } para fijar el azar en las pruebas
 * @returns {Array} preguntas con { orden, categoria, enunciado, opciones, correcta }
 *
 * Devuelve menos de n si a alguna categoría le faltan datos. Quien llama
 * decide qué hacer con eso: crear-duelo exige las ocho.
 */
export function generarPreguntas(liga, historico, n = 8, opciones = {}) {
  const azar = opciones.azar || Math.random;

  // Ningún jugador sale en dos preguntas del mismo duelo: preguntar por Pépé
  // dos veces seguidas queda pobre. El paquete de la jornada se aparta antes
  // de empezar, porque esa pregunta no puede elegir a otro.
  const usados = new Set();
  const marcar = (nombre) => usados.add(String(nombre || '').toLowerCase());
  const libre = (nombre) => !usados.has(String(nombre || '').toLowerCase());
  const paquete = liga && liga.premios && liga.premios.paquete;
  if (paquete && paquete.nombre) marcar(paquete.nombre);

  const contexto = {
    liga: liga || {},
    historico: Array.isArray(historico) ? historico : [],
    azar,
    equipos: nombresEquipos(liga || {}),
    libre,
    marcar,
  };

  const preguntas = [];
  for (const categoria of barajar(CATEGORIAS, azar)) {
    if (preguntas.length >= n) break;
    let pregunta = null;
    try {
      pregunta = categoria.construir(contexto);
    } catch (error) {
      // Una categoría rota no puede llevarse por delante el duelo entero.
      pregunta = null;
    }
    if (pregunta) preguntas.push(pregunta);
  }

  return preguntas.map((pregunta, i) => ({ orden: i + 1, ...pregunta }));
}
