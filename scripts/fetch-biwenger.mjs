/**
 * Trae los datos de la liga desde Biwenger y los guarda en data/liga.json
 *
 * Necesita tres variables de entorno (ver .env.example):
 *   BIWENGER_TOKEN   -> el valor de la cabecera Authorization, sin la palabra "Bearer"
 *   BIWENGER_LEAGUE  -> el ID de la liga (cabecera X-League)
 *   BIWENGER_USER    -> tu ID de usuario (cabecera X-User)
 *
 * Uso:  node scripts/fetch-biwenger.mjs
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TOKEN = process.env.BIWENGER_TOKEN;
const LEAGUE = process.env.BIWENGER_LEAGUE;
const USER = process.env.BIWENGER_USER;

if (!TOKEN || !LEAGUE || !USER) {
  console.error('\nFaltan credenciales.');
  console.error('Define BIWENGER_TOKEN, BIWENGER_LEAGUE y BIWENGER_USER antes de ejecutar.');
  console.error('Mira el archivo .env.example para saber de dónde sale cada una.\n');
  process.exit(1);
}

const API = 'https://biwenger.as.com/api/v2';
const CDN = 'https://cf.biwenger.com/api/v2';

const cabeceras = {
  'Authorization': TOKEN.startsWith('Bearer') ? TOKEN : `Bearer ${TOKEN}`,
  'X-League': String(LEAGUE),
  'X-User': String(USER),
  'X-Version': process.env.BIWENGER_VERSION || '631',
  'X-Lang': 'es',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://biwenger.as.com/',
  'Origin': 'https://biwenger.as.com'
};

async function pedir(url, conCabeceras = true) {
  const res = await fetch(url, { headers: conCabeceras ? cabeceras : { 'Accept': 'application/json' } });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} en ${url}\n${cuerpo.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

const millones = (n) => (typeof n === 'number' ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} M` : '—');

const iniciales = (nombre = '') =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '??';

/**
 * Biwenger guarda el avatar de cada usuario como un nombre de archivo.
 * No hay documentación de dónde vive, así que probamos varias direcciones
 * posibles y nos quedamos con la primera que responda.
 */
const PREFIJOS_ESCUDO = [
  // El icono suele venir ya con su ruta ("i/u/12345.png"), así que basta el dominio
  'https://cdn.biwenger.com/',
  'https://cf.biwenger.com/',
  'https://biwenger.as.com/',
  // Por si en algún caso llegara solo el nombre del archivo
  'https://cdn.biwenger.com/i/u/',
  'https://cdn.biwenger.com/i/a/'
];

let prefijoBueno = null;
let fotoJugador = null;

/**
 * Igual que con los escudos: probamos dónde guarda Biwenger las fotos
 * de los jugadores y nos quedamos con el formato que responda.
 */
const FORMATOS_FOTO = [
  (id) => `https://cdn.biwenger.com/i/p/${id}.png`,
  (id) => `https://cdn.biwenger.com/i/p/${id}.jpg`,
  (id) => `https://cdn.biwenger.com/i/players/${id}.png`,
  (id) => `https://cf.biwenger.com/i/p/${id}.png`
];

async function detectarFotoJugador(idEjemplo) {
  if (!idEjemplo) return null;
  console.log(`\nBuscando las fotos de los jugadores (ejemplo: jugador ${idEjemplo})...`);
  for (const formato of FORMATOS_FOTO) {
    const url = formato(idEjemplo);
    try {
      const res = await fetch(url, { headers: { 'Accept': 'image/*' } });
      const tipo = res.headers.get('content-type') || '';
      if (res.ok && tipo.startsWith('image')) {
        console.log(`  Encontrado: ${url.replace(String(idEjemplo), '{id}')}`);
        return formato;
      }
      console.log(`  No -> ${url} (${res.status})`);
    } catch {
      console.log(`  No -> ${url} (sin respuesta)`);
    }
  }
  console.log('  Ninguna ha funcionado. El mercado se verá sin fotos.');
  return null;
}

const urlFoto = (id) => (fotoJugador && id ? fotoJugador(id) : '');

async function detectarPrefijoEscudo(iconoEjemplo) {
  if (!iconoEjemplo) return null;
  if (/^https?:\/\//.test(iconoEjemplo)) return 'DIRECTO';

  console.log(`\nBuscando dónde viven los escudos (ejemplo: "${iconoEjemplo}")...`);
  const limpio = String(iconoEjemplo).replace(/^\/+/, '');
  for (const prefijo of PREFIJOS_ESCUDO) {
    const url = prefijo.replace(/\/+$/, '') + '/' + limpio;
    try {
      const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'image/*' } });
      const tipo = res.headers.get('content-type') || '';
      if (res.ok && tipo.startsWith('image')) {
        console.log(`  Encontrado: ${prefijo}`);
        return prefijo;
      }
      console.log(`  No -> ${prefijo} (${res.status})`);
    } catch {
      console.log(`  No -> ${prefijo} (sin respuesta)`);
    }
  }
  console.log('  Ninguna dirección ha funcionado. Se usarán las iniciales.');
  return null;
}

