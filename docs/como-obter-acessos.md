# Onde obter os acessos do item 1

Este guia acompanha o [checklist de publicação](./checklist-publicacao.md#1-contas-e-acessos-que-dependem-de-você). Para o primeiro teste externo, precisamos de **Vercel, PostgreSQL, Upstash Redis e QStash/Workflow**. SerpApi e Firecrawl só entram se você aprovar dados reais depois. Os caminhos abaixo foram conferidos nas documentações oficiais em 17/10/2026; nomes de botões podem mudar.

**Não cole senhas, URLs de banco com senha ou tokens neste documento, em commits, issues ou mensagens de chat.** Você pode inserir os valores no painel da Vercel ou disponibilizar uma sessão autorizada para eu configurá-los. Para liberar a execução, basta me dizer quais contas/projetos estão prontos e qual equipe é proprietária deles. Nunca preciso da sua senha pessoal nem do código de autenticação de dois fatores.

## 1. GitHub: já concluído

O repositório [defxico/amazon-market-intelligence](https://github.com/defxico/amazon-market-intelligence) já está publicado na branch `main`. Não há chave do GitHub para copiar para a aplicação. Ao conectar a Vercel, autorize o aplicativo da Vercel a acessar **este repositório**. Se o repositório não aparecer na importação, confira o acesso do aplicativo em **GitHub → Settings → Applications → Installed GitHub Apps → Vercel**; a [documentação da Vercel sobre acesso ao GitHub](https://vercel.com/docs/errors/error-list#lost-git-repository-access) descreve essa verificação.

**Me informe:** apenas se o repositório apareceu para importação na Vercel.

## 2. Vercel: conta, projeto e acesso

1. Entre no [painel da Vercel](https://vercel.com/dashboard) com a conta/equipe que será dona da aplicação. Confira plano, cobrança e permissão de uso pretendido antes de aceitar qualquer custo.
2. Em **New Project**, procure `defxico/amazon-market-intelligence`. Se a Vercel pedir autorização do GitHub, conceda acesso ao repositório. Confira que a branch de produção será `main` e que a raiz do projeto é a raiz deste repositório. A [documentação de importação Git](https://vercel.com/docs/git#deploying-a-git-repository) mostra esse fluxo.
3. O projeto precisa permitir configurar variáveis de **Production**, implantar e consultar logs. Se trabalhar em equipe, conceda acesso adequado ao projeto, sem compartilhar sua senha. As opções de convite e permissões dependem do plano; veja [gerenciamento de membros](https://vercel.com/docs/rbac/managing-team-members) e [papéis de acesso](https://vercel.com/docs/rbac/access-roles).
4. O endereço padrão `*.vercel.app` serve para o primeiro teste. Se quiser domínio próprio, informe o domínio e disponibilize acesso ao DNS. A URL final será usada em `APP_BASE_URL` depois da publicação.
5. As credenciais de banco e Upstash serão cadastradas em **Project → Settings → Environment Variables**, com destino **Production**. Alterações nessas variáveis exigem nova implantação para entrar em vigor; veja a [documentação de variáveis da Vercel](https://vercel.com/docs/environment-variables/managing-environment-variables).

**Me informe:** nome da conta/equipe Vercel, nome ou link do projeto, se aceita `*.vercel.app` e se o plano/custo estão aprovados. Eu posso concluir a importação e configurar o projeto quando houver sessão autorizada; você também pode apenas deixar a conta pronta.

## 3. PostgreSQL/Prisma: banco de produção e duas URLs

1. Entre no [Prisma Console](https://console.prisma.io/login). Na equipe/workspace desejada, crie um projeto para esta aplicação e use **Create Database** para criar um **Prisma Postgres** de produção. Escolha a região considerando a região escolhida na Vercel e confirme o plano/custo. O [guia do Prisma Console](https://www.prisma.io/docs/console/getting-started) mostra esse caminho. Se você já usa outro PostgreSQL gerenciado, ele pode ser avaliado; não é obrigatório criar um novo provedor sem necessidade.
2. Dentro do banco, procure **Connection Strings** ou **Connect to your database** e gere as conexões. Copie e guarde em local seguro as duas versões: **pooled** (`DATABASE_URL`) para a aplicação e **direct** (`DIRECT_URL`) para migrações. A [documentação de conexão](https://www.prisma.io/docs/postgres/database/connection-pooling) explica por que a aplicação usa pool e a migração usa conexão direta.
3. Verifique que o banco é **de produção**, separado do desenvolvimento, e que a conta autoriza a migração inicial a criar as tabelas. Confira no painel a política de backup e os controles de gasto disponíveis antes de aprová-los.
4. `DATABASE_URL` vai para as variáveis de Production da Vercel. `DIRECT_URL` fica em um ambiente seguro de release para executar `npm run db:deploy`; não precisa permanecer no runtime da aplicação.

**Me informe:** provedor, nome do projeto/banco, região e se a migração inicial está autorizada. Disponibilize as duas URLs apenas em um local seguro ou insira `DATABASE_URL` diretamente na Vercel. Não envie uma captura de tela mostrando as URLs.

## 4. Upstash Redis: banco e credenciais REST

1. Entre no [Upstash Console](https://console.upstash.com/). Na área **Redis**, clique em **Create Database**, dê um nome, escolha a região principal e confirme o plano. A [documentação de criação](https://upstash.com/docs/redis/overall/getstarted) mostra o fluxo.
2. Abra o banco criado. Em **Details / Connect → REST**, copie `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`. A [documentação da API REST](https://upstash.com/docs/redis/features/restapi#get-started) identifica esses campos. A aplicação precisa de acesso de escrita; o token somente leitura não serve para seus contadores de limite e orçamento.
3. Guarde o token REST como segredo e autorize o plano/custo. Escolha uma região próxima à aplicação e ao banco quando as opções permitirem.

**Me informe:** nome e região do Redis e se o plano está aprovado. Os dois valores REST devem ser inseridos na Vercel ou disponibilizados em local seguro para configuração.

## 5. Upstash QStash/Workflow: token, chaves e agendamento

1. No mesmo [Upstash Console](https://console.upstash.com/), abra **QStash** e selecione a região de produção. Na área **Quickstart**, localize `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY`. Copie os três valores **da mesma região**. A [documentação de segurança](https://upstash.com/docs/qstash/features/security#request-authorization) explica o token; a [documentação de regiões](https://upstash.com/docs/qstash/howto/multi-region) explica o conjunto regional.
2. Autorize o uso do QStash para disparar pesquisas e um agendamento de recuperação **a cada cinco minutos**. Depois que houver URL pública, eu configuro o agendamento para `GET https://SUA_URL/api/cron/outbox`, com `Authorization: Bearer <CRON_SECRET>` encaminhado ao destino. O [guia operacional](../guide.md#7-vercel-production-release) contém o formato completo; o [manual de agendamentos da Upstash](https://upstash.com/docs/qstash/features/schedules) mostra onde gerenciá-los.
3. Confira cota e custo para mensagens, tentativas de entrega e pesquisas. Não use valores do servidor de desenvolvimento local em produção.

**Me informe:** região do QStash e se o uso/agendamento estão aprovados. Insira os três valores como segredos de Production na Vercel ou disponibilize acesso seguro para eu fazê-lo. `CRON_SECRET` será gerado separadamente por mim.

## 6. SerpApi e Firecrawl: somente para dados reais

**Não precisa contratar nem fornecer essas chaves para o primeiro teste em `fixture`.** Se decidir ativar a coleta real mais tarde:

1. **SerpApi:** entre no [painel de chave da SerpApi](https://serpapi.com/manage-api-key) e localize a chave para `SERPAPI_API_KEY`. Aprove plano/cota e, separadamente, o uso e armazenamento pretendidos dos resultados Amazon. A própria [documentação de conta da SerpApi](https://serpapi.com/account-api) identifica a chave como privada.
2. **Firecrawl:** entre no [painel da Firecrawl](https://www.firecrawl.dev/) e abra **API Keys** para criar ou copiar a chave `FIRECRAWL_API_KEY`. Aprove plano/cota e indique os domínios HTTPS específicos cujo conteúdo pode ser coletado e armazenado. A [documentação oficial do painel](https://github.com/firecrawl/firecrawl-docs/blob/main/dashboard.mdx#api-keys) descreve a área de chaves.
3. Antes de ativar qualquer um, registre as aprovações de direitos e orçamento na [seção 2 do checklist](./checklist-publicacao.md#2-decisões-e-aprovações-que-dependem-de-você). Ter a chave não autoriza automaticamente a coleta nem o armazenamento.

**Me informe:** quais provedores foram aprovados, limites de gasto e escopo dos dados permitido. Se nenhum foi aprovado, mantenho `DATA_MODE=fixture` e as duas chaves fora da produção.

## O que me enviar quando terminar

Use este resumo **sem preencher segredos**:

```text
Vercel: conta/equipe, projeto (ou conta pronta para importar), plano aprovado, domínio padrão ou próprio
PostgreSQL: provedor, projeto/banco, região, migração inicial autorizada, URLs guardadas com segurança
Upstash Redis: nome, região, plano aprovado, credenciais REST guardadas com segurança
QStash: região, agendamento de 5 minutos aprovado, token e chaves guardados com segurança
SerpApi/Firecrawl: não aprovados por enquanto ou escopo/custos aprovados separadamente
```

Com esses acessos autorizados, posso configurar a produção e então entregar a URL da API, o token e um `curl` verificado para uso em outra máquina.
