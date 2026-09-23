// Prueba del generador de preguntas contra los datos reales del repo.
// Se lanza con: npm run probar-duelos
import { readFileSync } from 'node:fs';

import { generarPreguntas, CATEGORIAS } from '../assets/preguntas-duelo.js';

const liga = JSON.parse(readFileSync(new URL('../data/liga.json', import.meta.url), 'utf8'));
const historico = JSON.parse(readFileSync(new URL('../data/historico.json', import.meta.url), 'utf8'));

let fallos = 0;
const mal = (msg) => { fallos++; console.log('  FALLO: ' + msg); };

// azar reproducible, para que un fallo se pueda repetir
function azarSemilla(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const millones = (b) => (Math.round(b / 100000) / 10).toFixed(1).replace('.', ',') + ' M';

// --- comprobadores por categoría: ¿la correcta es correcta de verdad? -------
const comprueban = {
  plantilla(p, r) {
    const nombre = /^¿De quién es (.+)\?$/.exec(p.enunciado)?.[1];
    const js = liga.jugadores.filter((j) => j.nombre === nombre);
    if (!js.length) return mal('jugador inexistente: ' + nombre);
    if (!js.some((j) => j.presidente === r)) mal(`${nombre} no es de ${r}`);
  },
  clausula_cara(p, r) {
    const m = /^¿Quién pagó los (.+) por (.+)\?$/.exec(p.enunciado);
    if (!m) return mal('enunciado raro: ' + p.enunciado);
    const cs = liga.mercadoPresidentes.filter((c) => c.tipo === 'clausula' && c.nombre === m[2]);
    if (!cs.some((c) => c.comprador === r && (c.pide === m[1] || millones(c.pideBruto) === m[1])))
      mal(`no consta que ${r} pagara ${m[1]} por ${m[2]}`);
  },
  puntos(p, r) {
    const equipo = /^¿Cuántos puntos lleva (.+)\?$/.exec(p.enunciado)?.[1];
    const e = liga.clasificacion.find((x) => x.equipo === equipo);
    if (!e) return mal('equipo inexistente: ' + equipo);
    if (String(e.puntos) !== r) mal(`${equipo} lleva ${e.puntos}, no ${r}`);
  },
  historico(p, r) {
    const n = Number(/^¿Quién iba líder en la jornada (\d+)\?$/.exec(p.enunciado)?.[1]);
    const j = historico.find((x) => x.jornada === n);
    if (!j) return mal('jornada inexistente: ' + n);
    const lider = j.equipos.find((e) => e.posicion === 1) || j.equipos[0];
    if (lider.equipo !== r) mal(`en la j${n} iba líder ${lider.equipo}, no ${r}`);
  },
  paquete(p, r) {
    if (liga.premios.paquete.nombre !== r) mal(`el paquete es ${liga.premios.paquete.nombre}, no ${r}`);
  },
  valor(p, r) {
    const valores = p.opciones.map((o) => {
      const x = liga.presidentes.find((q) => q.equipo === o);
      if (!x) mal('equipo inexistente en opciones: ' + o);
      return x ? x.valorBruto : -1;
    });
    const max = Math.max(...valores);
    if (valores[p.correcta] !== max) mal(`${r} no es la plantilla más cara de las cuatro`);
    if (valores.filter((v) => v === max).length > 1) mal('empate a valor entre las opciones');
  },
  clausulador(p, r) {
    const top = liga.rankingClausulas.slice().sort((a, b) => b.veces - a.veces)[0];
    if (top.nombre !== r) mal(`el que más clausula es ${top.nombre}, no ${r}`);
  },
  precio(p, r) {
    const nombre = /^¿Cuánto vale (.+) en el mercado\?$/.exec(p.enunciado)?.[1];
    const js = liga.jugadores.filter((j) => j.nombre === nombre);
    if (!js.length) return mal('jugador inexistente: ' + nombre);
    if (!js.some((j) => (j.precioTexto || millones(j.precio)) === r)) mal(`${nombre} no vale ${r}`);
  },
};

// --- 1. invariantes sobre 3000 duelos --------------------------------------
console.log('\n1. 3000 duelos con los datos reales');
const vistas = {};
for (let i = 0; i < 3000; i++) {
  const ps = generarPreguntas(liga, historico, 8, { azar: azarSemilla(i) });

  if (ps.length !== 8) { mal(`semilla ${i}: ${ps.length} preguntas, no 8`); break; }

  const cats = ps.map((p) => p.categoria);
  if (new Set(cats).size !== 8) { mal(`semilla ${i}: categorías repetidas`); break; }
  if (ps.map((p) => p.orden).join() !== '1,2,3,4,5,6,7,8') { mal(`semilla ${i}: orden mal`); break; }

  for (const p of ps) {
    vistas[p.categoria] = (vistas[p.categoria] || 0) + 1;
    if (p.opciones.length !== 4) { mal(`semilla ${i} ${p.categoria}: ${p.opciones.length} opciones`); break; }
    if (new Set(p.opciones.map((o) => o.toLowerCase())).size !== 4) {
      mal(`semilla ${i} ${p.categoria}: opciones repetidas -> ${JSON.stringify(p.opciones)}`); break;
    }
    if (p.opciones.some((o) => typeof o !== 'string' || !o.trim())) { mal(`semilla ${i} ${p.categoria}: opción vacía`); break; }
    if (!(p.correcta >= 0 && p.correcta < 4)) { mal(`semilla ${i} ${p.categoria}: correcta=${p.correcta}`); break; }
    if (!p.enunciado || !p.enunciado.trim()) { mal(`semilla ${i} ${p.categoria}: enunciado vacío`); break; }

    comprueban[p.categoria](p, p.opciones[p.correcta]);
  }

  // ningún jugador preguntado dos veces en el mismo duelo
  const sujetos = ps.map((p) => {
    const e = p.enunciado;
    return /^¿De quién es (.+)\?$/.exec(e)?.[1]
      || /^¿Cuánto vale (.+) en el mercado\?$/.exec(e)?.[1]
      || /^¿Quién pagó los .+ por (.+)\?$/.exec(e)?.[1]
      || (p.categoria === 'paquete' ? p.opciones[p.correcta] : null);
  }).filter(Boolean);
  if (new Set(sujetos).size !== sujetos.length) {
    mal(`semilla ${i}: jugador repetido en el mismo duelo -> ${sujetos.join(', ')}`);
    break;
  }
  if (fallos) break;
}
console.log('   preguntas construidas por categoría:', JSON.stringify(vistas));

// --- 1b. que no se pueda acertar por la posición ----------------------------
// En precio y puntos las opciones son números: si la correcta cayera siempre
// en el mismo puesto al ordenarlas, se acertaría sin saber nada.
console.log('\n1b. Posición de la correcta al ordenar de menor a mayor');
const numero = (t) => Number(String(t).replace(' M', '').replace(',', '.'));
for (const cat of ['precio', 'puntos']) {
  const puestos = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (let i = 0; i < 3000; i++) {
    const p = generarPreguntas(liga, historico, 8, { azar: azarSemilla(i) }).find((x) => x.categoria === cat);
    if (!p) continue;
    const ordenadas = p.opciones.slice().sort((a, b) => numero(a) - numero(b));
    puestos[ordenadas.indexOf(p.opciones[p.correcta]) + 1]++;
  }
  const reparto = Object.values(puestos);
  const total = reparto.reduce((a, b) => a + b, 0);
  const flojo = reparto.findIndex((v) => v < total * 0.15);   // lo justo sería 25%
  console.log(`   ${cat.padEnd(8)} -> 1º:${puestos[1]}  2º:${puestos[2]}  3º:${puestos[3]}  4º:${puestos[4]}`);
  if (flojo >= 0) {
    mal(`${cat}: la correcta cae en ${flojo + 1}º puesto solo el ` +
        `${(100 * reparto[flojo] / total).toFixed(1)}% de las veces; se puede acertar a ciegas`);
  }
}

// --- 2. degradación: datos rotos, a ver si se cae ---------------------------
console.log('\n2. Datos rotos o incompletos');
const podados = (quitar) => {
  const copia = JSON.parse(JSON.stringify(liga));
  for (const k of quitar) delete copia[k];
  return copia;
};
const casos = [
  ['liga vacía',                  {}, []],
  ['liga null',                   null, null],
  ['historico vacío',             liga, []],
  ['historico null',              liga, null],
  ['historico basura',            liga, [null, {}, { jornada: 3 }, { jornada: 4, equipos: [] }]],
  ['sin jugadores',               podados(['jugadores']), historico],
  ['sin premios',                 podados(['premios']), historico],
  ['sin mercadoPresidentes',      podados(['mercadoPresidentes']), historico],
  ['sin rankingClausulas',        podados(['rankingClausulas']), historico],
  ['sin clasificacion',           podados(['clasificacion']), historico],
  ['sin presidentes',             podados(['presidentes']), historico],
  ['arrays con nulls dentro',     { ...liga, jugadores: [null, {}, ...liga.jugadores], clasificacion: [null, ...liga.clasificacion] }, historico],
  ['todo a array vacío',          { clasificacion: [], presidentes: [], jugadores: [], mercadoPresidentes: [], rankingClausulas: [], premios: {} }, []],
];
for (const [nombre, l, h] of casos) {
  let salida;
  try {
    salida = generarPreguntas(l, h, 8, { azar: azarSemilla(7) });
  } catch (e) {
    mal(`"${nombre}" ha lanzado: ${e.message}`);
    continue;
  }
  for (const p of salida) {
    if (p.opciones.length !== 4 || new Set(p.opciones).size !== 4) mal(`"${nombre}": opciones mal`);
    if (!(p.correcta >= 0 && p.correcta < 4)) mal(`"${nombre}": correcta mal`);
  }
  console.log(`   ${nombre.padEnd(26)} -> ${salida.length} preguntas [${salida.map((p) => p.categoria).join(', ')}]`);
}

// --- 3. n distinto de 8 -----------------------------------------------------
console.log('\n3. Otros valores de n');
for (const n of [0, 1, 3, 8, 12]) {
  const ps = generarPreguntas(liga, historico, n, { azar: azarSemilla(3) });
  const esperado = Math.min(n, CATEGORIAS.length);
  if (ps.length !== esperado) mal(`n=${n}: ${ps.length} preguntas, esperaba ${esperado}`);
  console.log(`   n=${String(n).padEnd(2)} -> ${ps.length}`);
}

// --- 4. un duelo de muestra para leerlo con ojos humanos --------------------
console.log('\n4. Un duelo de ejemplo\n');
for (const p of generarPreguntas(liga, historico, 8, { azar: azarSemilla(42) })) {
  console.log(`   ${p.orden}. [${p.categoria}] ${p.enunciado}`);
  p.opciones.forEach((o, i) => console.log(`      ${i === p.correcta ? '>' : ' '} ${o}`));
}

console.log('\n' + (fallos ? `${fallos} FALLOS` : 'Todo correcto.'));
process.exit(fallos ? 1 : 0);
