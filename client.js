(function () {
  "use strict";
  // Submit-on-enter search; let server handle the rest (SSR keeps SEO simple).
  var search = document.querySelector(".search");
  if (search) {
    var input = search.querySelector(".search__input");
    var btn = search.querySelector(".search__btn");
    if (input && btn) {
      // Visual cue while typing
      input.addEventListener("input", function () {
        btn.classList.toggle("search__btn--active", input.value.length > 0);
      });
    }
  }

  // Reportar oferta quebrada/esgotada
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-report]");
    if (!btn) return;
    var id = btn.getAttribute("data-report");
    if (!id || btn.disabled) return;
    btn.disabled = true;
    var original = btn.textContent;
    btn.textContent = "Enviando...";
    fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) { btn.textContent = (j && j.message) || "Obrigado pelo aviso!"; })
      .catch(function () { btn.textContent = original; btn.disabled = false; });
  });

  // Copiar cupom (clipboard com fallback execCommand)
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-coupon]");
    if (!btn) return;
    var code = btn.getAttribute("data-coupon");
    if (!code) return;
    var label = btn.querySelector(".detail__coupon-copy");
    var done = function () {
      if (label) label.textContent = "Copiado!";
      btn.classList.add("is-copied");
      setTimeout(function () {
        if (label) label.textContent = "Copiar";
        btn.classList.remove("is-copied");
      }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(function () { fallbackCopy(code); done(); });
    } else {
      fallbackCopy(code);
      done();
    }
  });
  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (_) {}
  }

  // Smooth scroll for hash links
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href").slice(1);
      var target = id && document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", "#" + id);
      }
    });
  });
})();
