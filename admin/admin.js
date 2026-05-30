(function () {
  "use strict";

  var $ = function (sel) { return document.querySelector(sel); };
  var form = $("#offer-form");
  var listing = $("#listing");
  var flash = $("#flash");
  var imgPreview = $("#f-preview");
  var btnScrape = $("#btn-scrape");
  var btnSave = $("#btn-save");
  var btnReset = $("#btn-reset");
  var scrapeUrl = $("#scrape-url");

  var brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  var state = { editingId: null };

  function showFlash(message, kind) {
    flash.innerHTML = '<div class="alert alert--' + (kind === "err" ? "err" : "ok") + '">' + escapeHtml(message) + '</div>';
    setTimeout(function () { flash.innerHTML = ""; }, 4500);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function setForm(offer) {
    offer = offer || {};
    state.editingId = offer.id || null;
    $("#f-id").value = offer.id || "";
    $("#f-title").value = offer.title || "";
    $("#f-link").value = offer.link || "";
    $("#f-image").value = offer.image || "";
    $("#f-price").value = offer.priceCurrent != null ? offer.priceCurrent : "";
    $("#f-price-old").value = offer.priceOld != null ? offer.priceOld : "";
    $("#f-desc").value = offer.description || "";
    $("#f-seo-title").value = offer.seoTitle || "";
    $("#f-seo-desc").value = offer.seoDescription || "";
    $("#f-image-alt").value = offer.imageAlt || "";
    $("#f-slug").value = offer.slug || "";
    $("#f-tags").value = (offer.tags || []).join(", ");
    $("#f-bestseller").checked = !!offer.bestseller;
    $("#f-new").checked = offer.isNew !== false;
    updatePreview();
    btnSave.textContent = state.editingId ? "Salvar alterações" : "Salvar";
  }

  function readForm() {
    var tags = ($("#f-tags").value || "")
      .split(",")
      .map(function (t) { return t.trim(); })
      .filter(Boolean)
      .slice(0, 5);
    return {
      title: $("#f-title").value.trim(),
      link: $("#f-link").value.trim(),
      image: $("#f-image").value.trim(),
      priceCurrent: parseFloat($("#f-price").value) || 0,
      priceOld: $("#f-price-old").value ? parseFloat($("#f-price-old").value) : null,
      description: $("#f-desc").value.trim(),
      seoTitle: $("#f-seo-title").value.trim(),
      seoDescription: $("#f-seo-desc").value.trim(),
      imageAlt: $("#f-image-alt").value.trim(),
      slug: $("#f-slug").value.trim(),
      tags: tags,
      bestseller: $("#f-bestseller").checked,
      isNew: $("#f-new").checked
    };
  }

  function updatePreview() {
    var url = $("#f-image").value.trim();
    if (url && /^https?:\/\//i.test(url)) {
      imgPreview.src = url;
      imgPreview.hidden = false;
    } else {
      imgPreview.hidden = true;
    }
  }

  $("#f-image").addEventListener("input", updatePreview);

  btnReset.addEventListener("click", function () {
    setForm({});
    showFlash("Formulário limpo.", "ok");
  });

  btnScrape.addEventListener("click", function () {
    var url = scrapeUrl.value.trim();
    if (!url) { showFlash("Cola um link primeiro.", "err"); return; }
    btnScrape.disabled = true;
    btnScrape.textContent = "Buscando...";
    fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.data.error || "Falha no scraping.");
        var o = res.data.offer || {};
        o.link = o.link || url;
        setForm(o);
        showFlash("Dados carregados! Revise e salve.", "ok");
      })
      .catch(function (err) { showFlash(err.message, "err"); })
      .finally(function () { btnScrape.disabled = false; btnScrape.textContent = "Buscar"; });
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var data = readForm();
    if (!data.title || !data.link) { showFlash("Título e link são obrigatórios.", "err"); return; }
    var method = state.editingId ? "PUT" : "POST";
    var url = state.editingId ? "/api/offers/" + encodeURIComponent(state.editingId) : "/api/offers";
    btnSave.disabled = true;
    btnSave.textContent = "Salvando...";
    fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.data.error || "Falha ao salvar.");
        showFlash(state.editingId ? "Oferta atualizada." : "Oferta criada!", "ok");
        setForm({});
        scrapeUrl.value = "";
        loadList();
      })
      .catch(function (err) { showFlash(err.message, "err"); })
      .finally(function () { btnSave.disabled = false; btnSave.textContent = "Salvar"; });
  });

  function loadList() {
    fetch("/api/offers", { headers: { "Cache-Control": "no-store" } })
      .then(function (r) { return r.json(); })
      .then(function (data) { renderList(data.offers || []); })
      .catch(function () { showFlash("Não consegui carregar a lista.", "err"); });
  }

  function renderList(offers) {
    $("#count").textContent = offers.length;
    if (!offers.length) {
      listing.innerHTML = "";
      $("#listing-empty").hidden = false;
      return;
    }
    $("#listing-empty").hidden = true;
    listing.innerHTML = offers.map(function (o) {
      var price = brl.format(o.priceCurrent || 0);
      var oldP = o.priceOld ? '<small style="color:#6b6478; text-decoration:line-through; margin-left:6px;">' + escapeHtml(brl.format(o.priceOld)) + "</small>" : "";
      var pills = "";
      if (o.bestseller) pills += '<span class="pill">Mais vendido</span>';
      if (o.isNew) pills += '<span class="pill" style="background:#e6f4ec;color:#2f8f5e;">Novo</span>';
      var tags = (o.tags || []).slice(0, 3).map(function (t) { return '<span class="pill" style="background:#fff3e6;color:#a05700;">#' + escapeHtml(t) + "</span>"; }).join(" ");
      return '' +
        '<article data-id="' + escapeHtml(o.id) + '">' +
          (o.image ? '<img src="' + escapeHtml(o.image) + '" alt="" referrerpolicy="no-referrer">' : '<div style="width:80px;height:80px;background:#faf3eb;border-radius:10px;"></div>') +
          '<div class="listing__body">' +
            '<h3>' + escapeHtml(o.title) + '</h3>' +
            '<div class="listing__price">' + price + oldP + '</div>' +
            '<div class="listing__meta">' + pills + " " + tags + '</div>' +
            '<div class="listing__actions">' +
              '<button type="button" class="btn-ghost" data-act="edit">Editar</button>' +
              '<a class="btn-ghost" href="/oferta/' + encodeURIComponent(o.slug) + '/" target="_blank" rel="noopener">Ver ↗</a>' +
              '<button type="button" class="btn-danger" data-act="del">Excluir</button>' +
            '</div>' +
          '</div>' +
        '</article>';
    }).join("");

    listing.querySelectorAll("[data-act=edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.closest("article").dataset.id;
        var item = offers.find(function (o) { return o.id === id; });
        if (item) { setForm(item); window.scrollTo({ top: 0, behavior: "smooth" }); }
      });
    });
    listing.querySelectorAll("[data-act=del]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.closest("article").dataset.id;
        var title = (offers.find(function (o) { return o.id === id; }) || {}).title || "essa oferta";
        if (!confirm("Tem certeza que quer excluir \"" + title + "\"?")) return;
        fetch("/api/offers/" + encodeURIComponent(id), { method: "DELETE" })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
          .then(function (res) {
            if (!res.ok) throw new Error(res.data.error || "Falha ao excluir.");
            showFlash("Oferta excluída.", "ok");
            loadList();
          })
          .catch(function (err) { showFlash(err.message, "err"); });
      });
    });
  }

  $("#btn-reload").addEventListener("click", loadList);

  var btnExpire = $("#btn-expire");
  if (btnExpire) {
    btnExpire.addEventListener("click", function () {
      if (!confirm("Remover as ofertas marcadas como quebradas (3+ avisos)?")) return;
      btnExpire.disabled = true;
      var original = btnExpire.textContent;
      btnExpire.textContent = "Limpando...";
      fetch("/api/expire", { method: "POST" })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, data: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.data.error || "Falha ao limpar.");
          showFlash(res.data.removed + " oferta(s) removida(s).", "ok");
          loadList();
        })
        .catch(function (err) { showFlash(err.message, "err"); })
        .finally(function () { btnExpire.disabled = false; btnExpire.textContent = original; });
    });
  }

  loadList();
})();
