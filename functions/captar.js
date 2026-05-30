// Endpoint público de captação: /captar?url=<link Mercado Livre>
// Faz o scraping completo via Gemini, adiciona a oferta e mostra uma página
// de confirmação. Bloqueia spam por rate-limit simples por IP.

import { scrapeOffer } from "./_lib/scraper.js";
import {
  loadOffers,
  saveOffers,
  ensureOffer,
  upsertOffer,
  slugify,
  uniqueSlug,
  isMercadoLivreUrl,
  escapeHtml,
  brl
} from "./_lib/data.js";
import { layout, htmlResponse, SITE } from "./_lib/render.js";
import { generateAffiliate } from "./_lib/affiliate.js";

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
  let target = url.searchParams.get("url");

  if (!target && method === "POST") {
    try {
      const body = await request.formData();
      target = body.get("url");
    } catch {
      // ignore
    }
  }

  if (!target) {
    return htmlResponse(renderForm({ message: "" }), { status: 200, cacheControl: "no-store" });
  }
  target = String(target).trim();
  if (!isMercadoLivreUrl(target)) {
    return htmlResponse(
      renderForm({
        prefilled: target,
        error: "O link precisa ser do Mercado Livre (meli.la, mercadolivre.com.br)."
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
          error: `Calma aí! Aguarde ${wait}s antes de mandar outro link.`
        }),
        { status: 429, cacheControl: "no-store" }
      );
    }
  }

  try {
    const scraped = await scrapeOffer(target, env);
    // Guarda de qualidade (espelha o bot em api/bot.js): não publica oferta capada.
    // Sem preço OU sem imagem = não dá pra mostrar direito na vitrine → recusa cedo.
    if (scraped.priceCurrent == null || !scraped.image) {
      return htmlResponse(
        renderForm({
          prefilled: target,
          error:
            "Consegui abrir o link, mas não li o preço e a imagem do produto. Confira se é a página de um produto do Mercado Livre com preço visível e tente de novo."
        }),
        { status: 422, cacheControl: "no-store" }
      );
    }
    // gera o NOSSO link de afiliado (se configurado); senão mantém o original
    const aff = await generateAffiliate(scraped.productUrl || target, env);
    const all = await loadOffers(env);
    const baseSlug = slugify(scraped.title || "oferta");
    const slug = uniqueSlug(baseSlug, all.map((o) => o.slug));
    const candidate = ensureOffer({ ...scraped, slug, link: aff || target });
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

function renderForm({ prefilled = "", message = "", error = "" } = {}) {
  const body = `
    <section class="hero hero--compact">
      <div class="container hero__inner" style="max-width:700px;margin:0 auto;">
        <p class="hero__eyebrow"><span class="dot" aria-hidden="true"></span> Mande sua dica</p>
        <h1 class="hero__title">Achou um achadinho? <span class="hl">Cola aqui o link.</span></h1>
        <p class="hero__sub">Cole um link do Mercado Livre que eu encaixo direitinho na vitrine. Demoro alguns segundos buscando os detalhes — espera só um instante.</p>
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
                 placeholder="https://meli.la/... ou https://www.mercadolivre.com.br/..."
                 value="${escapeHtml(prefilled)}">
          <button type="submit" class="btn btn--primary">Enviar oferta</button>
        </form>
        <p class="capture-tip">Dica: copie o link de compartilhamento direto do Mercado Livre. Ele costuma começar com <code>meli.la/</code>.</p>
      </div>
    </section>
  `;
  return layout({
    title: "Mande sua oferta — Ofertinhas da Delma",
    description: "Cole um link do Mercado Livre e a oferta entra na vitrine automaticamente.",
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