function urlEscudo(icono) {
  if (!icono) return '';
  if (/^https?:\/\//.test(icono)) return icono;
  if (!prefijoBueno || prefijoBueno === 'DIRECTO') return '';
  return prefijoBueno.replace(/\/+$/, '') + '/' + String(icono).replace(/^\/+/, '');
}

/* ---------- Clasificación ---------- */

async function traerClasificacion() {
  const campos = 'standings(*,icon,group),name,competition,mode,scoreID';
  const liga = await pedir(`${API}/league?include=all&fields=${encodeURIComponent(campos)}`);

  const bruto = liga.standings || [];
  prefijoBueno = await detectarPrefijoEscudo((bruto.find((e) => e.icon) || {}).icon);

  const tabla = bruto.map((equipo, i) => {
    const nombreEquipo = equipo.name || 'Sin nombre';
    // El mánager solo se muestra si Biwenger lo da y es distinto del nombre del equipo
    const nombreManager = equipo.user?.name || equipo.owner?.name || '';
    return {
      posicion: i + 1,
      id: equipo.id,
      equipo: nombreEquipo,
      manager: nombreManager && nombreManager !== nombreEquipo ? nombreManager : '',
      iniciales: iniciales(nombreEquipo),
      escudo: urlEscudo(equipo.icon),
      puntos: equipo.points ?? 0,
      valor: millones(equipo.teamValue),
      valorBruto: equipo.teamValue ?? 0,
      esTuyo: String(equipo.id) === String(USER)
    };
  });

  const conEscudo = tabla.filter((e) => e.escudo).length;
  console.log(`Escudos de equipo listos: ${conEscudo} de ${tabla.length}.`);

  return { nombreLiga: liga.name || "Johnny's League", tabla, scoreID: liga.scoreID != null ? String(liga.scoreID) : null };
}

/* ---------- Mercado de Biwenger ---------- */

async function traerMercadoBiwenger(jugadoresPorId) {
  const campos = 'sales(*,user(id,name),player(id,name,slug,position,teamID,price,priceIncrement))';
  const mercado = await pedir(`${API}/market?include=all&fields=${encodeURIComponent(campos)}`);

  const libres = (mercado.sales || []).filter((v) => !v.user);

  if (!fotoJugador && libres.length) {
    fotoJugador = await detectarFotoJugador(libres.find((v) => v.player?.id)?.player?.id);
  }

  return libres.map((venta) => {
    const p = venta.player || {};
    const info = jugadoresPorId[p.id] || {};
    return {
      nombre: p.name || info.name || 'Jugador',
      posicion: nombrePosicion(p.position ?? info.position),
      equipo: info.equipo || '',
      foto: urlFoto(p.id),
      precio: millones(p.price ?? info.price),
      variacion: p.priceIncrement ?? info.priceIncrement ?? 0,
      dorsal: p.position ?? ''
    };
  });
}

/* ---------- Mercado entre presidentes ---------- */

async function traerMercadoPresidentes(jugadoresPorId) {
  const campos = 'sales(*,user(id,name),player(id,name,price,position)),offers(*,user(id,name))';
  const mercado = await pedir(`${API}/market?include=all&fields=${encodeURIComponent(campos)}`);

  const enVenta = (mercado.sales || [])
    .filter((v) => v.user)
    .map((v) => {
      const p = v.player || {};
      const info = jugadoresPorId[p.id] || {};
      const valorMercado = p.price ?? info.price ?? 0;
      const pide = v.price ?? 0;
      return {
        tipo: 'venta',
        nombre: p.name || info.name || 'Jugador',
        foto: urlFoto(p.id),
        posicion: nombrePosicion(p.position ?? info.position),
        equipoReal: info.equipo || '',
        vendedor: v.user?.name || 'Un presidente',
        pide: millones(pide),
        pideBruto: pide,
        valorMercado: millones(valorMercado),
        valorBruto: valorMercado,
        diferencia: valorMercado ? pide - valorMercado : 0
      };
    });

  // Cláusulas pagadas. La ruta lleva el ID de la liga dentro:
  //   /api/v2/league/{id}/board?type=clauses&limit=8
  let clausulas = [];
  const RUTAS = [
    `league/${LEAGUE}/board?type=clauses&limit=100`,
    `league/${LEAGUE}/board?type=clauses&limit=30`,
    `league/${LEAGUE}/board?limit=30`
  ];

  let entradas = null;
  console.log('\nBuscando el tablón de cláusulas...');
  for (const ruta of RUTAS) {
    try {
      const res = await fetch(`${API}/${ruta}`, { headers: cabeceras });
      if (!res.ok) {
        console.log(`  No -> ${ruta} (${res.status})`);
        continue;
      }
      const json = await res.json();
      entradas = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
      console.log(`  Funciona: ${ruta} -> ${entradas.length} entradas`);
      break;
    } catch (e) {
      console.log(`  No -> ${ruta} (${e.message.split('\n')[0]})`);
    }
  }

  if (entradas && entradas.length) {
    // El tipo real ("clause" o "transfer") va dentro de cada operación,
    // no en la entrada del tablón que las envuelve.
    clausulas = entradas.flatMap((entrada) => {
      const cuando = entrada.date ? new Date(entrada.date * 1000).toISOString() : null;
      const contenido = Array.isArray(entrada.content) ? entrada.content : [entrada.content].filter(Boolean);

      return contenido
        .filter((op) => op && op.type === 'clause')
        .map((op) => {
          // El jugador llega como número suelto, hay que buscarlo en el catálogo
          const idJugador = typeof op.player === 'object' ? op.player?.id : op.player;
          const info = jugadoresPorId[idJugador] || {};
          const valorMercado = info.price ?? 0;
          const pagado = op.amount ?? 0;
          return {
            tipo: 'clausula',
            fecha: cuando,
            nombre: info.name || 'Jugador',
            foto: urlFoto(idJugador),
            posicion: nombrePosicion(info.position),
            equipoReal: info.equipo || '',
            vendedor: op.from?.name || '?',
            comprador: op.to?.name || '?',
            escudoComprador: urlEscudo(op.to?.icon),
            pide: millones(pagado),
            pideBruto: pagado,
            valorMercado: millones(valorMercado),
            valorBruto: valorMercado,
            diferencia: valorMercado ? pagado - valorMercado : 0
          };
        });
    });

    console.log(`Cláusulas pagadas: ${clausulas.length}.`);

    if (!clausulas.length && entradas[0]) {
      console.log('\nNo he sabido leer el contenido. Esto es lo que devuelve Biwenger:');
      console.log(JSON.stringify(entradas[0], null, 2).slice(0, 900));
    }
  } else {
    console.warn('Aviso: ninguna forma de pedir el tablón ha funcionado.');
  }

  return [...enVenta, ...clausulas];
}

/* ---------- Partidos de la jornada ---------- */

const ESCUDOS_EQUIPO = [
  (id) => `https://cdn.biwenger.com/i/t/${id}.png`,
  (id) => `https://cdn.biwenger.com/i/e/${id}.png`,
  (id) => `https://cdn.biwenger.com/i/teams/${id}.png`
];

let escudoEquipo = null;

async function detectarEscudoEquipo(idEjemplo) {
  if (!idEjemplo) return null;
  console.log(`\nBuscando los escudos de los equipos (ejemplo: equipo ${idEjemplo})...`);
  for (const formato of ESCUDOS_EQUIPO) {
    const url = formato(idEjemplo);
    try {
      const res = await fetch(url, { headers: { 'Accept': 'image/*' } });
      const tipo = res.headers.get('content-type') || '';
      if (res.ok && tipo.startsWith('image')) {
        console.log(`  Encontrado: ${url.replace(String(idEjemplo), '{id}')}`);
        return formato;
      }
      console.log(`  No -> ${url} (${res.status})`);
    } catch {
      console.log(`  No -> ${url} (sin respuesta)`);
    }
  }
  console.log('  Ninguna ha funcionado. La tira saldrá sin escudos.');
  return null;
}

async function traerPartidos(equiposPorId) {
  // Paso 1: saber en qué jornada estamos
  let jornadaActual = null;
  try {
    const res = await fetch(`${API}/rounds/la-liga`, { headers: cabeceras });
    if (res.ok) {
      const json = await res.json();
      jornadaActual = json.data ?? json;
      console.log(`\nJornada según Biwenger: ${jornadaActual.name} (id ${jornadaActual.id}).`);
    }
  } catch (e) {
    console.warn('Aviso: no se pudo leer la jornada actual.', e.message);
  }

  if (!jornadaActual?.id) {
    console.warn('Aviso: sin jornada, no puedo buscar partidos.');
    return { jornada: null, partidos: [] };
  }

  // Paso 2: buscar los partidos de la jornada ACTUAL (la misma que marca
  // Biwenger como en curso). Antes se prefería "la siguiente", pero eso
  // hacía que la tira mostrara una jornada distinta a la que pone la cabecera.
  const ids = [jornadaActual.id, jornadaActual.id + 1];
  const PLANTILLAS = [
    (id) => `${API}/rounds/la-liga/${id}`,
    (id) => `${CDN}/rounds/la-liga/${id}`,
    (id) => `${API}/matches?round=${id}`,
    (id) => `${CDN}/competitions/la-liga/rounds/${id}`
  ];

  console.log('\nBuscando los partidos de la jornada...');
  for (const id of ids) {
    for (const plantilla of PLANTILLAS) {
      const url = plantilla(id);
      try {
        const res = await fetch(url, { headers: cabeceras });
        if (!res.ok) { console.log(`  No -> ${url} (${res.status})`); continue; }

        const json = await res.json();
        const datos = json.data ?? json;
        const bruto = datos.games || datos.matches || (Array.isArray(datos) ? datos : null);

        if (!bruto || !bruto.length) {
          console.log(`  Responde pero sin partidos -> ${url}`);
          console.log(`     contiene: ${Object.keys(datos).join(', ')}`);
          continue;
        }

        console.log(`  Funciona: ${url} -> ${bruto.length} partidos`);
        return await armarPartidos(bruto, datos, equiposPorId);
      } catch (e) {
        console.log(`  No -> ${url} (${e.message.split('\n')[0]})`);
      }
    }
  }

  console.warn('Aviso: no he encontrado los partidos en ninguna ruta.');
  return { jornada: jornadaActual.name || null, partidos: [] };
}

async function armarPartidos(bruto, datos, equiposPorId) {
  if (bruto.length && !escudoEquipo) {
    const ejemplo = bruto[0]?.home?.id ?? bruto[0]?.home;
    escudoEquipo = await detectarEscudoEquipo(ejemplo);
  }

  const partidos = bruto.map((g) => {
    const idLocal = g.home?.id ?? g.home;
    const idVisit = g.away?.id ?? g.away;
    return {
      local: g.home?.name || equiposPorId[idLocal] || '?',
      visitante: g.away?.name || equiposPorId[idVisit] || '?',
      escudoLocal: escudoEquipo && idLocal ? escudoEquipo(idLocal) : '',
      escudoVisitante: escudoEquipo && idVisit ? escudoEquipo(idVisit) : '',
      fecha: g.date ? new Date(g.date * 1000).toISOString() : null,
      golesLocal: g.home?.score ?? null,
      golesVisitante: g.away?.score ?? null,
      estado: g.status || null
    };
  });

  return { jornada: datos.name || datos.short || null, partidos };
}

/* ---------- Fichas de jugador (caché) ---------- */

/**
 * La ficha pública de un jugador se pide varias veces a lo largo del script
 * (para los puntos de la jornada y para el Once Ideal). Como es la misma
 * llamada, la guardamos para no repetirla.
 */
const fichasJugador = new Map();

async function fichaJugador(slug) {
  if (fichasJugador.has(slug)) return fichasJugador.get(slug);
  const campos = encodeURIComponent('reports(points,match(round,status),rawStats),scoreStats');
  const datos = await pedir(`${CDN}/players/la-liga/${slug}?lang=es&fields=${campos}`, false);
  fichasJugador.set(slug, datos);
  return datos;
}

/* ---------- Puntos de la jornada en curso ---------- */

/**
 * Biwenger no suma los puntos de una jornada a la clasificación hasta que la
 * jornada se cierra (después del último partido). Mientras tanto esos puntos
 * sí existen, pero repartidos en las alineaciones: /rounds/league/<id> da el
 * once de cada presidente, y la ficha de cada jugador dice lo que puntuó.
 *
 * Dos detalles comprobados contra la propia app:
 *  - El capitán puntúa doble.
 *  - Un jugador solo tiene puntuación cuando SU partido ha terminado. Lo que
 *    se está anotando en un partido en juego ahora mismo no se publica por
 *    aquí, entra en cuanto ese partido acaba.
 */
async function traerPuntosJornada(idJornada, tabla, catalogoJugadores, scoreID) {
  if (!idJornada || !scoreID) return null;

  let datos;
  try {
    datos = await pedir(`${API}/rounds/league/${idJornada}`);
  } catch (e) {
    console.warn('Aviso: no se han podido leer las alineaciones de la jornada.', e.message);
    return null;
  }

  const filas = datos?.league?.standings || [];
  if (!filas.length) return null;

  // Todos los jugadores alineados, sin repetirlos
  const alineados = [...new Set(
    filas.flatMap((f) => (f.lineup?.players || []).filter(Boolean).map(String))
  )];

  if (!alineados.length) {
    console.log('Puntos de la jornada: todavía no hay alineaciones publicadas.');
    return null;
  }

  const puntosPorJugador = new Map();
  const LIMITE = 8;
  let cursor = 0;
  async function trabajador() {
    while (cursor < alineados.length) {
      const id = alineados[cursor++];
      const slug = catalogoJugadores[id]?.slug;
      if (!slug) continue;
      try {
        const ficha = await fichaJugador(slug);
        const parte = (ficha.reports || []).find((r) => r.match?.round?.id === idJornada);
        const puntos = parte?.points?.[scoreID];
        if (puntos != null) {
          puntosPorJugador.set(id, { puntos, minutos: parte.rawStats?.minutesPlayed ?? 0 });
        }
      } catch {
        // Un jugador sin ficha simplemente no suma
      }
    }
  }
  await Promise.all(new Array(LIMITE).fill(0).map(trabajador));

  const porEquipo = new Map();
  let alguienHaJugado = false;

  for (const fila of filas) {
    const once = (fila.lineup?.players || []).filter(Boolean).map(String);
    let puntos = 0;
    let jugados = 0;

    for (const id of once) {
      const dato = puntosPorJugador.get(id);
      if (!dato) continue;
      puntos += dato.puntos;
      if (dato.minutos > 0) jugados++;
    }

    // El capitán cuenta doble: le sumamos otra vez lo suyo
    const datoCapitan = puntosPorJugador.get(String(fila.lineup?.captain?.id ?? ''));
    if (datoCapitan) puntos += datoCapitan.puntos;

    if (jugados > 0) alguienHaJugado = true;
    porEquipo.set(String(fila.id), { puntos, jugados, once: once.length, nombre: fila.name });
  }

  if (!alguienHaJugado) {
    console.log('Puntos de la jornada: aún no ha terminado ningún partido.');
    return null;
  }

  const resumen = [...porEquipo.values()]
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 3)
    .map((e) => `${e.nombre} ${e.puntos}`)
    .join(', ');
  console.log(`Puntos de la jornada en curso: ${porEquipo.size} equipos (mejores: ${resumen}).`);

  return porEquipo;
}

