# SEO Playbook — Ofertinhas da Delma

> Plano executável de SEO. A parte **on-page** já foi implementada (✅). A parte
> **off-site (backlink/Digital PR)** é trabalho humano — não dá pra gerar por código.
> Última atualização: 2026-05-28.

---

## 0. A verdade que sustenta tudo (leia antes)

O site **auto-publica** ofertas raspadas de portais (decisão do dono). Isso **tensiona** o
objetivo de topo no orgânico: conteúdo duplicado/fino é o que o Google mais rebaixa.

**Como a engenharia mitiga (já feito):**
- Toda oferta nasce com **copy única regenerada pelo Gemini** (título/descrição próprios) — não
  é cópia literal do portal.
- **Schema Product + Offer + Breadcrumb** em cada oferta; **ItemList** nas listagens; **FAQPage**
  e **Organization** na home.
- Links de saída com `rel="nofollow sponsored"` (correto p/ afiliado).

**Risco residual (honesto):** volume de páginas finas. Mitigação contínua: priorizar ofertas com
descrição substancial, não publicar duplicata exata (dedup por link já existe), e **não** depender
do orgânico de produto como canal principal no começo — ver §3.

---

## 1. Fundação on-page — JÁ IMPLEMENTADO ✅

- [x] SSR no edge (HTML pronto, rápido) — melhor que o WordPress do Promotop.
- [x] `<title>`/meta description dinâmicos e únicos por página.
- [x] Canonical, OG, Twitter Card em todas as páginas.
- [x] `Organization` + `WebSite` (com SearchAction) + `FAQPage` na home.
- [x] `Product` + `Offer` (itemCondition, priceValidUntil) + `BreadcrumbList` na oferta.
- [x] `ItemList` na home e nas tags.
- [x] Sitemap dinâmico **com imagens** (`image:image`) + `robots.txt` apontando pra ele.
- [x] Linkagem interna: tags no header, chips no card, relacionadas **por tag** na oferta.
- [x] Geo centralizada (`SITE.region`) — nacional por padrão, local num campo só.

## 2. TODOs on-page (precisam de ação/asset) ⚠️

- [ ] **OG image raster.** Hoje a imagem social padrão é `og-cover.svg`. **SVG não renderiza**
      no WhatsApp/Facebook/Twitter — e o WhatsApp é o canal principal. **Gerar um
      `og-cover.png/jpg` 1200×630** e apontar o fallback de OG pra ele em `render.js`
      (as páginas de oferta já usam a foto do produto, então o problema é só home/tags/captar).
- [ ] **Otimização de imagem (opcional).** Avaliar `/cdn-cgi/image/` (resize+webp) do Cloudflare
      — só ativar se o plano/zona suportar Transformations; senão **quebra as imagens**. As fotos
      do ML já vêm em webp 2X, então é ganho marginal. Não bloqueia nada.
- [ ] **Google Search Console + Bing Webmaster:** verificar domínio, enviar sitemap. **Crítico** —
      é como você mede e acelera indexação. (Pré-requisito de tudo no §3.)
- [ ] **GA4 / analytics** pra medir origem do tráfego e validar a hipótese A/B/C de canal.

## 3. Estratégia de canal (por que não apostar só no orgânico de produto)

Site de ofertas novo **não rankeia** termo de produto nacional contra Pelando/Promobit/Magalu/ML
no curto prazo (sem autoridade). Ordem de prioridade realista:

1. **Social / compartilhamento direto (canal #1 no começo):** WhatsApp, Telegram, Instagram. O
   link `/captar` e os cards são feitos pra isso. **Foco imediato.**
2. **Orgânico de cauda longa:** páginas de tag/categoria e FAQ podem pegar buscas específicas
   ("manta soft casal barata", "mouse gamer X oferta"). É onde o on-page rende cedo.
3. **Orgânico competitivo (médio/longo prazo):** só vem com autoridade → §4.

## 4. Backlink / Digital PR — plano executável (trabalho humano)

> Objetivo: subir DR/autoridade pra destravar o orgânico do §3.3. Nada disso é gerável por código.

**Fase 1 — Fundação (semana 1-2):**
- [ ] Criar/otimizar perfis: Instagram, perfil em comunidades de ofertas, página no Facebook.
- [ ] Cadastrar em diretórios de cupons/ofertas BR que aceitam novos sites (link de perfil).
- [ ] Linkar o site de todas as bios sociais e grupos de WhatsApp/Telegram.

**Fase 2 — Conteúdo linkável (mensal):**
- [ ] Posts "Melhores ofertas da semana / do mês" — formato que outros sites citam e linkam.
- [ ] Conteúdo sazonal (Black Friday, Dia das Mães, Volta às aulas) com guia de ofertas.
- [ ] Pautas de Digital PR: dados ("o que os brasileiros mais garimpam"), úteis pra imprensa.

**Fase 3 — Outreach (contínuo):**
- [ ] Guest posts em blogs de economia doméstica/achadinhos.
- [ ] Análise de backlinks de concorrentes (Promobit/Pelando) → buscar as mesmas fontes.
- [ ] Recuperar menções sem link (brand mentions → pedir o link).

**Medição:** acompanhar no GSC (impressões/cliques/posição) + crescimento de domínios referentes.

---

## 5. Como ARMAR o bot de captação (quando validado com o dono)

O bot está **pronto e desarmado**. Para ligar:

1. **Gerar um token forte** (ex.: `openssl rand -hex 24`).
2. **Cloudflare Pages → Settings → Environment variables:** criar `BOT_TOKEN` (= o token) no
   ambiente de produção. (O endpoint falha fechado se a var não existir.)
3. **GitHub → repo → Settings → Secrets and variables → Actions:** criar secret `BOT_TOKEN` com
   o MESMO valor.
4. **Testar manual:** GitHub → Actions → "Bot de ofertas (Mercado Livre)" → *Run workflow*
   (input `max`). Ou via curl:
   ```bash
   curl -X POST "https://ofertinhasdadelma.softuria.com/api/bot?max=8&dry=1" \
     -H "Authorization: Bearer SEU_TOKEN"   # dry=1 só simula, não salva
   ```
5. **Armar o cron:** descomentar o bloco `schedule` em `.github/workflows/bot.yml` (`*/10 * * * *`).

**Guardas já embutidas:** teto de ofertas por execução (protege cota do Gemini), dedup por link,
fail-closed sem token.

### Monetização (passo separado, importante)
O link capturado do Promotop carrega o afiliado **do portal-fonte** — clique credita ele, não nós.
Para monetizar: gerar o link de afiliado **nosso** (Portal de Afiliados do ML) e substituir, ou
integrar a API de afiliado quando liberada. Enquanto isso, o bot valida produto/curadoria, mas a
comissão não é nossa. Decidir com o dono antes de armar o cron pra valer.

### Fase 2 do bot (futuro)
Canaltech e Pelando renderizam ofertas no cliente (0 links no HTML server-side). Para incluí-los:
parsear o `__NEXT_DATA__`/JSON do Canaltech e a API interna do Pelando, ou usar um renderizador
headless. Maior esforço/fragilidade — só se o Promotop não bastar.
