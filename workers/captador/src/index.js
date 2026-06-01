// Cron Trigger da captação — roda dentro da Cloudflare (cadência confiável de 10min, sem
// o throttle do GitHub Actions). NÃO faz o trabalho pesado: só dispara as Functions do
// Pages (/api/bot e /api/shopee), que já fazem captura + monetização inline. O limite de
// subrequests/CPU que importa é o da Pages Function (onde o trabalho roda), não o do Worker.
//
// Auth: BOT_TOKEN como secret do Worker (mesmo valor que o bot.yml usa). Sem bind de KV.

const BUA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// UA de browser: o Bot Fight Mode do Cloudflare bloqueia (403) UAs tipo "curl/" ANTES de
// chegar na Function. Sem isto a cron rodaria "verde" mas não captaria nada (já mordeu antes).
async function hit(path, token, site) {
  const res = await fetch(`${site}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "User-Agent": BUA }
  });
  const body = await res.text();
  // Loga o status E o corpo reais — pra "verde mas vazio" nunca passar despercebido.
  console.log(`${path} -> HTTP ${res.status} ${body.slice(0, 400)}`);
  return res.ok;
}

export default {
  async scheduled(event, env, ctx) {
    const site = env.SITE || "https://ofertinhasdadelma.softuria.com";
    const token = env.BOT_TOKEN;
    if (!token) {
      console.error("BOT_TOKEN ausente no Worker — captação abortada (setar via secret).");
      return;
    }
    // O minuto do disparo decide a fonte. 7 e 37 = Shopee; o resto (*/10) = Mercado Livre.
    const min = new Date(event.scheduledTime).getUTCMinutes();
    const isShopee = min === 7 || min === 37;
    // ctx.waitUntil: mantém o Worker vivo até a Function responder (dezenas de s com Gemini);
    // sem isto o runtime mata o processo antes de captar.
    ctx.waitUntil(
      isShopee ? hit("/api/shopee?max=2", token, site)
               : hit("/api/bot?max=6", token, site)
    );
  }
};