/* ---------- Histórico ---------- */

/**
 * Guarda una foto de la clasificación cada día en data/historico.json.
 * Con el tiempo esto permite dibujar la evolución de cada presidente.
 */
async function guardarHistorico(tabla, idJornadaActual, jornadaActual) {
  const ruta = resolve(RAIZ, 'data', 'historico.json');

  // Biwenger guarda la clasificación al cierre de cada jornada, así que
  // podemos reconstruir la temporada entera en vez de depender de lo que
  // hayamos ido grabando día a día. El ID de la jornada 1 es el de la
  // actual menos las jornadas transcurridas.
  const historico = [];
  if (idJornadaActual && jornadaActual >= 1) {
    const idPrimera = idJornadaActual - (jornadaActual - 1);
    for (let n = 1; n <= jornadaActual; n++) {
      try {
        const datos = await pedir(`${API}/rounds/league/${idPrimera + n - 1}`);
        const clasificacion = datos?.league?.standings || [];
        if (!clasificacion.length) continue;

        const equipos = clasificacion
          .map((e) => ({ equipo: e.name, puntos: e.points ?? 0, valor: e.teamValue ?? 0 }))
          .sort((a, b) => b.puntos - a.puntos)
          .map((e, i) => ({ ...e, posicion: i + 1 }));

        historico.push({ jornada: n, equipos });
      } catch (e) {
        console.warn(`Aviso: no se pudo leer la jornada ${n}.`, e.message);
      }
    }
  }

  // Si por lo que sea no se ha podido reconstruir nada, al menos guardamos
  // la foto de ahora mismo para no quedarnos sin gráfica.
  if (!historico.length) {
    historico.push({
      jornada: jornadaActual || 1,
      equipos: tabla.map((e) => ({
        equipo: e.equipo,
        posicion: e.posicion,
        puntos: e.puntos,
        valor: e.valorBruto
      }))
    });
  }

  await writeFile(ruta, JSON.stringify(historico, null, 2), 'utf8');
  console.log(`Histórico: ${historico.length} jornadas reconstruidas.`);

  return historico;
}

/**
 * Compara la última jornada con la anterior para ver quién sube y quién baja.
 */
function calcularTendencias(historico) {
  if (historico.length < 2) return {};

  const ultima = historico[historico.length - 1];
  const anterior = historico[historico.length - 2];

  const antes = new Map(anterior.equipos.map((e) => [e.equipo, e]));
  const salida = {};

  for (const e of ultima.equipos) {
    const previo = antes.get(e.equipo);
    if (!previo) continue;
    salida[e.equipo] = {
      puestos: previo.posicion - e.posicion,   // positivo = ha subido
      puntos: e.puntos - previo.puntos,
      desde: `Jornada ${anterior.jornada}`
    };
  }
  return salida;
}

/**
 * Mira el histórico y saca dos cosas:
 *  - Rachas: qué equipos llevan varias jornadas seguidas por encima (o por debajo)
 *    de la media de la liga en puntos anotados.
 *  - Movimientos: quién dio la mayor remontada y quién la mayor caída en la última jornada.
 *
 * El histórico ya viene con una entrada por jornada, pero descartamos las
 * jornadas en las que nadie sumó (aplazadas o todavía sin cerrar).
 */
