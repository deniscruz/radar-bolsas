# Radar de Bolsas EUA

Site público e gratuito que reúne bolsas para estudar em universidades americanas, oferecidas por universidades, fundações, ONGs, empresas e governos. Qualquer pessoa pode abrir o site, filtrar do jeito que quiser e ir direto para a página oficial de cada bolsa.

## Como funciona

| Parte | O que faz | Quando roda |
|---|---|---|
| `site/` | O site em si: lista, filtros, perfil opcional, contagem regressiva dos prazos, bolsas salvas | Sempre no ar (GitHub Pages) |
| `scripts/monitor.mjs` | Visita a página oficial de cada bolsa, confere se o link funciona, detecta mudanças e lê o prazo escrito na página | A cada 6 horas |
| `scripts/discover.mjs` | O Claude pesquisa na web bolsas que ainda não estão no radar. A cada semana cobre um tema diferente | Toda segunda-feira |
| `scripts/suggest.mjs` | Transforma uma sugestão aprovada em uma bolsa do site | Quando uma sugestão recebe o rótulo `aprovada` |

Os dados ficam em `data/`:

- `scholarships.json`: a lista revisada (a inicial e as sugestões aprovadas).
- `discovered.json`: bolsas encontradas pelo robô. Aparecem no site com o selo "descoberta pelo robô".
- `status.json`: resultado da última varredura (link, mudanças, prazo confirmado e a citação da página).

### Como o prazo é decidido

1. **Confirmado**: o robô encontrou a data na página oficial. Quando a IA está ligada, ela lê a página e a data só é aceita se a citação que ela devolve existir de verdade no texto da página.
2. **Estimado**: a página não mostrou a data. O site usa a data típica do ciclo anual.
3. **Contínua** ou **Varia**: quando não existe uma data fixa.

## Colocar no ar (uns 10 minutos)

1. Crie um repositório **público** no GitHub, por exemplo `radar-bolsas`, e envie esta pasta para ele.
2. Em **Settings → Pages**, em *Source*, escolha **GitHub Actions**.
3. Em **Settings → Actions → General → Workflow permissions**, marque **Read and write permissions**.
4. Em **Issues → Labels**, crie os rótulos `sugestão` e `aprovada`.
5. (Opcional, recomendado) Em **Settings → Secrets and variables → Actions**, crie o segredo `ANTHROPIC_API_KEY` com uma chave de https://console.anthropic.com. Sem ela, o robô ainda confere links e procura datas por padrões de texto, mas não lê as páginas com IA e não descobre bolsas novas.
6. Em **Actions → Monitorar bolsas → Run workflow**, rode a primeira varredura. Marque "Rodar também a descoberta" se já configurou a chave.

O site fica em `https://SEU-USUARIO.github.io/radar-bolsas/`. O botão "Sugerir uma bolsa" aparece sozinho e abre o formulário do repositório.

### Custos

GitHub Pages e GitHub Actions são gratuitos para repositórios públicos. A API do Claude é paga por uso. Para controlar o gasto:

- A IA só lê uma página quando ela mudou ou quando a última leitura tem mais de 7 dias.
- Cada varredura lê no máximo 25 páginas com IA. Para mudar, crie a variável `MAX_AI_CHECKS` em **Settings → Secrets and variables → Actions → Variables**.
- O modelo padrão é `claude-opus-5-5`. Para gastar menos, crie ali a variável `CLAUDE_MODEL` (por exemplo `claude-haiku-5-5`).
- Se o Claude recusar um pedido, a API refaz automaticamente no modelo de reserva recomendado (`fallbacks: "default"`).

## Moderar sugestões

Visitantes enviam bolsas pelo formulário **Sugerir uma bolsa**. Confira o link e os dados e adicione o rótulo `aprovada`. A automação inclui a bolsa, publica o site e fecha a sugestão com um agradecimento.

Bolsas descobertas pelo robô entram direto, com selo próprio. Para revisar uma, mova o item de `discovered.json` para `scholarships.json` e troque `"reviewed": false` por `true`. Para remover, apague o item.

## Rodar no seu computador

```bash
npm install
npm run monitor          # varredura (use ANTHROPIC_API_KEY=... para ligar a IA)
npm run discover         # descoberta (precisa de ANTHROPIC_API_KEY)
npm run dev              # abre o site em http://localhost:8080
```
