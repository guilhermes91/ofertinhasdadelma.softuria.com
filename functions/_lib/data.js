// Storage + helpers for the Ofertinhas catalog. Single KV key holds the whole list.
const KEY = "offers:all";

export async function loadOffers(env) {
  const raw = await env.OFFERS_KV.get(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Nossas tags de afiliado (não são segredo; são a default do código). ML = sade9179546;
// Shopee = affiliate_id que a NOSSA API injeta no s.shopee.com.br/an_redir.
export const OUR_TAG = "sade9179546";
export const OUR_SHOPEE_AFFID = "18325641094";

// A oferta tem o NOSSO link de afiliado? Só essas aparecem na vitrine. ML: meli.la ou
// /social/<nossa-tag>. Shopee: an_redir COM o NOSSO affiliate_id (an_redir de terceiro,
// com outro id, NÃO passa — fail-closed, nunca paga comissão pro concorrente).
export function hasOurLink(offer) {
  const l = String((offer && offer.link) || "").toLowerCase();
  return (
    /(?:^|\/\/)meli\.la\//.test(l) ||
    l.includes("/social/" + OUR_TAG) ||
    (l.includes("s.shopee.com.br/an_redir") && l.includes("affiliate_id=" + OUR_SHOPEE_AFFID))
  );
}

// Carregamento PÚBLICO: só ofertas com o nosso link (sem link bom = não aparece).
// O bot/relink/admin usam loadOffers (catálogo inteiro).
export async function loadPublicOffers(env) {
  return (await loadOffers(env)).filter(hasOurLink);
}

export const MAX_OFFERS = 500;

export async function saveOffers(env, offers) {
  let list = Array.isArray(offers) ? offers : [];
  // teto de catálogo: mantém as 500 mais recentes (KV leve + site fresco)
  if (list.length > MAX_OFFERS) list = sortByDateDesc(list).slice(0, MAX_OFFERS);
  await env.OFFERS_KV.put(KEY, JSON.stringify(list));
}

export function newId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Combining diacritical marks: U+0300 to U+036F. Build the regex from
// codepoints via String.fromCharCode so the bundler can't mis-encode it.
const DIACRITICS = new RegExp(
  "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
  "g"
);

export function slugify(value, max = 70) {
  if (!value) return "";
  const s = String(value)
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s || "oferta";
}

export function uniqueSlug(base, existing) {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

export function ensureOffer(offer) {
  const o = offer || {};
  const tags = Array.isArray(o.tags)
    ? o.tags
        .map((t) => slugify(t))
        .filter((t) => t && t !== "oferta")
        .slice(0, 5)
    : [];
  const priceCurrent = numberOrNull(o.priceCurrent);
  const priceOld = numberOrNull(o.priceOld);
  let discount = numberOrNull(o.discount);
  if ((!discount || discount < 1) && priceOld && priceCurrent && priceOld > priceCurrent) {
    discount = Math.round(((priceOld - priceCurrent) / priceOld) * 100);
  }
  return {
    id: o.id || newId(),
    slug: o.slug || slugify(o.title || "oferta"),
    addedAt: o.addedAt || new Date().toISOString(),
    title: stringOrEmpty(o.title),
    description: stringOrEmpty(o.description),
    seoTitle: stringOrEmpty(o.seoTitle),
    seoDescription: stringOrEmpty(o.seoDescription),
    image: stringOrEmpty(o.image),
    imageAlt: stringOrEmpty(o.imageAlt) || stringOrEmpty(o.title),
    priceCurrent: priceCurrent || 0,
    priceOld: priceOld || null,
    discount: discount || null,
    link: stringOrEmpty(o.link),
    mlId: stringOrEmpty(o.mlId),
    // link da FONTE (meli.la) — INTERNO, nunca exibido. Usado só p/ gerar o nosso
    // link de afiliado (a API resolve o produto a partir dele, sem id bogus).
    sourceUrl: stringOrEmpty(o.sourceUrl),
    reports: Math.max(0, parseInt(o.reports, 10) || 0),
    tags,
    // Campos derivados por CÓDIGO (sem IA): metadados/hashtags de descoberta que NÃO
    // viram página de tag indexável (evita thin-content). store = sempre ML; model =
    // modelo extraído do título. Linkam pra BUSCA, não pra /tag.
    store: stringOrEmpty(o.store) || "mercado-livre",
    model: stringOrEmpty(o.model) || extractModel(o.title),
    coupon: normalizeCoupon(o.coupon),
    bestseller: !!o.bestseller,
    isNew: o.isNew !== false,
    seller: stringOrEmpty(o.seller) || "Mercado Livre"
  };
}

// Modelo do produto a partir do título, por heurística (sem IA): token alfanumérico
// com pelo menos 1 dígito, 3-14 chars (ex: "221V8LBW3", "PH4200HD", "A52s"). Usado só
// como hashtag/metadado de descoberta (link pra busca) — nunca cria URL indexável, então
// um falso-positivo é cosmético.
export function extractModel(title) {
  const tokens = String(title || "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  // unidade/medida (não é modelo): "120hz", "24000dpi", "500gb", "55pol"...
  const UNIT = /^\d+(hz|ms|w|v|cm|mm|kg|g|gb|tb|mah|ml|l|pol|k|p|dpi|fps|hd)$/i;
  for (const tok of tokens) {
    if (tok.length < 5 || tok.length > 14) continue;
    const letters = (tok.match(/[A-Za-z]/g) || []).length;
    const digits = (tok.match(/\d/g) || []).length;
    // modelo = mistura de letras E números (ex: "221V8LBW3", "PH4200HD"), não medida
    if (letters >= 2 && digits >= 1 && !UNIT.test(tok)) return slugify(tok);
  }
  return "";
}

// Cupom normalizado. O ML aplica desconto por campanha (campaignId) e raramente expõe
// código digitável — então aceitamos {code?, text, campaignId?} e só consideramos cupom
// quando há código OU campanha real. Nada inventado.
export function normalizeCoupon(c) {
  if (!c || typeof c !== "object") return null;
  const code = c.code ? String(c.code).trim().toUpperCase().slice(0, 24) : null;
  const campaignId = c.campaignId ? String(c.campaignId).trim().slice(0, 24) : null;
  if (!code && !campaignId) return null;
  return {
    code: code || null,
    text: stringOrEmpty(c.text) || "Cupom de desconto",
    campaignId: campaignId || null,
    source: stringOrEmpty(c.source) || "mercadolivre"
  };
}

// Normaliza link pra comparação: tira query/hash/barra final e caixa.
export function normalizeLink(l) {
  return String(l || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

// Extrai o id do produto no Mercado Livre (MLB...) de uma URL ou HTML.
// Pega tanto item (MLB-1234567890) quanto catálogo (/p/MLB12345).
export function mlIdFromUrl(value) {
  const m = String(value || "").toUpperCase().match(/MLB-?(\d{6,})/);
  return m ? "MLB" + m[1] : "";
}

// Acha oferta duplicada: 1º pelo id do produto (robusto a link rotacionado),
// depois pelo link normalizado (fallback p/ ofertas antigas sem mlId).
export function findDuplicateIndex(offers, incoming) {
  const id = incoming.mlId;
  const link = normalizeLink(incoming.link);
  // Shopee: o `link` é o an_redir (shortcode opaco). normalizeLink corta a query e TODO
  // an_redir vira a MESMA string ("s.shopee.com.br/an_redir") → casaria errado entre
  // produtos diferentes. Por isso o match por link NÃO vale pra an_redir; Shopee casa só
  // pela URL canônica (sourceUrl = shopee.com.br/product/<shop>/<item>), que é única.
  const isOpaque = /s\.shopee\.com\.br\/an_redir/i.test(incoming.link || "");
  const src = normalizeLink(incoming.sourceUrl);
  return offers.findIndex(
    (o) =>
      (id && o.mlId && o.mlId === id) ||
      (src && o.sourceUrl && normalizeLink(o.sourceUrl) === src) ||
      (!isOpaque && link && normalizeLink(o.link) === link)
  );
}

// Repost (bump = renovar addedAt + jogar pro topo) só vale em 2 casos: oferta com mais de
// 48h de publicação, OU queda de preço MATERIAL (≥3% OU ≥R$5, o que vier primeiro). Fora
// disso, atualiza os dados no lugar mas NÃO renova. Evita o "bump gratuito" de quem reaparece
// na raspagem — e o threshold mata o ruído de centavos da fonte (que recriaria o spam).
export const REPOST_MIN_AGE_MS = 48 * 60 * 60 * 1000;
export const REPOST_MIN_DROP_FRAC = 0.03; // 3%
export const REPOST_MIN_DROP_BRL = 5; // R$5
export function shouldRepost(existing, newPrice) {
  const addedMs = new Date((existing && existing.addedAt) || 0).getTime();
  // addedAt ausente/inválido vira 0 ("1970") → idade gigante. Trata como RECENTE (não
  // reposta por idade) em vez de bumpar tudo sem data — senão legado sem addedAt sobe sempre.
  const ageOk = addedMs > 0 && Date.now() - addedMs > REPOST_MIN_AGE_MS;
  const old = Number((existing && existing.priceCurrent) || 0);
  const np = Number(newPrice);
  // Queda só conta se for MATERIAL: ≥3% OU ≥R$5. Centavo de oscilação não passa.
  const cheaper = np > 0 && old > 0 && (np <= old * (1 - REPOST_MIN_DROP_FRAC) || old - np >= REPOST_MIN_DROP_BRL);
  return ageOk || cheaper;
}

// Insere ou atualiza ("repost"). Se já existe o mesmo produto, atualiza no lugar
// — MANTÉM id/slug pra não quebrar URL/SEO. Comportamento do bump:
//  - repostRule:true → bumpa só se shouldRepost(existing, novoPreço) (regra do dono).
//    Se não bumpa mas dados mudaram → grava in-place (action "updated", mantém addedAt
//    e posição). Se nada mudou → "skipped".
//  - senão (legado): bumpToTop fixo; onlyIfChanged pula quando preço não mudou.
// Retorna { offers, action: added|refreshed|updated|skipped, offer }.
export function upsertOffer(offers, incoming, opts = {}) {
  const { bumpToTop = true, onlyIfChanged = false, repostRule = false } = opts;
  const idx = findDuplicateIndex(offers, incoming);
  if (idx === -1) {
    return { offers: [incoming, ...offers], action: "added", offer: incoming };
  }
  const existing = offers[idx];
  const priceChanged = Number(existing.priceCurrent || 0) !== Number(incoming.priceCurrent || 0);
  // Decide o bump. repostRule → pela regra do dono; senão → bumpToTop fixo (com onlyIfChanged).
  const bump = repostRule ? shouldRepost(existing, incoming.priceCurrent) : bumpToTop;
  const couponChanged =
    JSON.stringify(existing.coupon || null) !== JSON.stringify(incoming.coupon || null);
  if (!bump) {
    // Sem bump: só grava in-place se houver mudança real (preço/cupom); senão não mexe.
    if (!priceChanged && !couponChanged) {
      return { offers, action: "skipped", offer: existing };
    }
  } else if (onlyIfChanged && !priceChanged && !repostRule) {
    return { offers, action: "skipped", offer: existing };
  }
  const refreshed = ensureOffer({
    ...existing,
    ...incoming,
    id: existing.id,
    slug: existing.slug,
    addedAt: bump ? new Date().toISOString() : existing.addedAt
  });
  const nextOffers = bump
    ? [refreshed, ...offers.slice(0, idx).concat(offers.slice(idx + 1))]
    : offers.slice(0, idx).concat([refreshed], offers.slice(idx + 1));
  return { offers: nextOffers, action: bump ? "refreshed" : "updated", offer: refreshed };
}

// Remove ofertas "quebradas" (muitos reports) e/ou vencidas (idade). Por padrão só
// remove as quebradas; a expiração por idade (maxAgeDays) fica desligada até definir.
export function expireOffers(offers, opts = {}) {
  const { maxAgeDays = null, minReports = 3 } = opts;
  const now = Date.now();
  const kept = [];
  const removed = [];
  for (const o of offers) {
    const reports = o.reports || 0;
    const ageDays = (now - new Date(o.addedAt || now).getTime()) / 86400000;
    const isBroken = minReports != null && reports >= minReports;
    const isOld = maxAgeDays != null && maxAgeDays > 0 && ageDays > maxAgeDays;
    if (isBroken || isOld) removed.push({ slug: o.slug, title: o.title, reason: isBroken ? "quebrada" : "vencida" });
    else kept.push(o);
  }
  return { kept, removed };
}

function numberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function stringOrEmpty(v) {
  return v == null ? "" : String(v).trim();
}

export function sortByDateDesc(offers) {
  return offers.slice().sort((a, b) => {
    const da = new Date(a.addedAt || 0).getTime();
    const db = new Date(b.addedAt || 0).getTime();
    return db - da;
  });
}

function dateMs(o) {
  return new Date(o.addedAt || 0).getTime();
}

export function sortByDiscountDesc(offers) {
  return offers.slice().sort((a, b) => (b.discount || 0) - (a.discount || 0) || dateMs(b) - dateMs(a));
}

export function sortByBestseller(offers) {
  return offers.slice().sort((a, b) => (b.bestseller ? 1 : 0) - (a.bestseller ? 1 : 0) || dateMs(b) - dateMs(a));
}

// Ordenação do feed por chave de aba (default: recentes).
export function sortOffers(offers, key) {
  if (key === "desconto") return sortByDiscountDesc(offers);
  if (key === "vendidas") return sortByBestseller(offers);
  return sortByDateDesc(offers);
}

export function paginate(items, page, perPage = 12) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page | 0 || 1), totalPages);
  const start = (current - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page: current,
    perPage,
    total,
    totalPages
  };
}

export function searchOffers(offers, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return offers;
  const tokens = q.split(/\s+/).filter(Boolean);
  return offers.filter((o) => {
    const haystack = [
      o.title,
      o.description,
      o.seoTitle,
      o.seoDescription,
      (o.tags || []).join(" ")
    ]
      .join(" ")
      .toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}

export function offersByTag(offers, tag) {
  const t = slugify(tag);
  if (!t) return [];
  return offers.filter((o) => (o.tags || []).includes(t));
}

export function tagCounts(offers) {
  const counts = new Map();
  for (const o of offers) {
    for (const t of o.tags || []) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([slug, count]) => ({ slug, count, label: humanizeTag(slug) }))
    .sort((a, b) => b.count - a.count);
}

export function timeAgo(iso) {
  const t = new Date(iso || 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return "";
  const diff = Date.now() - t;
  if (diff < 0) return "agora";
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "agora";
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const m = Math.floor(d / 30);
  return `há ${m} ${m === 1 ? "mês" : "meses"}`;
}

export function humanizeTag(slug) {
  if (!slug) return "";
  return slug
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function brl(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function escapeHtml(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeUrl(value) {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  return raw.replace(/"/g, "%22");
}

export function isMercadoLivreUrl(value) {
  try {
    const u = new URL(value);
    return /(?:^|\.)meli\.la$|(?:^|\.)mercadolivre\.com\.br$|(?:^|\.)mercadolivre\.com$|(?:^|\.)mlstatic\.com$/i.test(
      u.hostname
    );
  } catch {
    return false;
  }
}