function calcularRachasYMovimientos(historico, escudoPorEquipo) {
  const distintas = [];
  let firmaAnterior = null;
  for (const foto of historico) {
    const firma = foto.equipos.map((e) => e.puntos).join(',');
    if (firma !== firmaAnterior) {
      distintas.push(foto);
      firmaAnterior = firma;
    }
  }

  if (distintas.length < 2) return { rachas: [], movimientos: null };

  // Cuánto sumó cada equipo entre una foto y la siguiente
  const tramos = [];
  for (let i = 1; i < distintas.length; i++) {
    const antes = new Map(distintas[i - 1].equipos.map((e) => [e.equipo, e.puntos]));
    const deltas = distintas[i].equipos.map((e) => ({
      equipo: e.equipo,
      delta: e.puntos - (antes.get(e.equipo) ?? e.puntos)
    }));
    const media = deltas.reduce((s, d) => s + d.delta, 0) / (deltas.length || 1);
    tramos.push({ jornada: distintas[i].jornada, media, deltas });
  }

  const equipos = distintas[distintas.length - 1].equipos.map((e) => e.equipo);
  const rachas = equipos
    .map((nombre) => {
      let tipo = null;
      let cuenta = 0;
      for (let i = tramos.length - 1; i >= 0; i--) {
        const d = tramos[i].deltas.find((x) => x.equipo === nombre);
        if (!d) break;
        const porEncima = d.delta > tramos[i].media;
        const porDebajo = d.delta < tramos[i].media;
        if (tipo === null) {
          if (porEncima) tipo = 'positiva';
          else if (porDebajo) tipo = 'negativa';
          else break;
          cuenta = 1;
        } else if ((tipo === 'positiva' && porEncima) || (tipo === 'negativa' && porDebajo)) {
          cuenta++;
        } else break;
      }
      return { equipo: nombre, escudo: escudoPorEquipo.get(nombre) || '', tipo, jornadas: cuenta };
    })
    .filter((r) => r.tipo && r.jornadas >= 2) // menos de 2 jornadas no es racha, es ruido
    .sort((a, b) => b.jornadas - a.jornadas);

  const ultimo = tramos[tramos.length - 1];
  const ordenado = ultimo.deltas
    .slice()
    .sort((a, b) => (b.delta - ultimo.media) - (a.delta - ultimo.media));

  const conEscudo = (d) => ({ ...d, escudo: escudoPorEquipo.get(d.equipo) || '' });

  const movimientos = {
    jornada: ultimo.jornada,
    media: Number(ultimo.media.toFixed(1)),
    remontada: conEscudo(ordenado[0]),
    caida: conEscudo(ordenado[ordenado.length - 1])
  };

  return { rachas, movimientos };
}

/* ---------- Ficha de cada presidente ---------- */

function fichasPresidentes(tabla, clausulas, enVenta, jornadasJugadas) {
  const jornadas = jornadasJugadas > 0 ? jornadasJugadas : 1;

  const base = tabla.map((equipo) => {
    const hechas = clausulas.filter((c) => c.comprador === equipo.equipo);
    const sufridas = clausulas.filter((c) => c.vendedor === equipo.equipo);
    const gastado = hechas.reduce((s, c) => s + Number(c.pideBruto || 0), 0);
    const ingresado = sufridas.reduce((s, c) => s + Number(c.pideBruto || 0), 0);

    const sobreprecios = hechas
      .filter((c) => c.valorBruto)
      .map((c) => (c.pideBruto - c.valorBruto) / c.valorBruto);
    const sobreprecioMedio = sobreprecios.length
      ? Math.round((sobreprecios.reduce((a, b) => a + b, 0) / sobreprecios.length) * 100)
      : null;

    const masCara = hechas.slice().sort((a, b) => b.pideBruto - a.pideBruto)[0] || null;

    // Métricas de rendimiento
    const millonesPlantilla = (equipo.valorBruto || 0) / 1e6;
    const puntosPorMillon = millonesPlantilla > 0
      ? Number((equipo.puntos / millonesPlantilla).toFixed(2))
      : 0;
    const mediaJornada = Number((equipo.puntos / jornadas).toFixed(1));

    return {
      posicion: equipo.posicion,
      equipo: equipo.equipo,
      escudo: equipo.escudo,
      iniciales: equipo.iniciales,
      puntos: equipo.puntos,
      valor: equipo.valor,
      valorBruto: equipo.valorBruto,
      esTuyo: equipo.esTuyo,
      puntosPorMillon,
      mediaJornada,
      clausulasHechas: hechas.length,
      clausulasSufridas: sufridas.length,
      operaciones: hechas.length + sufridas.length,
      gastado: millones(gastado),
      gastadoBruto: gastado,
      ingresado: millones(ingresado),
      ingresadoBruto: ingresado,
      balance: (ingresado - gastado >= 0 ? '+' : '−') + millones(Math.abs(ingresado - gastado)),
      balanceBruto: ingresado - gastado,
      sobreprecioMedio,
      enVenta: enVenta.filter((v) => v.vendedor === equipo.equipo).length,
      fichajeEstrella: masCara
        ? { nombre: masCara.nombre, precio: masCara.pide, foto: masCara.foto }
        : null
    };
  });

  // Medias de la liga, para poder comparar cada uno contra el conjunto
  const media = (campo) => base.reduce((s, p) => s + (Number(p[campo]) || 0), 0) / (base.length || 1);
  const medias = {
    puntos: media('puntos'),
    puntosPorMillon: media('puntosPorMillon'),
    valorBruto: media('valorBruto'),
    gastadoBruto: media('gastadoBruto'),
    operaciones: media('operaciones')
  };

  // Posición de cada uno en cada ranking (1 = el mejor)
  const puestoEn = (campo, mayorEsMejor = true) => {
    const orden = base.slice().sort((a, b) =>
      mayorEsMejor ? b[campo] - a[campo] : a[campo] - b[campo]);
    return new Map(orden.map((p, i) => [p.equipo, i + 1]));
  };

  const puestoEficiencia = puestoEn('puntosPorMillon');
  const puestoValor = puestoEn('valorBruto');
  const puestoGasto = puestoEn('gastadoBruto');
  const puestoActividad = puestoEn('operaciones');

  const porcentajeSobre = (valor, referencia) =>
    referencia > 0 ? Math.round(((valor - referencia) / referencia) * 100) : null;

  return base.map((p) => ({
    ...p,
    total: base.length,
    puestoEficiencia: puestoEficiencia.get(p.equipo),
    puestoValor: puestoValor.get(p.equipo),
    puestoGasto: puestoGasto.get(p.equipo),
    puestoActividad: puestoActividad.get(p.equipo),
    vsMediaPuntos: porcentajeSobre(p.puntos, medias.puntos),
    vsMediaEficiencia: porcentajeSobre(p.puntosPorMillon, medias.puntosPorMillon),
    vsMediaValor: porcentajeSobre(p.valorBruto, medias.valorBruto)
  }));
}

/* ---------- Ranking de quién más clausula ---------- */

function rankingClausuladores(clausulas) {
  const cuenta = new Map();
  for (const c of clausulas) {
    if (!c.comprador || c.comprador === '?') continue;
    const actual = cuenta.get(c.comprador) || { nombre: c.comprador, veces: 0, gastado: 0 };
    actual.veces += 1;
    actual.gastado += Number(c.pideBruto || 0);
    cuenta.set(c.comprador, actual);
  }
  return [...cuenta.values()]
    .sort((a, b) => b.veces - a.veces || b.gastado - a.gastado)
    .slice(0, 5)
    .map((e) => ({ ...e, gastadoTexto: millones(e.gastado) }));
}

/* ---------- Catálogo de jugadores (sin autenticación) ---------- */

async function traerCatalogoJugadores() {
  try {
    const datos = await pedir(`${CDN}/competitions/la-liga/data?lang=es&score=1`, false);
    const equipos = datos.teams || {};
    const salida = {};
    for (const [id, j] of Object.entries(datos.players || {})) {
      salida[id] = {
        name: j.name,
        slug: j.slug,
        position: j.position,
        price: j.price,
        priceIncrement: j.priceIncrement,
        equipo: equipos[j.teamID]?.name || '',
        equipoId: j.teamID
      };
    }
    // Nombres de los equipos reales, para los partidos
    const nombresEquipos = {};
    const detalleEquipos = {};
    for (const [id, e] of Object.entries(equipos)) {
      nombresEquipos[id] = e.name;
      detalleEquipos[id] = { name: e.name, slug: e.slug };
    }
    return { jugadores: salida, equipos: nombresEquipos, detalleEquipos };
  } catch (e) {
    console.warn('Aviso: no se pudo cargar el catálogo de jugadores.', e.message);
    return { jugadores: {}, equipos: {}, detalleEquipos: {} };
  }
}

