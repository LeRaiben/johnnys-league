/* Cierre temporal de la web #NOALAWEB — tapa la página con un comunicado
   hasta que se escribe la contraseña. Tolerante a mayúsculas, tildes y
   espacios (p. ej. "Sí a la web 123" vale igual que "sialaweb123"). */
(function () {
  var CLAVE = 'sialaweb123';
  var LS_KEY = 'jl-cierre';

  function normalizar(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  try {
    if (localStorage.getItem(LS_KEY) === 'ok') return;
  } catch (e) {}

  document.documentElement.classList.add('jl-cerrado');

  var estilos = document.createElement('style');
  estilos.textContent =
    'html.jl-cerrado body > *:not(#jlCierre) { display:none !important; }' +
    'html.jl-cerrado body { overflow:hidden; }' +
    '#jlCierre { position:fixed; inset:0; z-index:999999; display:flex; align-items:center;' +
    ' justify-content:center; padding:20px; background:rgba(1,10,32,0.95);' +
    ' backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }' +
    '#jlCierre .jl-caja { width:100%; max-width:400px; background:var(--navy-soft,#0c1b3d);' +
    ' border-top:3px solid var(--gold,#d4af37); padding:30px 26px 26px; text-align:center;' +
    ' box-shadow:0 18px 50px rgba(0,0,0,0.5); font-family:"Barlow Condensed",sans-serif; }' +
    '#jlCierre .jl-caja img { width:58px; height:58px; border-radius:50%;' +
    ' box-shadow:0 0 0 2px var(--gold-dim,#9a842f); }' +
    '#jlCierre .jl-hash { font-family:"Anton",sans-serif; font-weight:400; font-size:1.9rem;' +
    ' letter-spacing:0.02em; margin:14px 0 4px; text-transform:uppercase; color:var(--gold,#d4af37); }' +
    '#jlCierre h2 { font-family:"Anton",sans-serif; font-weight:400; font-size:1.3rem;' +
    ' letter-spacing:0.02em; margin:0 0 10px; text-transform:uppercase; color:var(--white,#f7f7f5); }' +
    '#jlCierre p { font-size:0.92rem; color:rgba(247,247,245,0.75); margin:0 0 20px; }' +
    '#jlCierre input { width:100%; box-sizing:border-box; background:var(--navy,#071530);' +
    ' color:var(--white,#f7f7f5); border:1px solid var(--navy-line,#1c2d56); border-radius:4px;' +
    ' padding:12px 14px; font-size:1.05rem; font-family:"Barlow Condensed",sans-serif;' +
    ' letter-spacing:0.05em; text-align:center; }' +
    '#jlCierre input:focus { outline:none; border-color:var(--gold,#d4af37); }' +
    '#jlCierre button { width:100%; margin-top:12px; background:var(--gold,#d4af37);' +
    ' color:var(--navy-deep,#010a20); border:0; border-radius:4px; padding:12px;' +
    ' font-family:"Barlow Condensed",sans-serif; font-weight:600; font-size:1.05rem;' +
    ' letter-spacing:0.06em; text-transform:uppercase; cursor:pointer; }' +
    '#jlCierre .jl-error { color:#E8746A; font-size:0.85rem; letter-spacing:0.03em;' +
    ' min-height:1.2em; margin-top:10px; }' +
    '#jlCierre .jl-caja.mal { animation:jlTemblor 0.35s; }' +
    '@keyframes jlTemblor { 20%,60% { transform:translateX(-8px); } 40%,80% { transform:translateX(8px); } }';
  document.head.appendChild(estilos);

  function montar() {
    var overlay = document.createElement('div');
    overlay.id = 'jlCierre';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'jlCierreTitulo');
    overlay.innerHTML =
      '<form class="jl-caja" id="jlCierreForm" autocomplete="off">' +
        '<img src="assets/escudo.png" alt="">' +
        '<div class="jl-hash">#NOALAWEB</div>' +
        '<h2 id="jlCierreTitulo">Comunicado oficial</h2>' +
        '<p>La web ha cerrado temporalmente. Si eres socio, ya sabes la contraseña.</p>' +
        '<input type="password" id="jlCierreClave" placeholder="Contraseña" aria-label="Contraseña" autofocus>' +
        '<button type="submit">Entrar</button>' +
        '<div class="jl-error" id="jlCierreError" aria-live="polite"></div>' +
      '</form>';
    document.body.appendChild(overlay);

    var form = document.getElementById('jlCierreForm');
    var input = document.getElementById('jlCierreClave');
    var error = document.getElementById('jlCierreError');
    var caja = overlay.querySelector('.jl-caja');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (normalizar(input.value) === CLAVE) {
        try { localStorage.setItem(LS_KEY, 'ok'); } catch (e) {}
        document.documentElement.classList.remove('jl-cerrado');
        overlay.remove();
      } else {
        error.textContent = 'Contraseña incorrecta';
        input.value = '';
        caja.classList.remove('mal'); void caja.offsetWidth; caja.classList.add('mal');
        input.focus();
      }
    });
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
