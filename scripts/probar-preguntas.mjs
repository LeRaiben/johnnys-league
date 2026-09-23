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

// ¿es la respuesta el primero de toda la liga en ese campo, sin empate?
function extremoGlobal(p, r, campo, mayor, que) {
  const orden = liga.presidentes.slice().sort((a, b) => (mayor ? b[campo] - a[campo] : a[campo] - b[campo]));
  if (orden[0][campo] === orden[1][campo]) return mal(`empate en ${campo}: la pregunta no tiene respuesta única`);
  if (orden[0].equipo !== r) mal(`${que} es ${orden[0].equipo}, no ${r}`);
}

// ¿es la respuesta el primero de las cuatro opciones, sin empate?
function extremoEntreOpciones(p, r, campo, mayor, que) {
  const valores = p.opciones.map((o) => {
    const x = liga.presidentes.find((q) => q.equipo === o);
    if (!x) mal('equipo inexistente en opciones: ' + o);
    return x ? x[campo] : (mayor ? -1 : Infinity);
  });
  const tope = mayor ? Math.max(...valores) : Math.min(...valores);
  if (valores.filter((v) => v === tope).length > 1) mal(`empate en ${campo} entre las opciones`);
  if (valores[p.correcta] !== tope) mal(`${r} no es ${que}`);
}

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
    const puesto = /^¿En qué puesto iba (.+) en la jornada (\d+)\?$/.exec(p.enunciado);
    if (puesto) {
      const j = historico.find((x) => x.jornada === Number(puesto[2]));
      if (!j) return mal('jornada inexistente: ' + puesto[2]);
      const e = j.equipos.find((x) => x.equipo === puesto[1]);
      if (!e) return mal(`${puesto[1]} no jugaba la j${puesto[2]}`);
      if (e.posicion + 'º' !== r) mal(`${puesto[1]} iba ${e.posicion}º en la j${puesto[2]}, no ${r}`);
      return;
    }

    const quien = /^¿Quién iba (líder|segundo|tercero|último) en la jornada (\d+)\?$/.exec(p.enunciado);
    if (!quien) return mal('enunciado de historico no reconocido: ' + p.enunciado);

    const j = historico.find((x) => x.jornada === Number(quien[2]));
    if (!j) return mal('jornada inexistente: ' + quien[2]);

    const esperado = quien[1] === 'último'
      ? Math.max(...j.equipos.map((e) => e.posicion))
      : { 'líder': 1, 'segundo': 2, 'tercero': 3 }[quien[1]];

    const e = j.equipos.find((x) => x.posicion === esperado);
    if (!e) return mal(`nadie en el puesto ${esperado} de la j${quien[2]}`);
    if (e.equipo !== r) mal(`en la j${quien[2]} iba ${quien[1]} ${e.equipo}, no ${r}`);
  },
  paquete(p, r) {
    if (liga.premios.paquete.nombre !== r) mal(`el paquete es ${liga.premios.paquete.nombre}, no ${r}`);
  },
  valor(p, r) {
    const cuanto = /^¿Cuánto vale la plantilla de (.+)\?$/.exec(p.enunciado);
    if (cuanto) {
      const x = liga.presidentes.find((q) => q.equipo === cuanto[1]);
      if (!x) return mal('equipo inexistente: ' + cuanto[1]);
      if ((x.valor || '') !== r) mal(`la plantilla de ${cuanto[1]} vale ${x.valor}, no ${r}`);
      return;
    }
    if (p.enunciado === '¿Quién tiene la plantilla más cara de la liga?') {
      return extremoGlobal(p, r, 'valorBruto', true, 'la plantilla más cara de la liga');
    }
    if (p.enunciado === '¿Cuál de estas cuatro plantillas vale más?') {
      return extremoEntreOpciones(p, r, 'valorBruto', true, 'la más cara de las cuatro');
    }
    if (p.enunciado === '¿Cuál de estas cuatro plantillas vale menos?') {
      return extremoEntreOpciones(p, r, 'valorBruto', false, 'la más barata de las cuatro');
    }
    mal('enunciado de valor no reconocido: ' + p.enunciado);
  },
  clausulador(p, r) {
    const cuantas = /^¿Cuántas cláusulas ha hecho (.+)\?$/.exec(p.enunciado);
    if (cuantas) {
      const x = liga.presidentes.find((q) => q.equipo === cuantas[1]);
      if (!x) return mal('equipo inexistente: ' + cuantas[1]);
      if (String(x.clausulasHechas) !== r) mal(`${cuantas[1]} ha hecho ${x.clausulasHechas}, no ${r}`);
      return;
    }
    if (p.enunciado === '¿Quién ha clausulado más veces esta temporada?') {
      return extremoGlobal(p, r, 'clausulasHechas', true, 'el que más clausula');
    }
    if (p.enunciado === '¿Cuál de estos cuatro ha clausulado más veces?') {
      return extremoEntreOpciones(p, r, 'clausulasHechas', true, 'el que más clausula de los cuatro');
    }
    if (p.enunciado === '¿A quién le han clausulado más jugadores?') {
      return extremoGlobal(p, r, 'clausulasSufridas', true, 'el que más las sufre');
    }
    mal('enunciado de clausulador no reconocido: ' + p.enunciado);
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

// --- 1c. variedad: ¿cuántas respuestas distintas da cada categoría? ---------
// Si una categoría contesta casi siempre lo mismo, se memoriza en dos duelos
// y deja de ser una pregunta.
console.log('\n1c. Respuestas distintas por categoría (3000 duelos)');
const respuestas = {};
const enunciados = {};
for (let i = 0; i < 3000; i++) {
  for (const p of generarPreguntas(liga, historico, 8, { azar: azarSemilla(i) })) {
    (respuestas[p.categoria] ||= new Map()).set(
      p.opciones[p.correcta],
      (respuestas[p.categoria].get(p.opciones[p.correcta]) || 0) + 1
    );
    (enunciados[p.categoria] ||= new Set()).add(p.enunciado.replace(/[^?]+(?=\?)/, (m) => m.slice(0, 28)));
  }
}
for (const cat of Object.keys(respuestas).sort()) {
  const mapa = respuestas[cat];
  const total = [...mapa.values()].reduce((a, b) => a + b, 0);
  const masComun = [...mapa.entries()].sort((a, b) => b[1] - a[1])[0];
  const cuota = (100 * masComun[1] / total).toFixed(0);
  console.log(`   ${cat.padEnd(15)} ${String(mapa.size).padStart(3)} respuestas distintas, ` +
              `${String(enunciados[cat].size).padStart(2)} enunciados, la más repetida ${cuota}% (${masComun[0]})`);
  if (cat !== 'paquete' && mapa.size < 4) {
    mal(`${cat}: solo ${mapa.size} respuestas distintas, se memoriza enseguida`);
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
