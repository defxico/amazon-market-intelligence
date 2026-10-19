# Checklist para publicar a API e entregar URL, token e `curl`

Estado em 17/10/2026: o código está no [GitHub](https://github.com/defxico/amazon-market-intelligence), branch `main`. A URL pública da API, os recursos de produção e o token de produção ainda precisam ser configurados e verificados. Este checklist cobre primeiro uma demonstração com dados sintéticos (`DATA_MODE=fixture`).

Atualização em 19/10/2026: a variável `FIRECRAWL_SEARCH_ENABLED=true` foi adicionada ao ambiente Production da Vercel a pedido do responsável. `FIRECRAWL_API_KEY` e `ENRICHMENT_RIGHTS_PROFILE` não estão configurados nos ambientes Production, Preview ou Development; portanto, a busca ainda não chama o provedor. O limite diário do código é 5 chamadas por padrão. Aprovação de direitos de busca/armazenamento e de orçamento monetário continua pendente; a leitura de páginas também exige aprovação por domínio.

Marque uma caixa somente depois de confirmar a ação. **Você** responde por contas, custos e autorização de uso de dados. **IA** executa configuração e verificação técnica quando tiver acesso autorizado. Credenciais reais não devem ser escritas neste arquivo, em issues, commits ou mensagens de chat; use variáveis protegidas no serviço ou um cofre de segredos.

## 1. Contas e acessos que dependem de você

Para encontrar cada item nos painéis, siga o [guia de obtenção dos acessos](./como-obter-acessos.md).

- [x] **GitHub:** repositório `defxico/amazon-market-intelligence` publicado em `main`.
- [ ] **Vercel:** entrar na conta ou equipe que será proprietária da aplicação e autorizar a integração com este repositório. Conceder acesso ao projeto para configurar variáveis, fazer deploy e consultar logs. Escolher um plano cujo uso e custo você aprove. Um domínio próprio é opcional; o endereço HTTPS fornecido pela Vercel pode servir para o primeiro teste.
- [ ] **PostgreSQL/Prisma:** indicar ou criar um banco **de produção**, separado do banco local/de desenvolvimento. Autorizar criação de tabelas pela migração inicial e acesso a um usuário com as permissões necessárias. Disponibilizar URL de conexão com pool para a aplicação e URL direta para a migração. Decidir plano, região, backups e limite de gasto.
- [ ] **Upstash Redis:** indicar ou criar uma instância de produção e autorizar acesso à URL REST e ao token REST. Decidir plano, região e limite de gasto.
- [ ] **Upstash QStash/Workflow:** habilitar o serviço para produção, autorizar acesso ao token de publicação e às duas chaves de assinatura. Permitir a criação de um agendamento que chama `/api/cron/outbox` a cada cinco minutos. Revisar cota e gasto previstos para esse agendamento e para as pesquisas.
- [ ] **Provedores de dados reais (opcionais):** criar ou autorizar SerpApi e Firecrawl **somente** se decidir ativar a coleta real. Essas contas não são necessárias para o primeiro teste com `fixture`.

Você pode configurar pessoalmente os segredos nos painéis dos provedores e da Vercel, ou conceder acesso autenticado para que a IA faça isso. Não é necessário compartilhar senha pessoal nem código de autenticação de dois fatores.

## 2. Decisões e aprovações que dependem de você

- [ ] **Escopo do primeiro teste:** confirmar que o destinatário pode testar a API com dados **sintéticos**. Resultado em `fixture` não representa pesquisa atual da Amazon. Manter `DATA_MODE=fixture` até uma aprovação específica para dados reais.
- [ ] **Custos:** aprovar os planos e eventuais gastos de Vercel, banco e Upstash. Definir limites de gasto nos próprios provedores quando disponíveis. Os limites de chamadas da aplicação são controles adicionais, não teto de cobrança.
- [ ] **Hostname:** aceitar o domínio HTTPS gerado pela Vercel ou informar o domínio próprio e autorizar acesso ao DNS para configurá-lo. A URL final será usada também pelos callbacks do QStash.
- [ ] **Retenção:** aprovar por quanto tempo guardar observações/resultados (`OBSERVATION_RETENTION_DAYS`, padrão `30`) e registros de uso (`USAGE_RETENTION_DAYS`, padrão `365`), conforme necessidade e termos aplicáveis.
- [ ] **Destinatário do token:** decidir quem receberá o token da API e por qual canal seguro. O código usa **um único token compartilhado** (`RESEARCH_API_KEY`) para as rotas protegidas; quem o recebe pode acessar essas rotas. Se precisar de tokens por cliente, permissões distintas ou revogação individual, isso exige mudança na aplicação antes da distribuição.
- [ ] **Dados reais, se desejados depois:** aprovar separadamente coleta, armazenamento e uso de resultados da Amazon via SerpApi; definir orçamento diário (`MAX_SERPAPI_CALLS_PER_DAY`, padrão `25`) e registrar um identificador da aprovação em `SERPAPI_RIGHTS_PROFILE`.
- [ ] **Busca Firecrawl, se desejada depois:** aprovar nos termos do provedor a busca web e o uso/armazenamento de títulos e trechos de resultados; registrar o perfil em `ENRICHMENT_RIGHTS_PROFILE`, definir orçamento diário (`MAX_FIRECRAWL_CALLS_PER_DAY`, padrão `5`) e só então definir `FIRECRAWL_SEARCH_ENABLED=true`. A chave e o perfil de auditoria não substituem aprovação de direitos.
- [ ] **Leitura de páginas candidatas, se desejada depois:** aprovar os domínios HTTPS específicos e o uso/armazenamento do conteúdo coletado; cadastrar somente esses domínios em `APPROVED_ENRICHMENT_DOMAINS`. Busca não autoriza scrape automático.

## 3. Credenciais e configuração de produção

Os nomes abaixo vêm de [`.env.example`](../.env.example) e de [`scripts/check-env.mjs`](../scripts/check-env.mjs). **Não preencha valores neste checklist.** A IA pode gerar `RESEARCH_API_KEY` e `CRON_SECRET`; os demais valores vêm dos serviços autorizados.

| Valor | Origem / responsável | Onde usar |
| --- | --- | --- |
| `DATABASE_URL` | Banco de produção; URL PostgreSQL com pool | Variável protegida de runtime na Vercel |
| `DIRECT_URL` | Banco de produção; URL PostgreSQL direta | Ambiente seguro de release, apenas para `npm run db:deploy`; não precisa ficar no runtime da Vercel |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis | Variável da Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis | Segredo da Vercel |
| `QSTASH_TOKEN` | Upstash QStash/Workflow | Segredo da Vercel |
| `QSTASH_CURRENT_SIGNING_KEY` | Upstash QStash/Workflow | Segredo da Vercel para validar callbacks |
| `QSTASH_NEXT_SIGNING_KEY` | Upstash QStash/Workflow | Segredo da Vercel para rotação de assinatura |
| `RESEARCH_API_KEY` | IA gera valor aleatório com pelo menos 32 bytes | Segredo da Vercel; o mesmo valor será entregue ao testador autorizado |
| `CRON_SECRET` | IA gera **outro** valor aleatório com pelo menos 32 bytes | Segredo da Vercel e cabeçalho protegido do agendamento QStash; não entregar ao testador |
| `APP_BASE_URL` | URL final da publicação | Origem HTTPS, sem caminho; usada nos callbacks |
| `DATA_MODE` | Decisão de uso de dados | `fixture` no primeiro deploy |
| `QSTASH_DEV` | Configuração local | Deixar ausente em produção |

**Somente após aprovação de dados reais:** `SERPAPI_API_KEY` e `SERPAPI_RIGHTS_PROFILE` para `DATA_MODE=serpapi`; `FIRECRAWL_API_KEY`, `ENRICHMENT_RIGHTS_PROFILE`, orçamento aprovado e `FIRECRAWL_SEARCH_ENABLED=true` para busca e armazenamento de snippets. Defina `APPROVED_ENRICHMENT_DOMAINS` somente para páginas cujo scrape e armazenamento tenham aprovação específica. Sem aprovação, deixe `FIRECRAWL_SEARCH_ENABLED=false` e as chaves dos provedores ausentes em produção. Configure os limites diários e a retenção aprovados na seção anterior.

## 4. Execução técnica pela IA após os acessos

- [ ] Vincular o repositório ao projeto Vercel, definir hostname e região adequados aos recursos escolhidos.
- [ ] Cadastrar variáveis de produção e executar `npm run env:check:production` sem imprimir segredos.
- [ ] Aplicar a migração inicial com `npm run db:deploy` usando o `DIRECT_URL` de produção; conferir o estado da migração.
- [ ] Publicar a aplicação e configurar o agendamento QStash de `/api/cron/outbox` com `CRON_SECRET`. O cron diário de retenção já está definido em [`vercel.json`](../vercel.json).
- [ ] Confirmar que o QStash alcança `/api/workflows/research` e que os callbacks assinados são aceitos.

## 5. Critério de entrega ao testador

- [ ] URL pública HTTPS responde em `GET /api/health` a partir de outra máquina/rede.
- [ ] Rota protegida rejeita chamada sem token e aceita `Authorization: Bearer <token>` com o token correto.
- [ ] Uma pesquisa de demonstração cria um job, termina com sucesso e mostra claramente que seus dados são sintéticos; a repetição da chave de idempotência não cria outro job.
- [ ] Agendamento, banco, Redis e QStash funcionam no ambiente publicado; falhas ficam visíveis nos logs sem expor segredos.
- [ ] Entregar a você a **URL da API**, o **token** pelo canal combinado e um `curl` pronto para a rota protegida. Você decide o encaminhamento ao testador.

Comandos e verificações operacionais estão em [`guide.md`](../guide.md). O repositório e sua documentação são públicos; não registre aqui valores de produção, tokens ou URLs de banco com senha.
