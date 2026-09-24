// Ejecuta el script de duelos.html tal cual, contra un DOM y un Supabase de
// mentira, para probar el bucle de la partida sin navegador ni base de datos.
// Se lanza con: npm run probar-partida
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../duelos.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop();

let fallos = 0;
const mal = (m) => { fallos++; console.log('  FALLO: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

// --- datos de mentira ------------------------------------------------------
const YO = 11412340, OTRO = 10272194;

const PREGUNTAS = Array.from({ length: 8 }, (_, i) => ({
  orden: i + 1,
  categoria: 'prueba',
  enunciado: 'Pregunta ' + (i + 1) + '?',
  opciones: ['A', 'B', 'C', 'D'],
}));
const CORRECTAS = [2, 0, 3, 1, 2, 1, 0, 3];   // solo las sabe el "servidor"

const LIGA = {
  clasificacion: [
    { id: YO, equipo: 'Cañoneros CF', escudo: 'a.png' },
    { id: OTRO, equipo: 'CD Tiro Buchón', escudo: 'b.png' },
    { id: 3, equipo: 'Seif fc', escudo: 'c.png' },
  ],
};

// Mismo cálculo que duelo_responder, para que el falso servidor puntúe igual.
const puntosServidor = (acierto, ms) =>
  acierto ? 100 + Math.max(Math.round(100 * (10000 - Math.min(Math.max(ms, 0), 10000)) / 10000), 0) : 0;

const llamadas = [];          // todo lo que la página le pide al servidor
let guardadas = {};           // respuestas ya guardadas, por orden
let duelosDe = [];

function rpc(nombre, args) {
  llamadas.push({ nombre, args });
  if (nombre === 'duelos_de') return Promise.resolve({ data: duelosDe, error: null });
  if (nombre === 'duelo_preguntas_para_jugar') {
    return Promise.resolve({ data: PREGUNTAS.map((p) => ({ ...p })), error: null });
  }
  if (nombre === 'duelo_mis_respuestas') {
    return Promise.resolve({ data: Object.values(guardadas), error: null });
  }
  if (nombre === 'duelo_responder') {
    const { p_orden, p_opcion, p_ms } = args;
    if (guardadas[p_orden]) {
      return Promise.resolve({ data: null, error: { message: 'Esa pregunta ya la has contestado' } });
    }
    const correcta = CORRECTAS[p_orden - 1];
    const acierto = p_opcion !== null && p_opcion === correcta;
    const puntos = puntosServidor(acierto, p_ms);
    guardadas[p_orden] = { orden: p_orden, opcion: p_opcion, acierto, puntos };
    return Promise.resolve({ data: { acierto, correcta, puntos }, error: null });
  }
  if (nombre === 'duelo_cerrar') return Promise.resolve({ data: { cerrado: false, faltan_rival: 8 }, error: null });
  return Promise.resolve({ data: [], error: null });
}

const tabla = () => {
  const q = {
    select: () => q, eq: () => q, or: () => q, order: () => q, limit: () => q,
    then: (fn) => Promise.resolve({ data: [], error: null }).then(fn),
  };
  return q;
};

globalThis.window = {
  supabase: {
    createClient: () => ({
      rpc,
      from: tabla,
      functions: { invoke: (n, o) => { llamadas.push({ nombre: 'fn:' + n, args: o.body }); return Promise.resolve({ data: { duelo_id: 7 }, error: null }); } },
    }),
  },
};
globalThis.localStorage = {
  _d: { duelos_presidente: JSON.stringify({ id: YO, equipo: 'Cañoneros CF' }) },
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = v; },
  removeItem(k) { delete this._d[k]; },
};
globalThis.fetch = () => Promise.resolve({ json: () => Promise.resolve(LIGA) });

// --- DOM mínimo ------------------------------------------------------------
function nuevoNodo(id) {
  const clases = new Set();
  const n = {
    id, hidden: false, textContent: '', type: '', disabled: false, style: {}, _hijos: [], _ev: {},
    classList: {
      add: (...c) => c.forEach((x) => clases.add(x)),
      remove: (...c) => c.forEach((x) => clases.delete(x)),
      contains: (c) => clases.has(c),
    },
    get className() { return [...clases].join(' '); },
    set className(v) { clases.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => clases.add(c)); },
    set innerHTML(v) { n._html = v; if (!v) n._hijos = []; },
    get innerHTML() { return n._html || ''; },
    appendChild: (h) => { n._hijos.push(h); return h; },
    remove: () => {},
    addEventListener: (ev, fn) => { n._ev[ev] = fn; },
    querySelectorAll: () => n._hijos,
    querySelector: () => null,
    scrollIntoView: () => {},
  };
  return n;
}