/**
 * Para cada uno de los 20 equipos reales de La Liga, pide su calendario
 * completo y se queda con los próximos partidos pendientes junto con la
 * dificultad que Biwenger calcula para ESE equipo en cada uno (jugar en
 * casa o fuera cambia la dificultad, así que no es la misma para los dos
 * rivales de un mismo partido).
 */
async function traerCalendarioEquipos(detalleEquipos, cuantasJornadas = 3) {
  const calendario = {};

  for (const [id, equipo] of Object.entries(detalleEquipos)) {
    if (!equipo.slug) continue;
    try {
      const campos = encodeURIComponent('matches(round,date,status,home,away)');
      const datos = await pedir(`${CDN}/teams/la-liga/${equipo.slug}?fields=${campos}`, false);
      const partidos = datos.matches || [];

      // La dificultad no es la misma para los dos equipos de un partido:
      // jugar en casa o fuera cambia el número, así que cogemos el suyo.
      const pendientes = partidos.filter((p) => p.status !== 'finished');
      calendario[id] = pendientes.slice(0, cuantasJornadas).map((p) => {
        const esLocal = p.home?.id === Number(id);
        return {
          jornada: p.round?.name || '',
          esLocal,
          rival: (esLocal ? p.away : p.home)?.name || '',
          dificultad: (esLocal ? p.home : p.away)?.difficulty?.rating ?? null
        };
      });
    } catch (e) {
      console.warn(`Aviso: no se pudo leer el calendario de ${equipo.name}.`, e.message);
      calendario[id] = [];
    }
  }
  return calendario;
}

/**
 * Junta la plantilla de cada presidente con el calendario de dificultad
 * de los equipos reales de sus jugadores.
 */
function calcularCalendarioPresidentes(plantillas, catalogoJugadores, calendarioEquipos, tabla) {
  const nombrePresidente = new Map(tabla.map((e) => [String(e.id), e.equipo]));
  const salida = {};
  for (const [equipoId, ids] of Object.entries(plantillas)) {
    const nombre = nombrePresidente.get(equipoId) || equipoId;
    salida[nombre] = ids
      .filter((id) => catalogoJugadores[id])
      .map((id) => {
        const j = catalogoJugadores[id];
        return {
          nombre: j.name,
          posicion: nombrePosicion(j.position),
          foto: urlFoto(id),
          equipoReal: j.equipo,
          jornadas: calendarioEquipos[j.equipoId] || []
        };
      });
  }
  return salida;
}

/**
 * ====== PIEZA BASE DEL ANÁLISIS DE JUGADORES ======
 *
 * Analiza a TODOS los jugadores repartidos en las 12 plantillas y saca,
 * para cada uno, todo lo que hace falta para las secciones de análisis:
 * su rendimiento real, si es caro o barato para lo que da, su racha de
 * puntos, su racha de titularidades, y cómo se comporta según lo difícil
 * que sea el rival.
 *
 * Todo sale de datos reales de Biwenger. Lo único que ponemos nosotros
 * son los umbrales para clasificar (qué consideramos "rival fácil" o
 * "ser titular"), y van explicados donde se usan.
 */
async function analizarJugadores(plantillas, catalogoJugadores, scoreID, tabla) {
  if (!scoreID) return [];

  const presidentePorId = new Map(tabla.map((e) => [String(e.id), { nombre: e.equipo, escudo: e.escudo }]));

  const candidatos = [];
  for (const [equipoId, ids] of Object.entries(plantillas)) {
    for (const id of ids) {
      const info = catalogoJugadores[id];
      // Ojo: info trae equipoId, que es el equipo REAL del jugador (Betis,
      // Celta...). El del presidente que lo tiene en plantilla lo guardamos
      // aparte como presidenteId para que no se pisen entre ellos.
      if (info?.slug) candidatos.push({ id: String(id), ...info, presidenteId: String(equipoId) });
    }
  }

  const LIMITE = 8;
  let cursor = 0;
  const salida = new Array(candidatos.length);

  async function trabajador() {
    while (cursor < candidatos.length) {
      const i = cursor++;
      const c = candidatos[i];
      try {
        salida[i] = analizarUno(c, await fichaJugador(c.slug), scoreID, presidentePorId);
      } catch {
        salida[i] = null;
      }
    }
  }
  await Promise.all(new Array(LIMITE).fill(0).map(trabajador));

  return salida.filter(Boolean);
}

function analizarUno(c, ficha, scoreID, presidentePorId) {
  const reports = (ficha.reports || []).filter((r) => r.match?.status === 'finished');

  // Partidos con puntuación publicada, del más antiguo al más reciente
  const partidos = reports
    .map((r) => ({
      idJornada: r.match?.round?.id ?? null,
      jornada: r.match?.round?.name || '',
      puntos: r.points?.[scoreID] ?? null,
      minutos: r.rawStats?.minutesPlayed ?? 0
    }))
    .filter((p) => p.puntos != null);

  const jugados = partidos.filter((p) => p.minutos > 0);
  const puntosTotales = partidos.reduce((s, p) => s + p.puntos, 0);
  const media = jugados.length ? Number((puntosTotales / jugados.length).toFixed(1)) : 0;

  // Cuánto rinde por cada millón que cuesta. Es la misma idea que usamos
  // con los presidentes, pero jugador a jugador.
  const precio = c.price || 0;
  const cuantosMillones = precio / 1e6;
  const puntosPorMillon = cuantosMillones > 0 ? Number((puntosTotales / cuantosMillones).toFixed(2)) : 0;

  // Racha de puntos: los últimos partidos, el más reciente primero
  const racha = partidos.slice(-5).reverse().map((p) => p.puntos);

  // Racha de titularidades: cuántos partidos seguidos lleva jugando de
  // salida. Umbral de 60 minutos = lo damos por titular; menos de eso
  // suele ser haber entrado de cambio. Un 0 rompe la racha directamente.
  let rachaTitular = 0;
  for (let i = partidos.length - 1; i >= 0; i--) {
    if (partidos[i].minutos >= 60) rachaTitular++;
    else break;
  }
  const ultimoMinutos = partidos.length ? partidos[partidos.length - 1].minutos : null;

  // Rendimiento según el rival: NO se puede calcular. Biwenger solo publica
  // la dificultad de los partidos que están POR JUGAR; en cuanto un partido
  // termina, ese dato desaparece de su ficha. Comprobado equipo por equipo.
  // Se deja fuera antes que inventar una dificultad que no es la suya.

  const presi = presidentePorId.get(c.presidenteId);

  return {
    id: c.id,
    nombre: c.name,
    slug: c.slug,
    posicion: nombrePosicion(c.position),
    posicionCodigo: c.position,
    foto: urlFoto(c.id),
    equipoReal: c.equipo,
    equipoIdReal: String(c.equipoId ?? ''),
    presidente: presi?.nombre || '',
    escudoPresidente: presi?.escudo || '',
    precio,
    precioTexto: millones(precio),
    puntosTotales,
    partidosJugados: jugados.length,
    media,
    puntosPorMillon,
    racha,
    rachaTitular,
    ultimoMinutos
  };
}

/**
 * Para cada uno de los 12 equipos, pide la lista de IDs de jugadores
 * que tiene en plantilla ahora mismo.
 */
async function traerPlantillas(tabla) {
  const plantillas = {};
  for (const equipo of tabla) {
    try {
      const datos = await pedir(`${API}/user/${equipo.id}?fields=*,players`);
      plantillas[equipo.id] = (datos.players || []).map((p) => String(p.id));
    } catch (e) {
      console.warn(`Aviso: no se pudo leer la plantilla de ${equipo.equipo}.`, e.message);
      plantillas[equipo.id] = [];
    }
  }
  return plantillas;
}

