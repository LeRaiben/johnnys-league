// Ejecuta el script de duelos.html tal cual, contra un DOM de mentira, para
// probar el bucle de la partida sin navegador.
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../duelos.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).pop();

let fallos = 0;
const mal = (m) => { fallos++; console.log('  FALLO: ' + m); };
const ok = (m) => console.log('  ok: ' + m);

// --- DOM mínimo -----------------------------------------------------------
function nuevoNodo(id) {
  const clases = new Set();
  const nodo = {
    id, hidden: false, textContent: '', type: '', _hijos: [],
    style: {},
    classList: {
      add: (...c) => c.forEach((x) => clases.add(x)),
      remove: (...c) => c.forEach((x) => clases.delete(x)),
      contains: (c) => clases.has(c),
    },
    get className() { return [...clases].join(' '); },
    set className(v) { clases.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => clases.add(c)); },
    set innerHTML(v) { if (!v) nodo._hijos = []; },
    get innerHTML() { return ''; },
    appendChild: (h) => { nodo._hijos.push(h); return h; },
    remove: () => {},
    addEventListener: (ev, fn) => { (nodo._ev ||= {})[ev] = fn; },
    querySelectorAll: () => nodo._hijos,
    querySelector: () => null,
    scrollIntoView: () => {},
    click: () => nodo._ev && nodo._ev.click && nodo._ev.click(),
  };
  return nodo;
}

const nodos = {};
for (const id of ['partida','cuenta','total','tiempo','tiempoBarra','categoria','enunciado',
                  'opciones','cierre','cierreTotal','repaso','btnJugar','btnOtra']) {
  nodos[id] = nuevoNodo(id);
}

let reloj = 0;                       // tiempo simulado, en ms
const pendientes = [];               // setTimeout pendientes

global.document = {
  getElementById: (id) => nodos[id] || nuevoNodo(id),
  createElement: () => nuevoNodo('nuevo'),
  addEventListener: () => {},
  body: { style: {}, appendChild: () => {}, },
  querySelector: () => null,
};
global.performance = { now: () => reloj };
// navigator ya existe en Node 24 y es de solo lectura: vibrar() lo esquiva con try/catch
global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};
global.setTimeout = (fn, ms) => { const t = { fn, en: reloj + ms, vivo: true }; pendientes.push(t); return t; };
global.clearTimeout = (t) => { if (t) t.vivo = false; };

// avanza el reloj disparando los timeouts que toquen
function avanzar(ms) {
  const hasta = reloj + ms;
  for (;;) {
    const t = pendientes.filter((x) => x.vivo && x.en <= hasta).sort((a, b) => a.en - b.en)[0];
    if (!t) break;
    t.vivo = false;
    reloj = t.en;
    t.fn();
  }
  reloj = hasta;
}

new Function(script)();

// --- helpers de juego ------------------------------------------------------
const botones = () => nodos.opciones._hijos;
const pulsar = (i) => botones()[i]._ev.click();
const totalEnPantalla = () => Number(nodos.total.textContent);
const jugar = () => { pendientes.forEach(x => x.vivo = false); nodos.btnJugar._ev.click(); };

// --- 1. partida perfecta, instantánea --------------------------------------
console.log('\n1. Ocho aciertos en 0 ms');
jugar();
if (nodos.partida.hidden) mal('la partida no se ha abierto');
for (let q = 0; q < 8; q++) {
  if (botones().length !== 4) { mal(`pregunta ${q + 1}: ${botones().length} botones`); break; }
  const correcta = botones().findIndex((b, i) => b.textContent === correctaDe(q));
  pulsar(correcta);
  avanzar(600);
}
if (totalEnPantalla() !== 1600) mal(`total ${totalEnPantalla()}, esperaba 1600`);
else ok('1600 puntos, el máximo del plan');
if (!nodos.partida.hidden) mal('la partida no se ha cerrado al acabar');
if (nodos.cierre.hidden) mal('no se ha mostrado el cierre');
if (nodos.repaso._hijos.length !== 8) mal(`el repaso tiene ${nodos.repaso._hijos.length} filas`);
else ok('el repaso lista las ocho');