const nodos = {};
const dame = (id) => (nodos[id] ||= nuevoNodo(id));
['partida','cuenta','total','tiempo','tiempoBarra','categoria','enunciado','opciones','cierre',
 'cierreTotal','cierreEstado','repaso','error','vistaQuien','vistaLobby','vistaResultado',
 'rejillaQuien','rejillaRetar','listaTeToca','listaEsperando','listaTerminados','bloqueTeToca',
 'bloqueEsperando','bloqueTerminados','tablaRanking','miNombre','btnVolver','btnCambiarQuien'].forEach(dame);

let reloj = 0;
const pendientes = [];

globalThis.document = {
  getElementById: dame,
  createElement: () => nuevoNodo('nuevo'),
  addEventListener: () => {},
  body: { style: {}, appendChild: () => {} },
  querySelector: () => null,
};
globalThis.performance = { now: () => reloj };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.setTimeout = (fn, ms) => { const t = { fn, en: reloj + ms, vivo: true }; pendientes.push(t); return t; };
globalThis.clearTimeout = (t) => { if (t) t.vivo = false; };

// deja correr las promesas pendientes
const respirar = () => new Promise((r) => process.nextTick(r));

async function avanzar(ms) {
  const hasta = reloj + ms;
  for (;;) {
    await respirar();
    const t = pendientes.filter((x) => x.vivo && x.en <= hasta).sort((a, b) => a.en - b.en)[0];
    if (!t) break;
    t.vivo = false;
    reloj = t.en;
    t.fn();
  }
  reloj = hasta;
  await respirar();
}

new Function(script)();
await respirar(); await respirar(); await respirar();

// --- helpers ---------------------------------------------------------------
const botones = () => nodos.opciones._hijos;
const total = () => Number(nodos.total.textContent);
const pulsar = async (i) => { botones()[i]._ev.click(); await respirar(); await respirar(); };
const buena = (q) => CORRECTAS[q];

async function nuevaPartida() {
  guardadas = {};
  pendientes.forEach((x) => (x.vivo = false));
  reloj = 0;
  // el lobby ya ha arrancado: se entra por el botón de "Jugar" de un duelo
  duelosDe = [{ id: 7, estado: 'pendiente', retador_id: YO, rival_id: OTRO,
    retador_nombre: 'Cañoneros CF', rival_nombre: 'CD Tiro Buchón',
    respuestas_retador: 0, respuestas_rival: 8, puntos_retador: null, puntos_rival: null }];
  await volverAlLobby();
  await entrarAlDuelo();
}

// repinta el lobby con los duelosDe de ahora
async function volverAlLobby() {
  nodos.btnVolver._ev.click();
  for (let i = 0; i < 6; i++) await respirar();
}

async function entrarAlDuelo() {
  const fila = nodos.listaTeToca._hijos[0];
  if (!fila) throw new Error('el lobby no pinta el duelo en "Te toca jugar"');
  fila._hijos[2]._hijos[0]._ev.click();     // fila = [escudo, texto, acción]
  for (let i = 0; i < 6; i++) await respirar();
}

// --- 1. arranque: identidad guardada y lobby -------------------------------
console.log('\n1. Arranque con el presidente ya guardado');
if (nodos.vistaLobby.hidden) mal('no ha entrado al lobby');
else ok('entra directo al lobby, sin volver a preguntar quién eres');
if (nodos.miNombre.textContent !== 'Cañoneros CF') mal('nombre: ' + nodos.miNombre.textContent);
else ok('se reconoce como Cañoneros CF');
if (!llamadas.some((l) => l.nombre === 'duelos_de')) mal('no ha pedido los duelos');
else ok('pide sus duelos a duelos_de');

// --- 2. la rejilla de retar no se ofrece a uno mismo ------------------------
console.log('\n2. Rejilla de retar');
duelosDe = [];
await rpc('duelos_de', {});
nodos.btnVolver._ev.click();
await respirar(); await respirar();
const nombresRejilla = nodos.rejillaRetar._hijos.map((b) => b._hijos[1].textContent);
if (nombresRejilla.includes('Cañoneros CF')) mal('se ofrece retarse a uno mismo');
else ok('no aparece uno mismo (' + nombresRejilla.join(', ') + ')');

// --- 3. partida perfecta ---------------------------------------------------
console.log('\n3. Ocho aciertos en 0 ms');
await nuevaPartida();
if (nodos.partida.hidden) mal('la partida no se ha abierto');
for (let q = 0; q < 8; q++) {
  if (botones().length !== 4) { mal(`pregunta ${q + 1}: ${botones().length} botones`); break; }
  await pulsar(buena(q));
  await avanzar(600);
}
if (total() !== 1600) mal(`total ${total()}, esperaba 1600`);
else ok('1600 puntos, el máximo del plan');
if (nodos.cierre.hidden) mal('no ha mostrado el cierre');
else ok('llega al cierre');
if (nodos.repaso._hijos.length !== 8) mal(`repaso con ${nodos.repaso._hijos.length} filas`);
else ok('el repaso lista las ocho');
if (!llamadas.some((l) => l.nombre === 'duelo_cerrar')) mal('no ha intentado cerrar el duelo');
else ok('intenta cerrar el duelo al acabar');