/**
 * ====== SECCIONES DE ANÁLISIS ======
 * Todas parten de lo que ya calculó analizarJugadores(), así que aquí
 * no se pide nada nuevo a Biwenger: solo se ordena y se elige.
 */

// Solo tenemos en cuenta a quien haya jugado un mínimo, para que un
// jugador con un único partido bueno no se cuele en todos los rankings.
const MINIMO_PARTIDOS = 2;

function calcularValorJusto(jugadores) {
  const conMinimo = jugadores.filter((j) => j.partidosJugados >= MINIMO_PARTIDOS && j.precio > 0);
  if (!conMinimo.length) return { chollos: [], caros: [] };

  const ordenados = conMinimo.slice().sort((a, b) => b.puntosPorMillon - a.puntosPorMillon);
  return {
    chollos: ordenados.slice(0, 8),
    caros: ordenados.slice(-8).reverse()
  };
}

function calcularEnRacha(jugadores) {
  // "En racha" = media alta en sus dos últimos partidos jugados
  const conRacha = jugadores
    .filter((j) => j.racha.length >= 2 && j.partidosJugados >= MINIMO_PARTIDOS)
    .map((j) => {
      const ultimos = j.racha.slice(0, 2);
      const mediaReciente = ultimos.reduce((s, v) => s + v, 0) / ultimos.length;
      return { ...j, mediaReciente: Number(mediaReciente.toFixed(1)) };
    });

  const calientes = conRacha.slice().sort((a, b) => b.mediaReciente - a.mediaReciente).slice(0, 8);
  const frios = conRacha.slice().sort((a, b) => a.mediaReciente - b.mediaReciente).slice(0, 8);
  return { calientes, frios };
}

/**
 * Jugadores del mercado libre de Biwenger que, por lo que están rindiendo,
 * cuestan menos de lo que deberían. Se compara su rendimiento contra la
 * media de puntos por millón de toda la liga.
 */
