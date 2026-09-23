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
  {
    clave: 'historico',
    construir({ historico, azar }) {
      const jornadas = historico.filter(
        (j) => j && Array.isArray(j.equipos) && j.equipos.length >= 4
      );
      if (!jornadas.length) return null;

      const jornada = elegir(jornadas, azar);
      if (!jornada) return null;

      const lider = jornada.equipos.find((e) => e && e.posicion === 1) || jornada.equipos[0];
      if (!lider || !lider.equipo) return null;

      // Los perseguidores primero: un distractor del fondo de la tabla no cuela.
      const perseguidores = jornada.equipos
        .filter((e) => e && e.equipo && e.equipo !== lider.equipo)
        .sort((a, b) => (a.posicion || 99) - (b.posicion || 99));

      const cerca = barajar(perseguidores.slice(0, 6), azar).map((e) => e.equipo);
      const resto = barajar(perseguidores.slice(6), azar).map((e) => e.equipo);

      return montar(
        azar,
        'historico',
        `¿Quién iba líder en la jornada ${jornada.jornada}?`,
        lider.equipo,
        cerca.concat(resto)
      );
    },
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
  {
    clave: 'valor',
    construir({ liga, azar }) {
      const fuente = (liga.presidentes && liga.presidentes.length ? liga.presidentes : liga.clasificacion) || [];
      const conValor = fuente.filter((p) => p && p.equipo && Number.isFinite(p.valorBruto));
      if (conValor.length < 4) return null;

      const cuatro = barajar(conValor, azar).slice(0, 4).sort((a, b) => b.valorBruto - a.valorBruto);

      // Si los dos primeros empatan en valor, la pregunta no tiene respuesta.
      if (cuatro[0].valorBruto === cuatro[1].valorBruto) return null;

      return montar(
        azar,
        'valor',
        '¿Qué plantilla vale más ahora mismo?',
        cuatro[0].equipo,
        cuatro.slice(1).map((p) => p.equipo)
      );
    },
  },

  // ¿Quién ha clausulado más veces?
  {
    clave: 'clausulador',
    construir({ liga, azar, equipos }) {
      const ranking = (liga.rankingClausulas || [])
        .filter((r) => r && r.nombre && Number.isFinite(r.veces))
        .sort((a, b) => b.veces - a.veces);
      if (ranking.length < 2) return null;

      // Empate en lo alto: no hay una respuesta buena, fuera la pregunta.
      if (ranking[0].veces === ranking[1].veces) return null;

      const lider = ranking[0].nombre;
      const perseguidores = ranking.slice(1).map((r) => r.nombre);
      const otros = barajar(equipos.filter((e) => e !== lider && !perseguidores.includes(e)), azar);

      return montar(
        azar,
        'clausulador',
        '¿Quién ha clausulado más veces esta temporada?',
        lider,
        perseguidores.concat(otros)
      );
    },
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
