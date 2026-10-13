/* Johnny's League — normas de convivencia.
   1) Oculta el enlace a Oportunidades del menú (la página sigue existiendo, con su contraseña).
   2) La primera vez que alguien entra, tapa la web con un pop-up en el que tiene que marcar
      "Estoy de acuerdo" y pulsar Continuar. Se recuerda en el navegador (localStorage 'jl-normas').
   Para quitar el pop-up: borrar el bloque marcado como NORMAS. */
(function () {
  var css =
    'a[href="oportunidades.html"] { display:none !important; }' +
    /* NORMAS */
    'html.jl-normas body > *:not(#jlNormas) { display:none !important; }' +
    'html.jl-normas, html.jl-normas body { overflow:hidden !important; background:#010A20 !important; }' +
    '#jlNormas { position:fixed; inset:0; z-index:999999; overflow-y:auto; -webkit-overflow-scrolling:touch;' +
    ' background:radial-gradient(ellipse at top, #0A1E45 0%, #010A20 70%); padding:28px 16px 40px;' +
    ' display:flex; justify-content:center; align-items:flex-start; box-sizing:border-box; }' +
    '#jlNormas * { box-sizing:border-box; }' +
    '#jlNormas .cc { width:100%; max-width:560px; margin:auto; background:#F7F7F5; color:#021234;' +
    ' border-top:8px solid #E0A94F; box-shadow:0 24px 70px rgba(0,0,0,0.6); padding:28px 26px 24px; }' +
    '#jlNormas .cc-esc { display:flex; align-items:center; gap:12px; border-bottom:2px solid #021234;' +
    ' padding-bottom:14px; margin-bottom:18px; }' +
    '#jlNormas .cc-esc img { width:52px; height:52px; border-radius:50%; }' +
    '#jlNormas .cc-ant { font-family:"Barlow Condensed","Arial Narrow",sans-serif; font-weight:600;' +
    ' letter-spacing:0.12em; text-transform:uppercase; font-size:0.85rem; color:#C0182C; }' +
    '#jlNormas .cc-liga { font-family:"Anton",Impact,sans-serif; font-size:1.15rem; letter-spacing:0.03em; }' +
    '#jlNormas h1 { font-family:"Anton",Impact,sans-serif; font-weight:400; text-transform:uppercase;' +
    ' font-size:clamp(1.7rem,6.5vw,2.4rem); line-height:1; margin:0 0 16px; color:#021234; }' +
    '#jlNormas p, #jlNormas li { font-family:"Source Serif 4",Georgia,serif; font-size:1rem; line-height:1.5; color:#021234; }' +
    '#jlNormas p { margin:0 0 12px; }' +
    '#jlNormas ul { margin:0 0 16px; padding-left:22px; }' +
    '#jlNormas li { margin-bottom:6px; }' +
    '#jlNormas .cc-pie { margin-top:18px; padding-top:16px; border-top:1px dashed rgba(2,18,52,0.3); }' +
    '#jlNormas label { display:flex; align-items:center; gap:12px; cursor:pointer; user-select:none;' +
    ' font-family:"Barlow Condensed","Arial Narrow",sans-serif; font-weight:600; font-size:1.15rem;' +
    ' letter-spacing:0.04em; text-transform:uppercase; color:#021234; }' +
    '#jlNormas input[type=checkbox] { width:26px; height:26px; margin:0; accent-color:#021234; cursor:pointer; flex:0 0 auto; }' +
    '#jlNormas button { margin-top:16px; width:100%; background:#021234; color:#F7F7F5; border:0; border-radius:4px;' +
    ' padding:14px 20px; font-family:"Barlow Condensed","Arial Narrow",sans-serif; font-weight:600;' +
    ' letter-spacing:0.1em; text-transform:uppercase; font-size:1.1rem; cursor:pointer; transition:opacity .2s; }' +
    '#jlNormas button:disabled { opacity:0.35; cursor:not-allowed; }' +
    '@media (max-width:520px) { #jlNormas .cc { padding:22px 18px 20px; } }';

  var estilo = document.createElement('style');
  estilo.textContent = css;
  (document.head || document.documentElement).appendChild(estilo);

  /* NORMAS */
  var LS_KEY = 'jl-normas';
  try { if (localStorage.getItem(LS_KEY) === 'ok') return; } catch (e) {}
  document.documentElement.classList.add('jl-normas');

  var HTML =
    '<div class="cc" role="dialog" aria-modal="true" aria-labelledby="jlNormasTitulo">' +
      '<div class="cc-esc"><img src="assets/escudo.png" alt="">' +
        '<div><div class="cc-ant">Normas de convivencia</div><div class="cc-liga">Johnny\'s League</div></div></div>' +
      '<h1 id="jlNormasTitulo">La web vuelve a abrir</h1>' +
      '<p>Para entrar, cada presidente se compromete a:</p>' +
      '<ul>' +
        '<li>Respetar a los demás presidentes, dentro y fuera de la liga.</li>' +
        '<li>Respetar esta web y el trabajo de quien la mantiene.</li>' +
        '<li>Usar el tablón con buen rollo: pique sí, faltas de respeto no.</li>' +
      '</ul>' +
      '<div class="cc-pie">' +
        '<label><input type="checkbox" id="jlNormasCheck"> Estoy de acuerdo</label>' +
        '<button type="button" id="jlNormasBoton" disabled>Continuar</button>' +
      '</div>' +
    '</div>';

  function montar() {
    var overlay = document.createElement('div');
    overlay.id = 'jlNormas';
    overlay.innerHTML = HTML;
    document.body.appendChild(overlay);
    var check = document.getElementById('jlNormasCheck');
    var boton = document.getElementById('jlNormasBoton');
    check.addEventListener('change', function () { boton.disabled = !check.checked; });
    boton.addEventListener('click', function () {
      if (!check.checked) return;
      try { localStorage.setItem(LS_KEY, 'ok'); } catch (e) {}
      document.documentElement.classList.remove('jl-normas');
      overlay.remove();
    });
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
