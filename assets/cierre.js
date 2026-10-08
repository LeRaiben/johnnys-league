/* Cierre temporal de la web #NOALAWEB — tapa toda la web con el comunicado oficial
   hasta que se escribe la contraseña. Tolerante a mayúsculas, tildes y espacios
   ("Sí a la web 123" vale igual que "sialaweb123").
   Para reabrir la web: quitar <script src="assets/cierre.js"></script> de cada página. */
(function () {
  var CLAVE = 'sialaweb123';
  var LS_KEY = 'jl-cierre';

  function normalizar(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  try { if (localStorage.getItem(LS_KEY) === 'ok') return; } catch (e) {}

  document.documentElement.classList.add('jl-cerrado');

  var estilos = document.createElement('style');
  estilos.textContent =
    'html.jl-cerrado body > *:not(#jlCierre) { display:none !important; }' +
    'html.jl-cerrado, html.jl-cerrado body { overflow:hidden !important; background:#010A20 !important; }' +
    '#jlCierre { position:fixed; inset:0; z-index:999999; overflow-y:auto; -webkit-overflow-scrolling:touch;' +
    ' background:radial-gradient(ellipse at top, #0A1E45 0%, #010A20 70%); padding:28px 16px 40px;' +
    ' display:flex; justify-content:center; align-items:flex-start; box-sizing:border-box; }' +
    '#jlCierre * { box-sizing:border-box; }' +
    '#jlCierre .cc { width:100%; max-width:640px; margin:auto; background:#F7F7F5; color:#021234;' +
    ' border-top:8px solid #C0182C; box-shadow:0 24px 70px rgba(0,0,0,0.6); padding:30px 28px 26px; }' +
    '#jlCierre .cc-esc { display:flex; align-items:center; gap:12px; border-bottom:2px solid #021234;' +
    ' padding-bottom:14px; margin-bottom:20px; }' +
    '#jlCierre .cc-esc img { width:52px; height:52px; border-radius:50%; }' +
    '#jlCierre .cc-ant { font-family:"Barlow Condensed","Arial Narrow",sans-serif; font-weight:600;' +
    ' letter-spacing:0.12em; text-transform:uppercase; font-size:0.85rem; color:#C0182C; }' +
    '#jlCierre .cc-liga { font-family:"Anton",Impact,sans-serif; font-size:1.15rem; letter-spacing:0.03em; }' +
    '#jlCierre h1 { font-family:"Anton",Impact,sans-serif; font-weight:400; text-transform:uppercase;' +
    ' font-size:clamp(1.9rem,7vw,2.8rem); line-height:1; margin:0 0 18px; letter-spacing:0.01em; color:#021234; }' +
    '#jlCierre p { font-family:"Source Serif 4",Georgia,serif; font-size:1.02rem; line-height:1.55; margin:0 0 14px; color:#021234; }' +
    '#jlCierre p.cc-firme { font-weight:700; font-style:italic; }' +
    '#jlCierre .cc-aviso { margin:22px 0 6px; background:#C0182C; color:#F7F7F5; text-align:center;' +
    ' font-family:"Anton",Impact,sans-serif; font-size:clamp(1.15rem,4.6vw,1.6rem); letter-spacing:0.03em;' +
    ' padding:14px 12px; line-height:1.15; }' +
    '#jlCierre .cc-admin { text-align:center; font-family:"Barlow Condensed","Arial Narrow",sans-serif;' +
    ' font-weight:600; letter-spacing:0.05em; text-transform:uppercase; font-size:0.85rem; color:#5a6478; margin:10px 0 0; }' +
    '#jlCierre form { margin-top:22px; padding-top:18px; border-top:1px dashed rgba(2,18,52,0.3);' +
    ' display:flex; gap:8px; flex-wrap:wrap; }' +
    '#jlCierre input { flex:1 1 180px; min-width:0; background:#fff; color:#021234; border:2px solid #021234;' +
    ' border-radius:4px; padding:11px 13px; font-size:1rem; font-family:"Barlow Condensed","Arial Narrow",sans-serif;' +
    ' letter-spacing:0.05em; }' +
    '#jlCierre input:focus { outline:none; border-color:#C0182C; }' +
    '#jlCierre button { flex:0 0 auto; background:#021234; color:#F7F7F5; border:0; border-radius:4px;' +
    ' padding:11px 20px; font-family:"Barlow Condensed","Arial Narrow",sans-serif; font-weight:600;' +
    ' letter-spacing:0.08em; text-transform:uppercase; font-size:1rem; cursor:pointer; }' +
    '#jlCierre .cc-error { width:100%; color:#C0182C; font-family:"Barlow Condensed","Arial Narrow",sans-serif;' +
    ' font-weight:600; font-size:0.9rem; min-height:1.2em; }' +
    '#jlCierre form.mal { animation:jlTemblor 0.35s; }' +
    '@keyframes jlTemblor { 20%,60% { transform:translateX(-8px); } 40%,80% { transform:translateX(8px); } }' +
    '@media (max-width:520px) { #jlCierre .cc { padding:24px 18px 20px; } #jlCierre p { font-size:0.96rem; } }';
  document.head.appendChild(estilos);

  var HTML =
    '<div class="cc" role="dialog" aria-modal="true" aria-labelledby="jlCierreTitulo">' +
      '<div class="cc-esc"><img src="assets/escudo.png" alt="">' +
        '<div><div class="cc-ant">Comunicado oficial</div><div class="cc-liga">Johnny\'s League</div></div></div>' +
      '<h1 id="jlCierreTitulo">Cierre temporal de Johnny\'s League</h1>' +
      '<p>La dirección de Johnny\'s League comunica que, con efecto inmediato, esta web queda cerrada.</p>' +
      '<p>Durante las últimas semanas, el creador y administrador de este proyecto ha recibido ataques reiterados, ' +
        'comentarios despectivos y acusaciones sin fundamento bajo la etiqueta <b>#NOALAWEB</b>. Esta campaña solo ha ' +
        'servido para sembrar crispación en la liga y despreciar horas de trabajo que se hicieron para todos sin pedir nada a cambio.</p>' +
      '<p>Esta web nació para disfrutar de la liga, no para soportar faltas de respeto. Ante tanta frustración y tantos ' +
        'mensajes ofensivos, se ha decidido suspender el acceso a todo el contenido: clasificación, estadísticas, ' +
        'mercado, portadas y hemeroteca.</p>' +
      '<p class="cc-firme">Los responsables saben quiénes son.</p>' +
      '<p>Pedimos disculpas a quienes sí han valorado este proyecto. Ellos tampoco podrán entrar.</p>' +
      '<div class="cc-aviso">LA WEB NO SE ABRIRÁ HASTA PRÓXIMO AVISO.</div>' +
      '<p class="cc-admin">Y sí, solo puede entrar el administrador de la web.</p>' +
      '<form id="jlCierreForm" autocomplete="off">' +
        '<input type="password" id="jlCierreClave" placeholder="Contraseña" aria-label="Contraseña">' +
        '<button type="submit">Entrar</button>' +
        '<div class="cc-error" id="jlCierreError" aria-live="polite"></div>' +
      '</form>' +
    '</div>';

  function montar() {
    var overlay = document.createElement('div');
    overlay.id = 'jlCierre';
    overlay.innerHTML = HTML;
    document.body.appendChild(overlay);

    var form = document.getElementById('jlCierreForm');
    var input = document.getElementById('jlCierreClave');
    var error = document.getElementById('jlCierreError');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (normalizar(input.value) === CLAVE) {
        try {
          localStorage.setItem(LS_KEY, 'ok');
          localStorage.setItem('jl-oportunidades', 'ok');
        } catch (e) {}
        document.documentElement.classList.remove('jl-cerrado', 'candado');
        overlay.remove();
      } else {
        error.textContent = 'Acceso denegado. Solo el administrador puede entrar.';
        input.value = '';
        form.classList.remove('mal'); void form.offsetWidth; form.classList.add('mal');
        input.focus();
      }
    });
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
