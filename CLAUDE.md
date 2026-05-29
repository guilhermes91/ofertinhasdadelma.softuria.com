# CLAUDE.md

**Antes de qualquer coisa, leia [`CONTEXTO.md`](./CONTEXTO.md)** — é o documento mestre com
equipe, conceito, projeto, stack, estado atual e decisões em aberto.

## Resumo de bolso

- **Projeto:** Ofertinhas da Delma — vitrine de achadinhos curados do Mercado Livre.
- **Stack:** Cloudflare Pages + Functions (edge), Workers KV (`OFFERS_KV`, key `offers:all`),
  Gemini 2.5 Flash. HTML/CSS/JS puro, **sem build step**.
- **Como trabalhar:** pares maker + advogado do diabo; razão vence; simples e robusto com
  propósito (Uno vs. Ferrari); sem alucinação; reportar fielmente. Detalhe em `CONTEXTO.md` §2–3.
- **Fluxo:** a cada mudança relevante → atualizar `CONTEXTO.md` + commit + push.
