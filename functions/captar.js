// Endpoint público de captação: /captar?url=<link Mercado Livre>
// Faz o scraping completo via Gemini, adiciona a oferta e mostra uma página
// de confirmação. Bloqueia spam por rate-limit simples por IP.

import { scrapeOffer, enrichOffer } from "./_lib/scraper.js";
import { scrapeShopee, isShopeeUrl, shopeeIds, shopeeCanonical } from "./_lib/shopee.js";
import {
  loadOffers,
  saveOffers,
  ensureOffer,
  upsertOffer,
  slugify,
  uniqueSlug,
  mlIdFromUrl,
  isMercadoLivreUrl,
  escapeHtml,
  brl
} from "./_lib/data.js";
import { layout, htmlResponse, SITE } from "./_lib/render.js";
import { generateAffiliate, completeOffer } from "./_lib/affiliate.js";

const RATE_LIMIT_SECONDS = 20;

export async function onRequestGet(context) {
  return handle(context, "GET");
}

export async function onRequestPost(context) {
  return handle(context, "POST");
}

async function handle(context, method) {
  const { request, env } = context;
  const url = new URL(request.url);

  // PROBE temporário: /captar?probe=<urlML> — testa se o edge alcança a API /completo.
  let target = url.searchParams.get("url");
  // campos manuais (opcionais): se preenchidos, mandam; se vazios, usamos o scrape.
  let manualCoupon = (url.searchParams.get("coupon") || "").trim();
  let manualPrice = (url.searchParams.get("price") || "").trim();

  if (!target && method === "POST") {
    try {
      const body = await request.formData();
      target = body.get("url");
      manualCoupon = String(body.get("coupon") || manualCoupon).trim();
      manualPrice = String(body.get("price") || manualPrice).trim();
    } catch {
      // ignore
    }
  }

  if (!target) {
    return htmlResponse(renderForm({ message: "" }), { status: 200, cacheControl: "no-store" });
  }
  target = String(target).trim();
  const isShopee = isShopeeUrl(target);
  if (!isMercadoLivreUrl(target) && !isShopee) {
    return htmlResponse(
      renderForm({
        prefilled: target,
        prefilledCoupon: manualCoupon,
        prefilledPrice: manualPrice,
        error: "O link precisa ser do Mercado Livre (meli.la, mercadolivre.com.br) ou da Shopee (shopee.com.br)."
      }),
      { status: 400, cacheControl: "no-store" }
    );
  }

  // Rate limit por IP (KV-based)
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rateKey = `rate:capture:${ip}`;
  const last = await env.OFFERS_KV.get(rateKey);
  if (last) {
    const elapsed = Date.now() - parseInt(last, 10);
    if (elapsed < RATE_LIMIT_SECONDS * 1000) {
      const wait = Math.ceil((RATE_LIMIT_SECONDS * 1000 - elapsed) / 1000);
      return htmlResponse(
        renderForm({
          prefilled: target,
        prefilledCoupon: manualCoupon,
        prefilledPrice: manualPrice,
          error: `Calma aí! Aguarde ${wait}s antes de mandar outro link.`
        }),
        { status: 429, cacheControl: "no-store" }
      );
    }
  }

  try {
    // Caminho preferido: API /completo (nome/preço/imagem + NOSSO link, numa chamada).
    // É confiável pro ML E Shopee — o edge não lê imagem/preço de alguns formatos de link
    // (ex.: produto.mercadolivre.com.br/MLB-...). Só ativa se a config da API existir (env/KV).
    let scraped;
    let apiLink = null;
    const api = await completeOffer(target, env);
    if (api && api.link && api.image) {
      const store = isShopee ? "Shopee" : "Mercado Livre";
      let mlId = "";
      let productUrl;
      let sourceUrl;
      if (isShopee) {
        // Shopee não tem mlId; URL canônica = chave de dedup estável + link limpo (compliance).
        const ids = shopeeIds(target);
        const canonical = ids ? shopeeCanonical(ids.shopid, ids.itemid) : target;
        productUrl = canonical;
        sourceUrl = canonical;
      } else {
        mlId = mlIdFromUrl(target) || "";
        productUrl = mlId ? `https://produto.mercadolivre.com.br/${mlId.replace("MLB", "MLB-")}` : target;
        sourceUrl = target;
      }
      const base = {
        url: target,
        raw: { title: api.name, image: api.image, priceCurrent: api.price, priceOld: null, discount: null, bestseller: false },
        coupon: null,
        mlId,
        productUrl,
        sourceUrl
      };
      scraped = await enrichOffer(base, env, store); // Gemini só pra copy (título/seo/tags)
      scraped.image = api.image;
      if (isShopee) scraped.store = "shopee";
      apiLink = api.link; // NOSSO link de afiliado (já veio da API)
    } else {
      scraped = isShopee ? await scrapeShopee(target, env) : await scrapeOffer(target, env);
    }
    // Override manual (autoritativo): preço e cupom digitados ganham do scrape. Captura
    // automática de cupom é não-confiável (fontes às vezes expõem a tag da loja, não o
    // código real) — por isso o manual manda.
    const mp = parseFloat(manualPrice.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    if (manualPrice && Number.isFinite(mp) && mp > 0) scraped.priceCurrent = mp;
    if (manualCoupon) {
      scraped.coupon = { code: manualCoupon.toUpperCase().slice(0, 24), text: "Cupom de desconto", source: "manual" };
    }
    // Guarda de qualidade (espelha o bot em api/bot.js): não publica oferta capada.
    // Sem preço OU sem imagem = não dá pra mostrar direito na vitrine → recusa cedo.
    if (scraped.priceCurrent == null || !scraped.image) {
      return htmlResponse(
        renderForm({
          prefilled: target,
        prefilledCoupon: manualCoupon,
        prefilledPrice: manualPrice,
          error:
            "Consegui abrir o link, mas não li o preço e a imagem do produto. Confira se é a página de um produto (Mercado Livre, Shopee, etc.) com preço visível e tente de novo."
        }),
        { status: 422, cacheControl: "no-store" }
      );
    }
    // Modo preview (?dry=1): passou na guarda de qualidade, devolve o que SERIA publicado
    // em JSON e NÃO grava. Serve pra validar a captação (inclusive Shopee) sem poluir a vitrine.
    if (url.searchParams.get("dry")) {
      return new Response(
        JSON.stringify({
          ok: true,
          dry: true,
          source: isShopee ? "shopee" : "mercadolivre",
          offer: {
            title: scraped.title,
            priceCurrent: scraped.priceCurrent,
            image: scraped.image,
            seller: scraped.seller,
            tags: scraped.tags,
            link: scraped.productUrl
          }
        }),
        { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }
      );
    }
    // Gera o NOSSO link de afiliado A PARTIR DO LINK COLADO (sourceUrl) — a API
    // resolve o produto certo (a productUrl `produto/MLB-` dá erro 111 em catálogo).
    // ⚠️ COMPLIANCE: o link salvo NUNCA é o `target`/sourceUrl (tag da fonte); fallback
    // seguro = URL de produto LIMPA, sem tag nenhuma.
    const aff = apiLink || (await generateAffiliate(scraped.sourceUrl || scraped.productUrl, env));
    const all = await loadOffers(env);
    const baseSlug = slugify(scraped.title || "oferta");
    const slug = uniqueSlug(baseSlug, all.map((o) => o.slug));
    const candidate = ensureOffer({ ...scraped, slug, link: aff || scraped.productUrl });
    // repost: se o produto já existe, atualiza no lugar e sobe pro topo.
    const { offers: next, offer } = upsertOffer(all, candidate, { bumpToTop: true });
    await saveOffers(env, next);
    await env.OFFERS_KV.put(rateKey, String(Date.now()), { expirationTtl: 600 });
    return htmlResponse(renderSuccess(offer), { status: 200, cacheControl: "no-store" });
  } catch (err) {
    return htmlResponse(
      renderForm({ prefilled: target, error: err.message || "Não consegui processar esse link." }),
      { status: 500, cacheControl: "no-store" }
    );
  }
}

function renderForm({ prefilled = "", prefilledCoupon = "", prefilledPrice = "", message = "", error = "" } = {}) {
  const body = `
    <section class="hero hero--compact">
      <div class="container hero__inner" style="max-width:700px;margin:0 auto;">
        <p class="hero__eyebrow"><span class="dot" aria-hidden="true"></span> Mande sua dica</p>
        <h1 class="hero__title">Achou um achadinho? <span class="hl">Cola aqui o link.</span></h1>
        <p class="hero__sub">Cole um link do Mercado Livre ou da Shopee que eu encaixo direitinho na vitrine. Demoro alguns segundos buscando os detalhes — espera só um instante.</p>
        ${
          error
            ? `<p class="form-alert form-alert--error" role="alert">${escapeHtml(error)}</p>`
            : message
            ? `<p class="form-alert" role="status">${escapeHtml(message)}</p>`
            : ""
        }
        <form class="capture-form" action="/captar" method="get">
          <label for="captar-url" class="visually-hidden">Link da oferta</label>
          <input id="captar-url" name="url" type="url" inputmode="url" required
                 placeholder="https://meli.la/... · mercadolivre.com.br/... · shopee.com.br/..."
                 value="${escapeHtml(prefilled)}">
          <div class="capture-form__row">
            <input name="price" type="text" inputmode="decimal"
                   placeholder="Preço (opcional, ex: 129,90)" value="${escapeHtml(prefilledPrice)}">
            <input name="coupon" type="text" autocapitalize="characters"
                   placeholder="Cupom (opcional, ex: MEGACUPOM)" value="${escapeHtml(prefilledCoupon)}">
          </div>
          <button type="submit" class="btn btn--primary">Enviar oferta</button>
        </form>
        <p class="capture-tip">Dica: cole o link de compartilhamento do Mercado Livre (começa com <code>meli.la/</code>) ou o link do produto na <code>shopee.com.br</code>. Preço e cupom são opcionais — se deixar em branco, eu busco sozinha.</p>
      </div>
    </section>
  `;
  return layout({
    title: "Mande sua oferta — Ofertinhas da Delma",
    description: "Cole um link de qualquer loja parceira (Mercado Livre, Shopee, Amazon…) e a oferta entra na vitrine automaticamente.",
    canonical: "/captar",
    body,
    noindex: true
  });
}

function renderSuccess(offer) {
  const body = `
    <section class="hero hero--compact">
      <div class="container hero__inner" style="max-width:760px;margin:0 auto;text-align:center;">
        <p class="hero__eyebrow"><span class="dot" aria-hidden="true"></span> Pronto!</p>
        <h1 class="hero__title">Oferta adicionada <span class="hl">com sucesso.</span></h1>
        <p class="hero__sub">Pode comemorar — já tá na vitrine pra todo mundo ver.</p>
        <div class="success-card">
          ${
            offer.image
              ? `<img src="${escapeHtml(offer.image)}" alt="${escapeHtml(offer.imageAlt || offer.title)}" loading="eager" referrerpolicy="no-referrer">`
              : ""
          }
          <div>
            <h2>${escapeHtml(offer.title)}</h2>
            <p class="success-card__price">${escapeHtml(brl(offer.priceCurrent || 0))}</p>
            <div class="success-card__actions">
              <a class="btn btn--primary" href="/oferta/${escapeHtml(offer.slug)}/">Ver na vitrine</a>
              <a class="btn btn--ghost" href="/captar">Mandar outra</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
  return layout({
    title: "Oferta adicionada — Ofertinhas da Delma",
    description: `Oferta ${offer.title} adicionada com sucesso na vitrine.`,
    canonical: "/captar",
    body,
    noindex: true
  });
}
