import {
  loadPublicOffers,
  paginate,
  searchOffers,
  sortByDateDesc,
  sortOffers,
  tagCounts,
  humanizeTag,
  escapeHtml
} from "./_lib/data.js";
import { layout, offerCard, pagination, htmlResponse, SITE } from "./_lib/render.js";

// Perguntas frequentes — alimentam a seção visível E o schema FAQPage (rich result).
// Respostas honestas: nada de promessa que a gente não controla.
const FAQ = [
  {
    q: "Como vocês escolhem as ofertas?",
    a: "A Delma garimpa à mão no Mercado Livre, compara preço com o histórico e só publica o que vale o clique. Nada de encher a vitrine por encher."
  },
  {
    q: "O preço fica garantido?",
    a: "O preço e a disponibilidade são definidos pela loja no Mercado Livre no momento da compra. A gente mostra o valor que viu ao publicar, mas confira sempre na página do produto antes de finalizar."
  },
  {
    q: "Onde eu finalizo a compra?",
    a: "Direto no Mercado Livre. Você clica no link, é levado pra plataforma e compra com a proteção que já conhece. A gente não processa pagamento."
  },
  {
    q: "Tem algum custo pra usar o site?",
    a: "Nenhum. Os links podem ser de afiliado, ou seja, a gente pode ganhar uma comissão da loja — sem custo a mais pra você."
  },
  {
    q: "Pra quais lugares tem entrega?",
    a: "Pra todo o Brasil. O prazo e o frete dependem do vendedor e do seu CEP, e aparecem na própria página do Mercado Livre."
  }
];

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const page = parseInt(url.searchParams.get("page") || "1", 10) || 1;
  const sort = url.searchParams.get("sort") || "recentes";

  const all = sortByDateDesc(await loadPublicOffers(env));
  const filtered = sortOffers(searchOffers(all, q), sort);
  const view = paginate(filtered, page, 12);
  const tags = tagCounts(all).slice(0, 5);

  const heroBlock = q
    ? heroSearch(q, filtered.length)
    : hero();

  const tagsBlock = tags.length
    ? `<section class="tagcloud" aria-label="Categorias">
         <div class="container">
           <h2 class="tagcloud__title">Categorias</h2>
           <ul class="tagcloud__list">
             ${tags
               .map(
                 (t) =>
                   `<li><a href="/tag/${escapeHtml(t.slug)}/"><span>#${escapeHtml(humanizeTag(t.slug))}</span><em>${t.count}</em></a></li>`
               )
               .join("")}
           </ul>
         </div>
       </section>`
    : "";

  const offersBlock = view.items.length
    ? `<ul class="offers__grid" role="list">${view.items.map(offerCard).join("")}</ul>
       ${pagination({ page: view.page, totalPages: view.totalPages, baseQuery: q ? `q=${encodeURIComponent(q)}` : "" })}`
    : `<p class="offers__empty">Nada encontrado com esse termo. Tenta de novo, ou dá uma olhada nas categorias acima.</p>`;

  const body = `
    ${heroBlock}
    <section id="ofertas" class="offers" aria-labelledby="offers-title">
      <div class="container">
        <header class="section-head">
          <h2 id="offers-title">${q ? "Resultados pra " + escapeHtml(`"${q}"`) : "Ofertas do dia"}</h2>
          <p>${
            q
              ? `${filtered.length} ${filtered.length === 1 ? "achadinho" : "achadinhos"} encontrados.`
              : "Garimpo diário, curado à mão. Escolhe como quer ver."
          }</p>
        </header>
        ${feedTabs(sort, q)}
        ${offersBlock}
      </div>
    </section>
    ${tagsBlock}
    ${aboutSection()}
    ${trustSection()}
    ${q ? "" : faqSection()}
  `;

  const title = q
    ? `Busca: ${q} — ${SITE.name}`
    : `${SITE.name} | Achadinhos com preço bom no Mercado Livre`;
  const description = q
    ? `Resultados de busca para "${q}" — achadinhos selecionados do Mercado Livre, com link direto.`
    : "Garimpo diário de ofertas no Mercado Livre, com curadoria e link direto. Produto bom, preço justo e entrega pra todo o Brasil.";

  const itemListLd = view.items.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: q ? `Resultados: ${q}` : "Ofertas do dia",
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        itemListElement: view.items.map((o, idx) => ({
          "@type": "ListItem",
          position: idx + 1,
          url: `${SITE.origin}/oferta/${o.slug}/`,
          name: o.title
        }))
      }
    : null;

  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.origin + "/",
    inLanguage: "pt-BR",
    description: SITE.description,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE.origin}/?q={query}`,
      "query-input": "required name=query"
    },
    publisher: { "@type": "Organization", name: "Softuria", url: "https://softuria.com/" }
  };

  const faqLd = q
    ? null
    : {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a }
        }))
      };

  // canonical/prev/next cientes de página (sort fica FORA do canonical p/ não duplicar)
  const pageUrl = (p) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/?${s}` : "/";
  };

  return htmlResponse(
    layout({
      title,
      description,
      canonical: pageUrl(view.page),
      prev: view.page > 1 ? pageUrl(view.page - 1) : null,
      next: view.page < view.totalPages ? pageUrl(view.page + 1) : null,
      body,
      offers: all,
      jsonLd: [websiteLd, itemListLd, faqLd],
      searchQuery: q
    })
  );
}

function feedTabs(active, q) {
  const enc = encodeURIComponent(q || "");
  const tabs = [
    { k: "recentes", label: "Recentes" },
    { k: "desconto", label: "Maiores descontos" },
    { k: "vendidas", label: "Mais vendidas" }
  ];
  return `<nav class="feedtabs" aria-label="Ordenar ofertas">${tabs
    .map((t) => {
      const href =
        t.k === "recentes"
          ? q
            ? `/?q=${enc}`
            : "/"
          : q
          ? `/?q=${enc}&sort=${t.k}`
          : `/?sort=${t.k}`;
      const cls = active === t.k ? "feedtab feedtab--active" : "feedtab";
      return `<a class="${cls}" href="${href}"${active === t.k ? ' aria-current="true"' : ""}>${t.label}</a>`;
    })
    .join("")}</nav>`;
}

function hero() {
  return `
    <section class="hero" aria-labelledby="hero-title">
      <div class="container hero__inner">
        <p class="hero__eyebrow"><span class="dot" aria-hidden="true"></span> Atualizado com carinho, todo dia</p>
        <h1 id="hero-title" class="hero__title">Achadinhos com <span class="hl">preço que vale o clique</span>.</h1>
        <p class="hero__sub">Garimpo diário no Mercado Livre: produto bom, preço justo e link direto. Sem enrolação.</p>
      </div>
      <div class="hero__bg" aria-hidden="true"></div>
    </section>
  `;
}

function heroSearch(q, count) {
  return `
    <section class="hero hero--compact">
      <div class="container hero__inner">
        <p class="hero__eyebrow"><span class="dot"></span> Resultados da busca</p>
        <h1 class="hero__title">Você procurou: <span class="hl">${escapeHtml(q)}</span></h1>
        <p class="hero__sub">${count} ${count === 1 ? "achadinho encontrado" : "achadinhos encontrados"}. Tá tudo aqui em baixo.</p>
        <div class="hero__cta"><a class="btn btn--ghost" href="/">Limpar busca</a></div>
      </div>
    </section>
  `;
}

function aboutSection() {
  return `
    <section id="sobre" class="about" aria-labelledby="about-title">
      <div class="container about__inner">
        <div class="about__copy">
          <p class="eyebrow">Quem é a Delma</p>
          <h2 id="about-title">Uma curadora que entende de preço bom.</h2>
          <p>
            Comecei separando dica pra família e pro grupo do prédio. Quando vi, todo mundo pedia
            pra mandar mais. Resolvi juntar tudo num lugar só, organizadinho, com link direto. Aqui
            tem produto que eu olho, comparo e só publico se valer a pena.
          </p>
          <p>Nada de cadastro chato, pop-up no caminho ou letra miúda. Você abre, escolhe, compra. Simples assim.</p>
        </div>
        <aside class="about__card">
          <h3>Como eu escolho cada oferta</h3>
          <ol>
            <li><strong>Preço de verdade.</strong> Comparo com o histórico antes de publicar.</li>
            <li><strong>Vendedor confiável.</strong> Reputação boa e entrega no prazo.</li>
            <li><strong>Produto que serve.</strong> Útil de verdade, não só barato.</li>
            <li><strong>Link direto.</strong> Sem cupom escondido, sem rota maluca.</li>
          </ol>
        </aside>
      </div>
    </section>
  `;
}

function trustSection() {
  return `
    <section id="confianca" class="trust" aria-labelledby="trust-title">
      <div class="container">
        <header class="section-head">
          <h2 id="trust-title">Por que confiar nas ofertinhas</h2>
          <p>O combinado é simples: se eu não compraria, eu não publico.</p>
        </header>
        <div class="trust__grid">
          <article class="trust__item"><span class="trust__icon" aria-hidden="true">★</span><h3>Garimpo manual</h3><p>Cada item passa pelo meu olhar antes de aparecer aqui.</p></article>
          <article class="trust__item"><span class="trust__icon" aria-hidden="true">↺</span><h3>Atualização diária</h3><p>Oferta que acabou some. Só fica o que ainda vale a pena.</p></article>
          <article class="trust__item"><span class="trust__icon" aria-hidden="true">✓</span><h3>Compra no Mercado Livre</h3><p>Você compra direto na plataforma, com a proteção que já conhece.</p></article>
          <article class="trust__item"><span class="trust__icon" aria-hidden="true">♡</span><h3>Sem enrolação</h3><p>Nada de cadastro, pop-up ou caminho indireto. É clicar e ir.</p></article>
        </div>
      </div>
    </section>
  `;
}

function faqSection() {
  const items = FAQ.map(
    (f) => `
      <details class="faq__item">
        <summary>${escapeHtml(f.q)}</summary>
        <p>${escapeHtml(f.a)}</p>
      </details>`
  ).join("");
  return `
    <section id="faq" class="faq" aria-labelledby="faq-title">
      <div class="container faq__inner">
        <header class="section-head">
          <h2 id="faq-title">Perguntas frequentes</h2>
          <p>O essencial pra você comprar tranquilo.</p>
        </header>
        ${items}
      </div>
    </section>
  `;
}
