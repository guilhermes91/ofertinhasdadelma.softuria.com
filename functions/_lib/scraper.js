// Scraping pipeline: fetch the Mercado Livre URL, extract structured data, then
// ask Gemini 2.5 Flash to enrich it (description + tags + SEO copy).

import { slugify, mlIdFromUrl } from "./data.js";
import { SITE } from "./render.js";

const ML_HOSTS = [/(?:^|\.)meli\.la$/i, /(?:^|\.)mercadolivre\.com\.br$/i, /(?:^|\.)mercadolivre\.com$/i];
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function scrapeOffer(rawUrl, env) {
  const url = normalizeUrl(rawUrl);
  if (!url || !ML_HOSTS.some((rx) => rx.test(new URL(url).hostname))) {
    throw new Error("Use um link do Mercado Livre (meli.la, mercadolivre.com.br).");
  }

  const { html, finalUrl } = await fetchHtml(url);
  const raw = extractFromHtml(html);
  // id do produto: prioriza a URL final (resolvida do meli.la), cai pro HTML.
  const mlId = mlIdFromUrl(finalUrl) || mlIdFromUrl(html);

  const enriched = await enrichWithGemini(raw, url, env);

  const merged = {
    mlId,
    title: enriched.title || raw.title || "",
    description: enriched.description || raw.description || "",
    seoTitle: enriched.seoTitle || "",
    seoDescription: enriched.seoDescription || "",
    image: raw.image || "",
    imageAlt: enriched.imageAlt || raw.title || "",
    priceCurrent: raw.priceCurrent ?? null,
    priceOld: raw.priceOld ?? null,
    discount: raw.discount ?? null,
    link: rawUrl,
    tags: Array.isArray(enriched.tags)
      ? enriched.tags.slice(0, 5).map((t) => slugify(t)).filter(Boolean)
      : [],
    bestseller: !!raw.bestseller,
    isNew: true,
    seller: "Mercado Livre"
  };

  return merged;
}

function normalizeUrl(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) return `https://${v}`;
  return v;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.6",
      Accept: "text/html,application/xhtml+xml"
    }
  });
  if (!res.ok) throw new Error(`Não consegui abrir o link (HTTP ${res.status}).`);
  return { html: await res.text(), finalUrl: res.url || "" };
}

function extractFromHtml(html) {
  const og = (prop) => firstMatch(html, new RegExp(`property="${prop}"\\s+content="([^"]+)"`, "i"));
  const ogR = (prop) => firstMatch(html, new RegExp(`content="([^"]+)"\\s+property="${prop}"`, "i"));

  const title = decode(og("og:title") || ogR("og:title") || "").replace(/\s+/g, " ").trim();
  let image = (og("og:image") || ogR("og:image") || "").trim();
  if (image.includes("/D_NQ_NP_")) {
    image = image.replace("/D_NQ_NP_", "/D_Q_NP_2X_");
  }

  // First poly-card slice (the highlighted product).
  const start = html.indexOf("poly-card poly-card--list");
  let priceCurrent = null;
  let priceOld = null;
  let discount = null;
  let bestseller = false;
  if (start !== -1) {
    const block = html.slice(start, start + 8000);
    const prevLabel = (block.match(/<s[^>]*andes-money-amount--previous[^>]*aria-label="([^"]+)"/i) || [])[1];
    const curLabel = (block.match(/poly-price__current[\s\S]*?aria-label="([^"]+)"/i) || [])[1];
    priceOld = parseAriaPrice(prevLabel);
    priceCurrent = parseAriaPrice(curLabel);
    const dm = block.match(/poly-price__disc[^>]*>\s*([0-9]+)\s*%\s*OFF/i);
    if (dm) discount = parseInt(dm[1], 10);
    bestseller = /MAIS\s+VENDIDO/i.test(block);
  }

  if (priceCurrent == null) {
    const m = html.match(/aria-label="(?:Agora:\s*)?(\d+\s*reais(?:\s*com\s*\d+\s*centavos)?)"/i);
    if (m) priceCurrent = parseAriaPrice(m[1]);
  }

  if (discount == null && priceOld && priceCurrent && priceOld > priceCurrent) {
    discount = Math.round(((priceOld - priceCurrent) / priceOld) * 100);
  }

  return {
    title,
    image,
    description: "",
    priceCurrent,
    priceOld,
    discount,
    bestseller
  };
}

