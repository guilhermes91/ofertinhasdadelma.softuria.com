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

  // Rolagem infinita (progressive enhancement): substitui a paginação por carregamento
  // contínuo, REUSANDO as páginas SSR (?page=N) — sem API nova. Mantém as URLs paginadas +
  // rel=next no DOM (SEO; a paginação só some VISUALMENTE). Sem JS / sem IntersectionObserver
  // / erro de rede → a paginação normal continua funcionando (fallback garantido).
  (function infiniteScroll() {
    if (!("IntersectionObserver" in window) || typeof DOMParser === "undefined") return;
    var pager = document.querySelector(".pagination");
    if (!pager) return;
    var firstNext = pager.querySelector('a[rel="next"]');
    if (!firstNext) return;
    var container = pager.parentElement;
    var grid = container.querySelector(".offers__grid");
    if (!grid) return;

    // Resolve a URL absoluta e preserva o sort atual (o rel=next não carrega sort, de
    // propósito, p/ não poluir o canônico — então reinjetamos no client).
    function resolve(href) {
      var u = new URL(href, location.href);
      var cur = new URLSearchParams(location.search).get("sort");
      if (cur && !u.searchParams.get("sort")) u.searchParams.set("sort", cur);
      return u.href;
    }

    var nextUrl = resolve(firstNext.getAttribute("href"));
    var loading = false;
    var done = false;

    pager.hidden = true; // some da vista, mas continua no DOM (rastreável)

    var status = document.createElement("p");
    status.className = "infinite-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    var sentinel = document.createElement("div");
    sentinel.className = "infinite-sentinel";
    sentinel.setAttribute("aria-hidden", "true");
    container.insertBefore(status, pager);
    container.insertBefore(sentinel, status);

    function setLoading(on, msg) {
      status.classList.toggle("infinite-status--loading", !!on);
      status.textContent = msg || "";
    }
    function stop() {
      done = true;
      loading = false;
      io.disconnect();
      if (sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);
    }
    function fallbackToPager() {
      // erro de rede: restaura a paginação manual e encerra a rolagem infinita
      setLoading(false, "");
      pager.hidden = false;
      stop();
    }

    function load() {
      if (loading || done || !nextUrl) return;
      loading = true;
      setLoading(true, "Carregando mais ofertas…");
      fetch(nextUrl, { credentials: "same-origin" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, "text/html");
          var items = doc.querySelectorAll(".offers__grid > li");
          if (!items.length) {
            setLoading(false, "");
            stop();
            return;
          }
          var frag = document.createDocumentFragment();
          for (var i = 0; i < items.length; i++) {
            frag.appendChild(document.importNode(items[i], true));
          }
          grid.appendChild(frag);
          var nl = doc.querySelector('.pagination a[rel="next"]');
          nextUrl = nl ? resolve(nl.getAttribute("href")) : null;
          loading = false;
          setLoading(false, "");
          if (!nextUrl) {
            stop();
            return;
          }
          // tela grande: se o sentinel ainda está visível, já busca a próxima
          if (sentinel.getBoundingClientRect().top < window.innerHeight + 400) load();
        })
        .catch(fallbackToPager);
    }

    var io = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            load();
            break;
          }
        }
      },
      { rootMargin: "600px 0px" } // pré-carrega antes de chegar no fim
    );
    io.observe(sentinel);
  })();
})();