// --- 2. todo fallado -------------------------------------------------------
console.log('\n2. Ocho fallos');
jugar();
for (let q = 0; q < 8; q++) {
  const mala = botones().findIndex((b) => b.textContent !== correctaDe(q));
  pulsar(mala);
  avanzar(1300);
}
if (totalEnPantalla() !== 0) mal(`total ${totalEnPantalla()}, esperaba 0`);
else ok('0 puntos');

// --- 3. se acaba el tiempo en todas ---------------------------------------
console.log('\n3. Sin tocar nada, se agota el tiempo ocho veces');
jugar();
avanzar(10000 * 8 + 1300 * 8 + 100);
if (totalEnPantalla() !== 0) mal(`total ${totalEnPantalla()}, esperaba 0`);
else ok('0 puntos y la partida avanza sola sin tocar nada');
if (nodos.cierre.hidden) mal('no ha llegado al cierre por timeout');
else ok('llega al cierre sola');

// --- 4. no se puede contestar dos veces la misma ---------------------------
console.log('\n4. Doble toque en la misma pregunta');
jugar();
pulsar(botones().findIndex((b) => b.textContent === correctaDe(0)));
const trasPrimera = totalEnPantalla();
pulsar(0); pulsar(1); pulsar(2); pulsar(3);
if (totalEnPantalla() !== trasPrimera) mal(`el doble toque ha sumado: ${trasPrimera} -> ${totalEnPantalla()}`);
else ok('los toques de más no suman');

// --- 5. contestar tarde, justo pasado el límite ---------------------------
console.log('\n5. Contestar cuando ya se ha agotado el tiempo');
jugar();
avanzar(10000);                       // salta el timeout: cuenta como fallo
const trasTimeout = totalEnPantalla();
pulsar(botones().findIndex((b) => b.textContent === correctaDe(0)));
if (totalEnPantalla() !== trasTimeout) mal('ha dejado puntuar después del timeout');
else ok('después del timeout ya no puntúa');

// --- 6. puntos por rapidez -------------------------------------------------
console.log('\n6. Los puntos bajan según se tarda');
const medidas = [];
for (const espera of [0, 2000, 5000, 9000]) {
  jugar();
  avanzar(espera);
  pulsar(botones().findIndex((b) => b.textContent === correctaDe(0)));
  medidas.push([espera, totalEnPantalla()]);
  avanzar(600);
}
console.log('   ' + medidas.map(([e, p]) => `${e / 1000}s -> ${p}`).join(', '));
const esperados = [200, 180, 150, 110];
medidas.forEach(([e, p], i) => { if (p !== esperados[i]) mal(`a los ${e} ms daba ${p}, esperaba ${esperados[i]}`); });
if (medidas.every(([, p], i) => p === esperados[i])) ok('coinciden con duelo_responder');


// --- 7. reiniciar a media pregunta, con los temporizadores vivos -----------
// Sin limpiar nada: es lo que pasara en el paso 5 con la revancha.
console.log('\n7. Empezar otra partida a media pregunta');
jugar();
pulsar(botones().findIndex((b) => b.textContent === correctaDe(0)));   // deja viva la pausa
nodos.btnJugar._ev.click();                                            // reinicio en crudo
if (totalEnPantalla() !== 0) mal('la partida nueva no arranca a cero: ' + totalEnPantalla());
const pregunta1 = nodos.enunciado.textContent;
avanzar(2000);                                                         // aqui saltaria el huerfano
if (nodos.enunciado.textContent !== pregunta1) mal('un temporizador huerfano ha saltado de pregunta');
else ok('los temporizadores de la partida anterior no tocan la nueva');
if (nodos.cuenta.textContent !== '1 / 8') mal('la cuenta va por ' + nodos.cuenta.textContent);
else ok('sigue en la 1 / 8');

// la correcta de cada pregunta, sacada de los datos de prueba de la página
function correctaDe(q) {
  const datos = /var PREGUNTAS_DE_PRUEBA = (\[[\s\S]*?\n  \]);/.exec(html)[1];
  const lista = new Function('return ' + datos)();
  return lista[q].opciones[lista[q].correcta];
}

console.log('\n' + (fallos ? `${fallos} FALLOS` : 'Todo correcto.'));
process.exit(fallos ? 1 : 0);