function parseAriaPrice(label) {
  if (!label) return null;
  const m = String(label).match(/(\d+)\s*reais?(?:\s*com\s*(\d+)\s*centavos?)?/i);
  if (!m) return null;
  const reais = parseInt(m[1], 10);
  const cents = m[2] ? parseInt(m[2], 10) : 0;
  return reais + cents / 100;
}

function firstMatch(text, regex) {
  const m = text.match(regex);
  return m ? m[1] : "";
}

function decode(value) {
  if (!value) return "";
  return String(value)
    // entidades numéricas (decimais e hex) primeiro: &#39; &#x27; etc.
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => fromCodePoint(parseInt(n, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    // &amp; por último pra não "des-escapar" duplo (&amp;lt; -> &lt;)
    .replace(/&amp;/g, "&");
}

function fromCodePoint(cp) {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

// ----- Gemini -----

async function enrichWithGemini(raw, url, env) {
  if (!env.GEMINI_API_KEY) {
    return fallbackEnrichment(raw);
  }
  const prompt = buildPrompt(raw, url);
  try {
    const out = await callGemini(prompt, env.GEMINI_API_KEY);
    if (!out || typeof out !== "object") return fallbackEnrichment(raw);
    return {
      title: clamp(out.title, 90) || raw.title,
      description: clamp(out.description, 180),
      seoTitle: clamp(out.seoTitle, 70),
      seoDescription: clamp(out.seoDescription, 160),
      imageAlt: clamp(out.imageAlt, 130),
      tags: Array.isArray(out.tags) ? out.tags.map(String).slice(0, 5) : []
    };
  } catch (err) {
    console.error("Gemini error:", err && err.message);
    return fallbackEnrichment(raw);
  }
}

function fallbackEnrichment(raw) {
  return {
    title: raw.title,
    description: "Achadinho garimpado com carinho. Preço bom, vendedor confiável e link direto pra você comprar sem dor de cabeça.",
    seoTitle: clamp(raw.title || "Oferta no Mercado Livre", 70),
    seoDescription: clamp(
      `${raw.title || "Achadinho da Delma"} com preço bom e link direto no Mercado Livre. Veja antes que acabe.`,
      160
    ),
    imageAlt: clamp(raw.title, 130),
    tags: []
  };
}

function buildPrompt(raw, url) {
  const priceLine =
    raw.priceCurrent != null
      ? `Preço atual: R$ ${raw.priceCurrent.toFixed(2)}${raw.priceOld ? ` (de R$ ${raw.priceOld.toFixed(2)})` : ""}.`
      : "Preço: não identificado.";
  return [
    `Você é o copywriter da "${SITE.name}", um site de achadinhos curados do Mercado Livre com entrega para ${SITE.region}.`,
    "Tom: vizinha simpática, conversa fácil, português brasileiro coloquial, sem exageros, sem clickbait, sem palavras difíceis.",
    "Foco em conversão e SEO: use a palavra-chave principal do produto (marca/modelo/categoria) de forma natural no título e na descrição.",
    "Você receberá os dados de uma oferta do Mercado Livre. Devolva apenas um JSON com os campos pedidos.",
    "",
    `URL: ${url}`,
    `Título original: ${raw.title || "(vazio)"}`,
    priceLine,
    "",
    "Responda no formato JSON estrito (sem comentários, sem markdown), com este shape:",
    "{",
    '  "title": string  // 60-90 chars, claro, mantenha marca/quantidade quando relevantes',
    '  "description": string  // 1-2 frases, máximo 180 chars, foco em benefício e quem usa',
    '  "seoTitle": string  // até 70 chars, com a palavra-chave principal do produto',
    '  "seoDescription": string  // até 160 chars, foco em benefício + preço bom + Mercado Livre, de forma natural',
    '  "imageAlt": string  // descrição objetiva do produto, sem marketing',
    '  "tags": string[]  // 3 a 5 tags em kebab-case, sem acentos, focadas no produto/categoria/uso (ex: "moda-infantil", "ferramentas", "casa")',
    "}"
  ].join("\n");
}

async function callGemini(prompt, apiKey) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
    encodeURIComponent(apiKey);

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error("Gemini retornou resposta vazia.");
  // Strip accidental code fences if any.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(cleaned);
}

function clamp(value, max) {
  if (!value) return "";
  const s = String(value).trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}