function calcularGangas(mercadoBiwenger, jugadores, catalogoJugadores) {
  if (!mercadoBiwenger.length || !jugadores.length) return [];

  const conMinimo = jugadores.filter((j) => j.partidosJugados >= MINIMO_PARTIDOS);
  if (!conMinimo.length) return [];
  const mediaLiga = conMinimo.reduce((s, j) => s + j.puntosPorMillon, 0) / conMinimo.length;

  // Del mercado libre solo sabemos nombre y precio, así que buscamos su
  // ficha en el catálogo para poder analizarlo igual que a los demás.
  const porNombre = new Map(jugadores.map((j) => [j.nombre, j]));

  return mercadoBiwenger
    .map((m) => {
      const analizado = porNombre.get(m.nombre);
      if (!analizado || analizado.partidosJugados < MINIMO_PARTIDOS) return null;
      const ventaja = Math.round(((analizado.puntosPorMillon - mediaLiga) / mediaLiga) * 100);
      if (ventaja < 20) return null;   // por debajo de un 20% mejor no es noticia
      return {
        nombre: analizado.nombre,
        foto: analizado.foto,
        posicion: analizado.posicion,
        equipoReal: analizado.equipoReal,
        precio: m.precio,
        puntosPorMillon: analizado.puntosPorMillon,
        media: analizado.media,
        ventaja
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.ventaja - a.ventaja)
    .slice(0, 6);
}

/**
 * Para cada presidente, qué jugadores suyos pintan mejor para la próxima
 * jornada: cruza cómo viene de forma con lo fácil o difícil que le toca.
 */
function calcularRecomendaciones(jugadores, calendarioEquipos, tabla) {
  const porPresidente = {};

  for (const j of jugadores) {
    if (!j.presidente) continue;
    const proximos = calendarioEquipos[String(j.equipoIdReal ?? '')] || [];
    const proxima = proximos[0] || null;

    // Nota de 0 a 10, mitad forma y mitad facilidad del rival.
    // La dificultad de Biwenger va de 0 (muy fácil) a 100 (muy difícil).
    const formaReciente = j.racha.length ? j.racha.slice(0, 2).reduce((s, v) => s + v, 0) / Math.min(2, j.racha.length) : 0;
    const notaForma = Math.max(0, Math.min(5, formaReciente / 2));
    const notaRival = proxima && proxima.dificultad != null
      ? Math.max(0, Math.min(5, (100 - proxima.dificultad) / 20))
      : 2.5;

    const nota = Number((notaForma + notaRival).toFixed(1));

    (porPresidente[j.presidente] = porPresidente[j.presidente] || []).push({
      nombre: j.nombre,
      foto: j.foto,
      posicion: j.posicion,
      equipoReal: j.equipoReal,
      racha: j.racha,
      rachaTitular: j.rachaTitular,
      nota,
      rival: proxima?.rival || '',
      esLocal: proxima?.esLocal ?? null,
      dificultad: proxima?.dificultad ?? null
    });
  }

  for (const nombre of Object.keys(porPresidente)) {
    porPresidente[nombre].sort((a, b) => b.nota - a.nota);
  }
  return porPresidente;
}

/**
 * Los jugadores de toda la liga que mejor pinta tienen para la próxima
 * jornada, sin importar de quién sean.
 */
function calcularPredictor(recomendaciones) {
  const todos = [];
  for (const [presidente, lista] of Object.entries(recomendaciones)) {
    for (const j of lista) todos.push({ ...j, presidente });
  }
  return todos
    .filter((j) => j.dificultad != null && j.rachaTitular > 0)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, 10);
}


async function traerUltimaJornadaJugador(slug, scoreID) {
  const datos = await fichaJugador(slug);
  const reports = datos.reports || [];
  const finalizados = reports.filter((r) => r.match?.status === 'finished');
  const ultimo = finalizados[finalizados.length - 1];
  if (!ultimo) return null;
  // La "racha": sus puntos en los últimos partidos, el más reciente primero (así lo da Biwenger)
  const racha = datos.scoreStats?.[scoreID]?.fitness?.filter((v) => v !== null) || [];
  return {
    jornada: ultimo.match.round?.name || '',
    puntos: ultimo.points?.[scoreID] ?? null,
    minutos: ultimo.rawStats?.minutesPlayed ?? 0,
    racha
  };
}

/**
 * Recorre las 12 plantillas, pregunta a cada jugador su puntuación de
 * la última jornada, y arma el mejor once posible (probando varias
 * formaciones) entre TODOS los jugadores de la liga, sin importar de
 * qué presidente sean.
 */
async function calcularOnceIdeal(plantillas, catalogoJugadores, scoreID, tabla) {
  if (!scoreID) return null;

  const presidentePorId = new Map(tabla.map((e) => [String(e.id), { nombre: e.equipo, escudo: e.escudo }]));

  // Lista única de jugadores repartidos en las 12 plantillas, con su slug
  const candidatos = [];
  for (const [equipoId, ids] of Object.entries(plantillas)) {
    for (const id of ids) {
      const info = catalogoJugadores[id];
      if (info?.slug) candidatos.push({ id, equipoId, ...info });
    }
  }

  // Concurrencia limitada para no lanzar 150+ peticiones a la vez
  const LIMITE = 8;
  let cursor = 0;
  const resultados = new Array(candidatos.length);
  async function trabajador() {
    while (cursor < candidatos.length) {
      const i = cursor++;
      const c = candidatos[i];
      try {
        resultados[i] = { ...c, ultima: await traerUltimaJornadaJugador(c.slug, scoreID) };
      } catch {
        resultados[i] = { ...c, ultima: null };
      }
    }
  }
  await Promise.all(new Array(LIMITE).fill(0).map(trabajador));

  const jugables = resultados.filter((j) => j.ultima && j.ultima.puntos != null && j.ultima.minutos > 0);
  if (!jugables.length) return null;

  // El farolillo rojo de la jornada: el que peor puntuó entre todos, habiendo jugado de verdad
  const peor = jugables.slice().sort((a, b) => a.ultima.puntos - b.ultima.puntos)[0];
  const paquete = {
    nombre: peor.name,
    puntos: peor.ultima.puntos,
    jornada: peor.ultima.jornada,
    foto: urlFoto(peor.id),
    presidente: presidentePorId.get(peor.equipoId)?.nombre || '',
    escudoPresidente: presidentePorId.get(peor.equipoId)?.escudo || ''
  };

  const porPosicion = { 1: [], 2: [], 3: [], 4: [] };
  jugables.forEach((j) => porPosicion[j.position]?.push(j));
  Object.values(porPosicion).forEach((arr) => arr.sort((a, b) => b.ultima.puntos - a.ultima.puntos));

  const FORMACIONES = [
    [1, 4, 4, 2], [1, 4, 3, 3], [1, 3, 4, 3],
    [1, 3, 5, 2], [1, 5, 3, 2], [1, 5, 4, 1], [1, 4, 5, 1]
  ];

  let mejor = null;
  for (const [pt, df, mc, dl] of FORMACIONES) {
    if (porPosicion[1].length < pt || porPosicion[2].length < df || porPosicion[3].length < mc || porPosicion[4].length < dl) continue;
    const once = [
      ...porPosicion[1].slice(0, pt),
      ...porPosicion[2].slice(0, df),
      ...porPosicion[3].slice(0, mc),
      ...porPosicion[4].slice(0, dl)
    ];
    const total = once.reduce((s, j) => s + j.ultima.puntos, 0);
    if (!mejor || total > mejor.total) mejor = { formacion: `${df}-${mc}-${dl}`, total, once };
  }
  if (!mejor) return null;

  const titulares = mejor.once.map((j) => ({
    nombre: j.name,
    posicion: nombrePosicion(j.position),
    puntos: j.ultima.puntos,
    racha: j.ultima.racha || [],
    equipoReal: j.equipo,
    foto: urlFoto(j.id),
    presidente: presidentePorId.get(j.equipoId)?.nombre || '',
    escudoPresidente: presidentePorId.get(j.equipoId)?.escudo || ''
  }));

  return {
    jornada: mejor.once[0]?.ultima.jornada || '',
    formacion: mejor.formacion,
    total: mejor.total,
    titulares,
    paquete
  };
}

function nombrePosicion(codigo) {
  return { 1: 'Portero', 2: 'Defensa', 3: 'Centrocampista', 4: 'Delantero' }[codigo] || '';
}

/**
 * Un resumen automático de cómo está el ambiente de la liga esta semana:
 * lo reñido que está el liderato, quién está en mejor racha, cómo de
 * movido está el mercado... Todo sacado de datos que ya calculamos en
 * otro sitio, aquí solo se elige qué contar primero.
 */
function calcularTermometro(tabla, rachas, movimientos, clausulas) {
  const titulares = [];

  // 1. Lo reñido que está el liderato
  if (tabla.length >= 2) {
    const gap = tabla[0].puntos - tabla[1].puntos;
    titulares.push({
      tipo: 'liderato',
      texto: gap <= 5
        ? `El liderato está que arde: solo ${gap} ${gap === 1 ? 'punto separa' : 'puntos separan'} a ${tabla[0].equipo} de ${tabla[1].equipo}.`
        : `${tabla[0].equipo} manda con comodidad: le saca ${gap} puntos a ${tabla[1].equipo}.`
    });
  }

  // 2. Lo apretada que está la zona baja
  if (tabla.length >= 2) {
    const ultimo = tabla[tabla.length - 1];
    const penultimo = tabla[tabla.length - 2];
    const gapBajo = penultimo.puntos - ultimo.puntos;
    if (gapBajo <= 8) {
      titulares.push({
        tipo: 'colista',
        texto: `Ojo abajo: ${ultimo.equipo} y ${penultimo.equipo} solo se llevan ${gapBajo} puntos.`
      });
    }
  }

  // 3. La racha más larga activa ahora mismo
  if (rachas.length) {
    const mejor = rachas[0];
    titulares.push({
      tipo: 'racha',
      texto: mejor.tipo === 'positiva'
        ? `${mejor.equipo} lleva ${mejor.jornadas} jornadas seguidas por encima de la media. Está que se sale.`
        : `${mejor.equipo} lleva ${mejor.jornadas} jornadas seguidas por debajo de la media. Necesita reaccionar.`
    });
  }

  // 4. Mayor remontada de la última jornada
  if (movimientos && movimientos.remontada) {
    titulares.push({
      tipo: 'remontada',
      texto: `${movimientos.remontada.equipo} dio el golpe en la Jornada ${movimientos.jornada}: ${movimientos.remontada.delta} puntos, muy por encima de la media (${movimientos.media}).`
    });
  }

  // 5. Pulso del mercado: cláusulas en los últimos 7 días
  const hace7dias = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recientes = clausulas.filter((c) => c.fecha && new Date(c.fecha).getTime() >= hace7dias);
  titulares.push({
    tipo: 'mercado',
    texto: recientes.length
      ? `Mercado movido: ${recientes.length} ${recientes.length === 1 ? 'cláusula pagada' : 'cláusulas pagadas'} en los últimos 7 días.`
      : 'Mercado parado: ninguna cláusula pagada en los últimos 7 días.'
  });

  return titulares;
}

/**
 * De los 11 presidentes rivales, quién está subiendo más de nivel.
 *
 * Se mira una ventana de las últimas jornadas CERRADAS (no una sola, que
 * daba una foto muy pobre y se quedaba en blanco mientras la jornada en
 * curso seguía abierta). Para cada rival se compara lo que ha sumado en
 * esa ventana contra la media de la liga en el mismo tramo, y cuántos
 * puestos ha escalado.
 */
function calcularMapaAmenazas(tabla, historico, ventana = 3) {
  // Una jornada solo cuenta si alguien sumó puntos en ella: mientras la
  // jornada en curso no cierra, Biwenger repite los totales anteriores.
  const cerradas = [];
  let firmaAnterior = null;
  for (const foto of historico) {
    const firma = foto.equipos.map((e) => e.puntos).join(',');
    if (firma !== firmaAnterior) {
      cerradas.push(foto);
      firmaAnterior = firma;
    }
  }
  if (cerradas.length < 2) return [];

  const ultima = cerradas[cerradas.length - 1];
  // Punto de partida de la ventana: hasta `ventana` jornadas atrás
  const inicio = cerradas[Math.max(0, cerradas.length - 1 - ventana)];
  const jornadasUsadas = ultima.jornada - inicio.jornada;

  const antes = new Map(inicio.equipos.map((e) => [e.equipo, e]));
  const ahora = new Map(ultima.equipos.map((e) => [e.equipo, e]));

  const sumados = ultima.equipos.map((e) => {
    const previo = antes.get(e.equipo);
    return previo ? e.puntos - previo.puntos : 0;
  });
  const media = sumados.reduce((s, v) => s + v, 0) / (sumados.length || 1);

  return tabla
    .filter((e) => !e.esTuyo)
    .map((e) => {
      const previo = antes.get(e.equipo);
      const actual = ahora.get(e.equipo);
      if (!previo || !actual) return null;

      const sumado = actual.puntos - previo.puntos;
      const sobreMedia = Math.round(sumado - media);
      const puestos = previo.posicion - actual.posicion;   // positivo = ha escalado

      return {
        equipo: e.equipo,
        escudo: e.escudo,
        sumado,
        sobreMedia,
        puestos,
        jornadas: jornadasUsadas,
        desdeJornada: inicio.jornada,
        hastaJornada: ultima.jornada,
        score: puestos * 3 + sobreMedia
      };
    })
    .filter((e) => e && e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Los tres premios que salen de las cláusulas pagadas y del gasto de cada
 * presidente. No hace falta pedir nada nuevo: todo esto ya lo tenemos
 * calculado en otro sitio, aquí solo se elige "el mejor/peor de todos".
 */
function calcularPremios(clausulas, presidentes, paquete) {
  const conValor = clausulas.filter((c) => c.valorBruto > 0 && c.pideBruto > 0);

  // Ganancia real: cuánto vale ahora el jugador menos lo que costó.
  // Positivo = está valiendo más que lo pagado (buena compra).
  const conGanancia = conValor.map((c) => ({
    ...c,
    ganancia: c.valorBruto - c.pideBruto,
    porcentaje: Math.round(((c.valorBruto - c.pideBruto) / c.pideBruto) * 100)
  }));

  const masRentable = conGanancia.slice().sort((a, b) => b.ganancia - a.ganancia)[0] || null;
  const mejorSubida = conGanancia.slice().sort((a, b) => b.porcentaje - a.porcentaje)[0] || null;
  const masRata = presidentes.slice().sort((a, b) => a.gastadoBruto - b.gastadoBruto)[0] || null;

  return {
    paquete: paquete || null,
    fichajeRentable: masRentable ? {
      nombre: masRentable.nombre, foto: masRentable.foto,
      comprador: masRentable.comprador, escudoComprador: masRentable.escudoComprador,
      pagado: masRentable.pide, valorAhora: millones(masRentable.valorBruto),
      ganancia: millones(masRentable.ganancia)
    } : null,
    mejorSubida: mejorSubida ? {
      nombre: mejorSubida.nombre, foto: mejorSubida.foto,
      comprador: mejorSubida.comprador, escudoComprador: mejorSubida.escudoComprador,
      pagado: mejorSubida.pide, porcentaje: mejorSubida.porcentaje
    } : null,
    masRata: masRata ? {
      nombre: masRata.equipo, escudo: masRata.escudo, gastado: masRata.gastado, gastadoBruto: masRata.gastadoBruto
    } : null
  };
}

/* ---------- Principal ---------- */

async function principal() {
  console.log('Conectando con Biwenger...');

  const catalogo = await traerCatalogoJugadores();
  const jugadores = catalogo.jugadores;
  const equiposReales = catalogo.equipos;
  console.log(`Catálogo cargado: ${Object.keys(jugadores).length} jugadores.`);

  const { nombreLiga, tabla, scoreID } = await traerClasificacion();
  console.log(`Clasificación: ${tabla.length} equipos.`);

  const mercadoBiwenger = await traerMercadoBiwenger(jugadores);
  console.log(`Mercado de Biwenger: ${mercadoBiwenger.length} jugadores libres.`);

  const mercadoPresidentes = await traerMercadoPresidentes(jugadores);
  console.log(`Entre presidentes: ${mercadoPresidentes.length} operaciones.`);

  const soloClausulas = mercadoPresidentes.filter((o) => o.tipo === 'clausula');
  const soloEnVenta = mercadoPresidentes.filter((o) => o.tipo === 'venta');
  const ranking = rankingClausuladores(soloClausulas);
  if (ranking.length) {
    console.log(`Quien más clausula: ${ranking[0].nombre} (${ranking[0].veces}).`);
  }

  await mkdir(resolve(RAIZ, 'data'), { recursive: true });

  // En qué jornada estamos, según Biwenger. Nos hace falta el ID para poder
  // reconstruir la clasificación de todas las jornadas anteriores.
  let idJornadaActual = null;
  let jornadasJugadas = 1;
  try {
    const actual = await pedir(`${API}/rounds/la-liga`);
    idJornadaActual = actual?.id || null;
    // El nombre viene como "Jornada 5" (a veces con "(aplazada)" detrás)
    const num = String(actual?.name || '').match(/\d+/);
    if (num) jornadasJugadas = Number(num[0]);
    console.log(`Jornada actual: ${jornadasJugadas} (id ${idJornadaActual}).`);
  } catch (e) {
    console.warn('Aviso: no se pudo leer la jornada actual.', e.message);
  }

  // Puntos que ya lleva cada presidente en la jornada que se está jugando.
  // La clasificación oficial no los incluye hasta que la jornada se cierra.
  const puntosJornada = await traerPuntosJornada(idJornadaActual, tabla, jugadores, scoreID);
  if (puntosJornada) {
    for (const equipo of tabla) {
      const vivo = puntosJornada.get(String(equipo.id));
      if (!vivo) continue;
      equipo.puntosJornada = vivo.puntos;
      equipo.jugadosJornada = vivo.jugados;
      equipo.alineadosJornada = vivo.once;
      equipo.puntosProvisional = (equipo.puntos || 0) + vivo.puntos;
    }
  }

  const historico = await guardarHistorico(tabla, idJornadaActual, jornadasJugadas);
  const tendencias = calcularTendencias(historico);
  const escudoPorEquipo = new Map(tabla.map((e) => [e.equipo, e.escudo]));
  const { rachas, movimientos } = calcularRachasYMovimientos(historico, escudoPorEquipo);
  console.log(`Rachas activas: ${rachas.length}.`);

  const presidentes = fichasPresidentes(tabla, soloClausulas, soloEnVenta, jornadasJugadas)
    .map((p) => ({ ...p, tendencia: tendencias[p.equipo] || null }));
  console.log(`Fichas de presidentes: ${presidentes.length} (jornada ${jornadasJugadas}).`);

  const jornada = await traerPartidos(equiposReales);

  console.log('Calculando el Once Ideal (esto tarda un poco más, pregunta jugador a jugador)...');
  const plantillas = await traerPlantillas(tabla);
  const onceIdeal = await calcularOnceIdeal(plantillas, jugadores, scoreID, tabla);
  console.log(onceIdeal ? `Once Ideal: ${onceIdeal.jornada}, ${onceIdeal.total} puntos.` : 'Once Ideal: sin datos todavía.');

  const premios = calcularPremios(soloClausulas, presidentes, onceIdeal?.paquete);
  console.log('Premios de la semana calculados.');

  const termometro = calcularTermometro(tabla, rachas, movimientos, soloClausulas);
  const amenazas = calcularMapaAmenazas(tabla, historico);
  console.log(`Termómetro: ${termometro.length} titulares. Amenazas: ${amenazas.length}.`);

  console.log('Consultando el calendario de dificultad de los 20 equipos reales...');
  const calendarioEquipos = await traerCalendarioEquipos(catalogo.detalleEquipos);
  const calendario = calcularCalendarioPresidentes(plantillas, jugadores, calendarioEquipos, tabla);
  console.log('Calendario de dificultad calculado.');

  console.log('Analizando a todos los jugadores de las 12 plantillas...');
  const jugadoresAnalizados = await analizarJugadores(plantillas, jugadores, scoreID, tabla);
  console.log(`Jugadores analizados: ${jugadoresAnalizados.length}.`);

  const valorJusto = calcularValorJusto(jugadoresAnalizados);
  const enRacha = calcularEnRacha(jugadoresAnalizados);
  const gangas = calcularGangas(mercadoBiwenger, jugadoresAnalizados, jugadores);
  const recomendaciones = calcularRecomendaciones(jugadoresAnalizados, calendarioEquipos, tabla);
  const predictor = calcularPredictor(recomendaciones);
  console.log(`Chollos: ${valorJusto.chollos.length} · Gangas del mercado: ${gangas.length} · Predictor: ${predictor.length}.`);

  const salida = {
    actualizado: new Date().toISOString(),
    nombreLiga,
    jornadasJugadas,
    jornadaEnJuego: Boolean(puntosJornada),
    partidos: jornada.partidos,
    nombreJornada: jornada.jornada,
    clasificacion: tabla,
    mercadoBiwenger,
    mercadoPresidentes,
    rankingClausulas: ranking,
    presidentes,
    rachas,
    movimientos,
    onceIdeal,
    premios,
    calendario,
    termometro,
    amenazas,
    jugadores: jugadoresAnalizados,
    valorJusto,
    enRacha,
    gangas,
    recomendaciones,
    predictor
  };

  await mkdir(resolve(RAIZ, 'data'), { recursive: true });
  await writeFile(resolve(RAIZ, 'data', 'liga.json'), JSON.stringify(salida, null, 2), 'utf8');
  console.log('\nListo. Datos guardados en data/liga.json');
}

principal().catch((err) => {
  console.error('\nAlgo ha fallado:\n');
  console.error(err.message);
  console.error('\nSi el error es 401 o 403, el token ha caducado: vuelve a copiarlo desde el navegador.');
  process.exit(1);
});
