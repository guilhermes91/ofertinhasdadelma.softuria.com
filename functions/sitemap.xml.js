import { loadPublicOffers, sortByDateDesc, tagCounts, escapeHtml, safeUrl } from "./_lib/data.js";
import { SITE } from "./_lib/render.js";

export async function onRequestGet(context) {
  const offers = sortByDateDesc(await loadPublicOffers(context.env));
  const tags = tagCounts(offers);
  const today = new Date().toISOString().slice(0, 10);

  // lastmod real por tag = data da oferta mais recente daquela tag (melhora crawl budget)
  const tagLastmod = new Map();
  for (const o of offers) {
    const d = (o.addedAt || today).slice(0, 10);
    for (const t of o.tags || []) {
      if (!tagLastmod.has(t) || d > tagLastmod.get(t)) tagLastmod.set(t, d);
    }
  }

  const urls = [
    { loc: `${SITE.origin}/`, lastmod: today, changefreq: "daily", priority: "1.0" },
    { loc: `${SITE.origin}/categorias`, lastmod: today, changefreq: "weekly", priority: "0.5" },
    { loc: `${SITE.origin}/captar`, lastmod: today, changefreq: "monthly", priority: "0.3" }
  ];

  // Só indexa tag com ≥2 ofertas: página de 1 item é thin-content (soft-404 no Google).
  for (const t of tags.filter((t) => t.count >= 2)) {
    urls.push({
      loc: `${SITE.origin}/tag/${encodeURIComponent(t.slug)}/`,
      lastmod: tagLastmod.get(t.slug) || today,
      changefreq: "weekly",
      priority: "0.7"
    });
  }
  for (const o of offers) {
    urls.push({
      loc: `${SITE.origin}/oferta/${encodeURIComponent(o.slug)}/`,
      lastmod: (o.addedAt || today).slice(0, 10),
      changefreq: "weekly",
      priority: "0.8",
      image: safeUrl(o.image)
    });
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    urls
      .map((u) => {
        const img = u.image
          ? `\n    <image:image><image:loc>${escapeHtml(u.image)}</image:loc></image:image>`
          : "";
        return `  <url>\n    <loc>${escapeHtml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>${img}\n  </url>`;
      })
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}
