/* La web está abierta de nuevo (13/10/2026): el comunicado de cierre #NOALAWEB ya no se muestra.
   Este archivo se queda cargado en todas las páginas solo para ocultar el enlace a
   Oportunidades del menú. La página oportunidades.html sigue existiendo y conserva su
   contraseña, pero no aparece en la navegación.
   Para volver a enseñar Oportunidades: dejar este archivo vacío. */
(function () {
  var estilo = document.createElement('style');
  estilo.textContent = 'a[href="oportunidades.html"] { display:none !important; }';
  (document.head || document.documentElement).appendChild(estilo);
})();
