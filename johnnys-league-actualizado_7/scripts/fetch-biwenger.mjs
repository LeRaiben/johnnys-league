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

/* ---------- Histórico ---------- */

/**
 * Guarda una foto de la clasificación cada día en data/historico.json.
 * Con el tiempo esto permite dibujar la evolución de cada presidente.
 */
async function guardarHistorico(tabla) {
  const ruta = resolve(RAIZ, 'data', 'historico.json');
  const hoy = new Date().toISOString().slice(0, 10);

  let historico = [];
  try {
    historico = JSON.parse(await readFile(ruta, 'utf8'));
    if (!Array.isArray(historico)) historico = [];
  } catch {
    // Todavía no existe, empezamos de cero
  }

  const foto = {
    fecha: hoy,
    equipos: tabla.map((e) => ({
      equipo: e.equipo,
      posicion: e.posicion,
      puntos: e.puntos,
      valor: e.valorBruto
    }))
  };

  // Una entrada por día: si ya hay una de hoy, la sustituimos
  const sinHoy = historico.filter((f) => f.fecha !== hoy);
  const actualizado = [...sinHoy, foto].slice(-180); // medio año de margen

  await writeFile(ruta, JSON.stringify(actualizado, null, 2), 'utf8');
  console.log(`Histórico: ${actualizado.length} días guardados.`);

  return actualizado;
}

/**
 * Compara la foto de hoy con la de hace unos días para ver quién sube y quién baja.
 */
function calcularTendencias(historico, diasAtras = 7) {
  if (historico.length < 2) return {};

  const hoy = historico[historico.length - 1];
  const objetivo = new Date(hoy.fecha);
  objetivo.setDate(objetivo.getDate() - diasAtras);
  const limite = objetivo.toISOString().slice(0, 10);

  const anterior = historico.filter((f) => f.fecha <= limite).pop() || historico[0];
  if (anterior.fecha === hoy.fecha) return {};

  const antes = new Map(anterior.equipos.map((e) => [e.equipo, e]));
  const salida = {};

  for (const e of hoy.equipos) {
    const previo = antes.get(e.equipo);
    if (!previo) continue;
    salida[e.equipo] = {
      puestos: previo.posicion - e.posicion,   // positivo = ha subido
      puntos: e.puntos - previo.puntos,
      desde: anterior.fecha
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
 * Como el histórico se guarda una vez al día, primero nos quedamos solo con las fotos
 * en las que los puntos totales cambian: eso marca el cierre de una jornada real.
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
    tramos.push({ fecha: distintas[i].fecha, media, deltas });
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
    fecha: ultimo.fecha,
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
        equipo: equipos[j.teamID]?.name || ''
      };
    }
    // Nombres de los equipos reales, para los partidos
    const nombresEquipos = {};
    for (const [id, e] of Object.entries(equipos)) nombresEquipos[id] = e.name;
    return { jugadores: salida, equipos: nombresEquipos };
  } catch (e) {
    console.warn('Aviso: no se pudo cargar el catálogo de jugadores.', e.message);
    return { jugadores: {}, equipos: {} };
  }
}

/**
 * Para cada uno de los 12 equipos, pide la lista de IDs de jugadores
 * que tiene en plantilla ahora mismo. Necesario para saber a quién
 * preguntarle su puntuación de cara al Once Ideal.
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
 * Pide la ficha pública de un jugador (sin necesitar login) y se queda
 * con su última jornada ya disputada: puntos (según el sistema de
 * puntuación de la liga) y si llegó a jugar minutos de verdad.
 */
async function traerUltimaJornadaJugador(slug, scoreID) {
  const campos = encodeURIComponent('reports(points,match(round,status),rawStats),scoreStats');
  const datos = await pedir(`${CDN}/players/la-liga/${slug}?lang=es&fields=${campos}`, false);
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
  const historico = await guardarHistorico(tabla);
  const tendencias = calcularTendencias(historico);
  const escudoPorEquipo = new Map(tabla.map((e) => [e.equipo, e.escudo]));
  const { rachas, movimientos } = calcularRachasYMovimientos(historico, escudoPorEquipo);
  console.log(`Rachas activas: ${rachas.length}.`);

  // Leemos la jornada del contenido editorial para calcular medias por jornada
  let jornadasJugadas = 1;
  try {
    const contenido = JSON.parse(await readFile(resolve(RAIZ, 'data', 'contenido.json'), 'utf8'));
    jornadasJugadas = Number(contenido.jornada) || 1;
  } catch {
    // Si no se puede leer, seguimos con 1
  }

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

  const salida = {
    actualizado: new Date().toISOString(),
    nombreLiga,
    jornadasJugadas,
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
    premios
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