// --- 4. los puntos los da el servidor, no la página ------------------------
console.log('\n4. Quién decide los puntos');
const respondidas = llamadas.filter((l) => l.nombre === 'duelo_responder');
if (respondidas.length !== 8) mal(`${respondidas.length} llamadas a duelo_responder`);
else ok('una llamada a duelo_responder por pregunta');
if (respondidas.some((l) => l.args.p_opcion === undefined)) mal('alguna llamada va sin opción');
else ok('cada una manda duelo, jugador, orden, opción y ms');

// --- 5. todo fallado -------------------------------------------------------
console.log('\n5. Ocho fallos');
await nuevaPartida();
for (let q = 0; q < 8; q++) { await pulsar((buena(q) + 1) % 4); await avanzar(1300); }
if (total() !== 0) mal(`total ${total()}, esperaba 0`);
else ok('0 puntos');

// --- 6. se agota el tiempo en todas ---------------------------------------
console.log('\n6. Sin tocar nada');
await nuevaPartida();
await avanzar(10000 * 8 + 1300 * 8 + 200);
if (total() !== 0) mal(`total ${total()}, esperaba 0`);
else ok('0 puntos y la partida avanza sola');
if (nodos.cierre.hidden) mal('no llega al cierre por timeout');
else ok('llega al cierre sola');

// --- 7. doble toque --------------------------------------------------------
console.log('\n7. Doble toque en la misma pregunta');
await nuevaPartida();
await pulsar(buena(0));
const tras = total();
const antesDeRepetir = llamadas.filter((l) => l.nombre === 'duelo_responder').length;
await pulsar(0); await pulsar(1); await pulsar(2);
if (total() !== tras) mal(`el doble toque ha sumado: ${tras} -> ${total()}`);
else ok('los toques de más no suman');
if (llamadas.filter((l) => l.nombre === 'duelo_responder').length !== antesDeRepetir) {
  mal('el doble toque ha llamado al servidor otra vez');
} else ok('tampoco llama al servidor de más');

// --- 8. retomar una partida a medias --------------------------------------
console.log('\n8. Retomar una partida dejada por la mitad');
await nuevaPartida();
await pulsar(buena(0)); await avanzar(600);
await pulsar(buena(1)); await avanzar(600);
const llevaba = total();
// vuelve a entrar al mismo duelo sin limpiar lo guardado
pendientes.forEach((x) => (x.vivo = false));
reloj = 0;
await entrarAlDuelo();
if (nodos.cuenta.textContent !== '3 / 8') mal('retoma por la ' + nodos.cuenta.textContent);
else ok('retoma por la 3 / 8');
if (total() !== llevaba) mal(`ha perdido los puntos: ${llevaba} -> ${total()}`);
else ok('conserva los ' + llevaba + ' puntos que ya llevaba');

// --- 9. temporizadores huérfanos ------------------------------------------
console.log('\n9. Entrar a otro duelo a media pregunta');
await nuevaPartida();
await pulsar(buena(0));            // deja viva la pausa entre preguntas
guardadas = {};
await entrarAlDuelo();
const q1 = nodos.enunciado.textContent;
await avanzar(2000);
if (nodos.enunciado.textContent !== q1) mal('un temporizador huérfano ha saltado de pregunta');
else ok('los temporizadores de la partida anterior no tocan la nueva');

// --- 10. la curva de puntos -----------------------------------------------
console.log('\n10. Los puntos bajan según se tarda');
const medidas = [];
for (const espera of [0, 2000, 5000, 9000]) {
  await nuevaPartida();
  await avanzar(espera);
  await pulsar(buena(0));
  medidas.push([espera, total()]);
  await avanzar(600);
}
console.log('   ' + medidas.map(([e, p]) => `${e / 1000}s -> ${p}`).join(', '));
const esperados = [200, 180, 150, 110];
medidas.forEach(([e, p], i) => { if (p !== esperados[i]) mal(`a los ${e} ms daba ${p}, esperaba ${esperados[i]}`); });
if (medidas.every(([, p], i) => p === esperados[i])) ok('coinciden con duelo_responder');

console.log('\n' + (fallos ? `${fallos} FALLOS` : 'Todo correcto.'));
process.exit(fallos ? 1 : 0);
