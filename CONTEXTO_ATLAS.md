# CONTEXTO_ATLAS.md

> Documento técnico vivo do Atlas / BDR Gestão.
>
> **Regra:** este é o único arquivo de contexto do projeto. Não criar
> `CONTEXTO_ATLAS_v2.md`, `final`, `corrigido`, `novo` ou cópias
> paralelas. Atualizar sempre este mesmo arquivo.
>
> **Fonte de verdade:** o código e o banco em produção são a fonte de
> verdade. Este documento registra arquitetura, decisões, diagnóstico,
> regras permanentes, estado conhecido e próximos passos. Quando houver
> dúvida, inspecionar os arquivos e o banco antes de alterar.

------------------------------------------------------------------------

## 1. Objetivo do Atlas

O Atlas / BDR Gestão é um sistema web de gestão operacional da BDR
Construart, evoluindo principalmente os módulos de:

-   Estoque
-   Patrimônio
-   Expedição / Transferências
-   Triagem
-   Manutenção
-   Relatórios
-   Usuários, obras e permissões
-   Notificações
-   Romaneio / apoio à emissão de NF-e

O sistema já está em uso real. Toda alteração deve considerar
continuidade operacional, integridade de dados e segurança.

------------------------------------------------------------------------

## 2. Stack e ambientes conhecidos

### Frontend

-   HTML / CSS / JavaScript.
-   Shell principal: `atlas.html?m=modulo`.
-   Menu e topbar fixos, navegação sem reload sempre que possível.
-   Supabase como PostgreSQL e autenticação.
-   GitHub Pages ainda é usado para DEV/produção no estado atual do
    projeto.

### Repositórios

-   DEV: `Saulohenry29/sistemabdr_dev`
-   OFICIAL: `Saulohenry29/sistemaBDR`
-   Estratégia desejada: desenvolvimento local → `origin/dev` → testar
    DEV → promover conscientemente para produção.
-   Nunca misturar automaticamente código antigo com a base limpa.

### Pasta local principal

`C:\Users\saulo\Downloads\atlas_shell_reinicio_limpo`

Pasta antiga, não usar como fonte automática:

`C:\Users\saulo\OneDrive\Documents\sistemaBDR`

### Estado Git no fechamento de 05/10/2026

-   Branch: `dev`
-   `HEAD` local e `origin/dev`: `b55e4e0`
-   Commit:
    `Implementa autenticacao segura e fluxo de ativacao de usuarios`
-   Commit anterior:
    `90f8806 Adiciona imagens de referencia na expedicao e ajustes de patrimonio`
-   Working tree estava limpo antes da criação deste documento.
-   Produção/oficial ainda não deve receber mudanças sem teste em DEV.

------------------------------------------------------------------------

## 3. Regra principal de desenvolvimento

### 3.1 Sem remendos

Não criar:

-   V1 / V2
-   `novo`
-   `final`
-   `corrigido`
-   `fix`
-   patches acumulados
-   arquivos paralelos para substituir arquivo defeituoso

A correção deve ser incorporada diretamente à implementação oficial,
removendo a lógica antiga quando ela deixar de ser necessária.

### 3.2 Diagnóstico antes da alteração

Nunca começar alterando código ou banco apenas porque apareceu uma
mensagem de erro.

Fluxo obrigatório:

1.  Reproduzir e registrar o erro.
2.  Identificar o fluxo real no código.
3.  Mapear todas as dependências/tabelas/operações envolvidas.
4.  Verificar sessão/role quando houver Auth.
5.  Consultar GRANTs.
6.  Consultar RLS.
7.  Consultar policies.
8.  Conferir estado atual dos dados.
9.  Só então propor a menor correção consolidada.
10. Testar o fluxo completo.

### 3.3 Nova regra consolidada: não corrigir tabela por tabela

Quando um erro envolver permissões, autenticação, RLS ou dependências de
um módulo:

**NÃO fazer:**

`erro → GRANT → novo erro → outro GRANT → novo erro...`

**FAZER:**

`erro → mapear fluxo completo → listar tabelas/operações → auditar GRANT/RLS/policies em conjunto → corrigir o conjunto necessário → testar`

Essa regra nasceu durante o diagnóstico do Romaneio e deve ser aplicada
a todos os módulos.

### 3.4 Erro no frontend não significa rollback

Em fluxos com múltiplas gravações, um erro no final da sequência pode
ocorrer depois de alterações anteriores já terem sido confirmadas no
banco.

Regra:

> Antes de repetir uma operação que falhou no frontend, consultar o
> estado real no banco.

O PED-62 é o exemplo canônico: o pedido já havia avançado para
`EM_TRANSITO`, enquanto um item permaneceu em estado anterior por falta
de permissão.

### 3.5 Alertas antes de comandos

Sempre avisar **antes** de qualquer comando que possa alterar:

-   dados
-   schema
-   RLS
-   policies
-   grants
-   funções/RPC
-   triggers
-   constraints
-   arquivos de servidor
-   serviços
-   produção

Para leitura, usar:

`🟢 RISCO ZERO — SOMENTE LEITURA.`

Sempre informar exatamente onde executar:

-   SQL Editor do Supabase
-   Terminal do VS Code / Git Bash
-   PowerShell do Windows
-   SSH / Ubuntu
-   Console do navegador (F12)

------------------------------------------------------------------------

## 4. Segurança: princípio geral

A segurança não pode depender apenas do frontend.

As regras precisam existir no banco/backend quando necessário:

-   Supabase Auth
-   RLS
-   policies
-   RPC/funções transacionais
-   validações no servidor

Esconder botão ou opção no JavaScript não é autorização.

### Delegação limitada

Somente o OWNER absoluto pode conceder qualquer obra/módulo/permissão.

Administradores e demais usuários que possam cadastrar/editar usuários
só podem conceder aquilo que eles próprios possuem.

Essa restrição deve existir também no backend/RLS/RPC para impedir
escalada de privilégio.

------------------------------------------------------------------------

## 5. Supabase Auth --- migração

Estados usados:

`LEGADO → AGUARDANDO_ATIVACAO → ATIVO`

Regras:

-   Usuário em `AGUARDANDO_ATIVACAO` pode continuar a sessão de trabalho
    atual.
-   Somente `ATIVO + auth_user_id` usa plenamente Supabase Auth.
-   Não forçar logout no meio do trabalho.
-   OWNER inicia ativação.
-   Usuário confirma a senha legada atual e cria sua própria nova senha.
-   Administrador não deve conhecer a senha definitiva.

### Usuários confirmados como ATIVO

-   Saulo --- id 1 --- OWNER
-   Thayanne --- id 2
-   Samuel --- id 3
-   Sávio --- id 4
-   Claudenilson --- id 5
-   Pablo --- id 7

Não resetar Claudenilson para LEGADO.

### Rotas de backend conhecidas

-   `POST /api/auth/usuarios/:id/ativar`
-   `POST /api/auth/usuarios/:id/notificar-ativacao`
-   `POST /api/auth/concluir-migracao-legada`
-   `POST /api/auth/concluir-ativacao`
-   `POST /api/auth/usuarios/:id/redefinir-senha`

------------------------------------------------------------------------

## 6. Servidor próprio / arquivos

Servidor Linux conhecido:

-   Ubuntu 26.04.1
-   Node 22.x
-   API de arquivos: `/home/saulo/Atlas/files-api`
-   Serviço: `atlas-files.service`
-   Porta local: `3334`
-   Host público: `https://arquivos.sathtech.com.br`
-   Variáveis protegidas: `/etc/atlas-files.env`

Armazenamento:

`/srv/sathdata/atlas/uploads/`

Pastas conhecidas:

-   avatars
-   patrimonio
-   manutencao
-   expedicao
-   documentos

Nunca expor `service_role`, secrets ou `.env` no frontend/console/Git.

------------------------------------------------------------------------

## 7. Expedição --- fluxo principal

Fluxo de negócio:

`AGUARDANDO_AUTORIZACAO → EM_SEPARACAO → AGUARDANDO_RETIRADA → EM_TRANSITO → AGUARDANDO_CONFERENCIA → RECEBIDO`

Regras importantes:

-   Origem vê a remessa como `EM_TRANSITO`.
-   Destino vê como `A_RECEBER`.
-   Origem não pode confirmar recebimento.
-   Item em trânsito não fica disponível para nova solicitação.
-   Transferência efetiva de estoque ocorre no recebimento.
-   Em trânsito continua representando a realidade logística até a
    confirmação do destino.

### Padrão visual aprovado

O usuário aprovou:

-   modal de remessa em trânsito com progresso horizontal;
-   escolha "Recebido normalmente" / "Recebido com divergência";
-   seleção final do patrimônio: `Em estoque`, `Em uso`, `Manutenção`;
-   modal final de Histórico.

Esse conjunto é referência visual para evoluções futuras.

### Melhoria visual estacionada

PED-58 / separação guiada deve futuramente se aproximar do padrão visual
do modal de trânsito, mostrando claramente a etapa atual:

`Solicitado → Separação → Retirada → Em trânsito → A receber → Recebido`

Não alterar isso durante correções urgentes de segurança/estabilidade.

------------------------------------------------------------------------

## 8. PED-62 --- caso de diagnóstico importante

O PED-62 revelou uma falha não transacional no envio.

Estado parcial observado após erro:

-   `pedidos_retirada`: já estava `EM_TRANSITO`
-   patrimônio: já estava `EM_TRANSITO`
-   `itens_retirada`: ainda estava `RESERVADO`

Causa imediata: falta de permissão para a operação seguinte.

O item 67 foi reparado conscientemente após diagnóstico e ficou:

-   pedido 62
-   status `EM_TRANSITO`
-   reservado `false`
-   usuário retirada `Saulo Henrique`
-   patrimônio id 2709

Depois o fluxo de recebimento foi concluído pela interface.

Resultado final:

-   recebimento concluído;
-   remessa foi para Histórico;
-   patrimônio `PAT-040207 — SMART TV AOC - 43 POL`;
-   destino: `10001 - ADMINISTRATIVO - ADM`;
-   estado final escolhido: `EM USO`.

### Lição arquitetural

O envio ainda executa múltiplas gravações pelo frontend e pode deixar
estado parcial.

O recebimento já usa RPC transacional (`atlas_receber_pedido`) e é o
modelo desejado.

**Melhoria futura prioritária:** transformar o envio em operação
transacional no banco, com notificações somente depois do COMMIT.

------------------------------------------------------------------------

## 9. `itens_retirada` --- estado de segurança conhecido

RLS está ativa.

Policies relevantes criadas/ajustadas:

-   `atlas_auth_select_itens_retirada`
-   `atlas_auth_update_itens_retirada`
-   `atlas_legacy_update_itens_retirada`

`authenticated` recebeu `UPDATE`.

### Dívida de segurança conhecida

Ainda existe policy antiga de SELECT ampla para `anon,authenticated`, o
que pode tornar a policy restrita de SELECT inefetiva por OR entre
policies permissivas.

Também existem privilégios antigos como `TRUNCATE` em várias tabelas.

Não limpar isso durante estabilização urgente. Fazer auditoria geral
planejada.

------------------------------------------------------------------------

## 10. Romaneio --- arquitetura e segurança

Arquivo principal:

`JS/AtlasRomaneio.js`

O Romaneio é um snapshot histórico.

### Operações próprias

`romaneios`:

-   SELECT
-   INSERT
-   UPDATE
-   DELETE de compensação em falha

`romaneio_itens`:

-   SELECT
-   INSERT
-   UPDATE/DELETE permitidos conforme segurança atual

Depois de `fechado_em`, o documento histórico não deve ser reescrito.

### Regra de acesso ao Romaneio

Para transferência **obra A → obra B**:

-   OWNER pode ver.
-   Usuário com acesso à obra A pode ver.
-   Usuário com acesso à obra B pode ver.
-   Usuário que só possui C/D não pode ver.
-   Se o mesmo usuário também tiver A ou B, passa a ter acesso.

Isso protege informações de patrimônio, valores, NF-e, motorista, placa
e logística.

### RLS aplicada

RLS foi ativada em:

-   `romaneios`
-   `romaneio_itens`

Policies para `authenticated` foram criadas para
SELECT/INSERT/UPDATE/DELETE, usando:

-   `atlas_e_owner()`
-   `atlas_tem_acesso_obra(...)`

`romaneio_itens` herda autorização do cabeçalho `romaneios`.

Permissões legadas de `anon` não foram removidas durante a migração para
evitar quebrar usuários ainda legados.

------------------------------------------------------------------------

## 11. Dependências completas do Romaneio

O `AtlasRomaneio.js` usa:

-   empresas
-   entrada_itens
-   entradas
-   estoque_produtos
-   itens_retirada
-   notificacoes
-   obras
-   patrimonio
-   pedidos_retirada
-   produtos
-   romaneio_itens
-   romaneios
-   usuarios_sistema

Esse levantamento é o exemplo oficial da regra "mapear antes de
corrigir".

### Dependências que estavam incompatíveis com Auth

Foram identificadas:

-   `empresas`
-   `produtos`
-   `entradas`
-   `entrada_itens`

O Romaneio usa somente `SELECT` nessas quatro.

### Estrutura relevante

`empresas`: - cadastro global; - não possui `obra_id`; - relação com
obras ocorre por `obras.empresa_id`.

`produtos`: - catálogo global; - não possui empresa/obra; - leitura
autenticada global é coerente com a arquitetura atual.

`entradas`: - possui `empresa_id`; - possui `destino_obra_id`.

`entrada_itens`: - possui `entrada_id`; - possui `produto_id`; - possui
`destino_obra_id`.

Relação de acesso:

`usuario_obras.usuario_id → usuario_obras.obra_id → obras.id → obras.empresa_id → empresas.id`

### Policies adicionadas para leitura autenticada

-   `atlas_auth_select_empresas`
-   `atlas_auth_select_produtos`
-   `atlas_auth_select_entradas`
-   `atlas_auth_select_entrada_itens`

Regras:

-   empresas: OWNER ou empresa ligada a obra acessível;
-   produtos: catálogo global, SELECT para authenticated;
-   entradas: OWNER ou `destino_obra_id` acessível;
-   entrada_itens: OWNER, obra do item acessível ou entrada pai
    destinada a obra acessível.

Somente `SELECT` foi concedido por causa do Romaneio. Não liberar
escrita sem necessidade comprovada.

### Resultado do teste

Após as correções, o Romaneio do PED-62 abriu corretamente.

Dados visualmente confirmados na tela:

-   Romaneio: 62
-   Pedido/Transferência: `TR-20261002-190359`
-   Origem: `641 - FROTA`
-   Destino: `10001 - ADMINISTRATIVO - ADM`
-   Empresa: BDR CONSTRUART
-   Placa: `SPE1A82`
-   Motorista: `SAMUEL`
-   Transportadora: `STRADA`
-   Solicitante: Samuel Silva
-   Patrimônio: `PAT-040207`
-   Descrição: SMART TV AOC - 43 POL
-   Valor BDR: R\$ 1.300,00
-   Valor Romaneio 70%: R\$ 910,00
-   Status fiscal mostrado: `AGUARDANDO NF-e`
-   NCM aparece pendente
-   NF de entrada não apareceu nesse teste

O carregamento ainda mostra "Montando Romaneio" por alguns instantes.
Otimização de performance fica estacionada; não é bloqueio funcional
atual.

------------------------------------------------------------------------

## 12. Tabelas/segurança --- dívidas observadas durante auditoria

Não corrigir automaticamente sem nova auditoria.

### `patrimonio`

Há várias policies antigas e sobrepostas, incluindo policies para
`public` e `anon`. Existe risco de permissividade excessiva.

### `pedidos_retirada`

Há policies antigas amplas, incluindo `pedidos_retirada_all` para
`anon,authenticated`.

### `empresas`

Foi observada policy antiga de DELETE para `public`.

### `produtos`

Antes da policy Auth de SELECT, havia somente policy de DELETE para
`public`.

### Privilégio `TRUNCATE`

`authenticated` aparece com `TRUNCATE` em diversas tabelas. Isso merece
revisão geral.

**Regra:** não fazer uma "limpeza em massa" sem mapear dependências e
usuários legados.

------------------------------------------------------------------------

## 13. Funções de segurança confirmadas

No schema `public`:

-   `atlas_e_owner()` → boolean → SECURITY DEFINER
-   `atlas_tem_acesso_obra(p_obra_id bigint)` → boolean → SECURITY
    DEFINER
-   `atlas_usuario_id()` → bigint → SECURITY DEFINER

Essas funções são componentes centrais da autorização Auth atual.

------------------------------------------------------------------------

## 14. Obras e usuários

Empresa principal conhecida:

-   BDR CONSTRUART --- empresa id 17

Obras conhecidas:

-   id 1 --- CD
-   id 13 --- BWP
-   id 14 --- 641 - FS Primavera / contexto também usado como referência
    histórica; sempre confirmar cadastro atual
-   id 15 --- 736 - Scheffer
-   id 16 --- 732 - FS Armazém IV LRV
-   id 17 --- FROTA
-   id 9 --- 10001 - ADM
-   id 22 --- LABORATÓRIO ATLAS / TESTES
-   id 33 --- SATH

Obras 22/33 são de teste e possuem regras especiais. Antes de alterar
acesso, consultar estado atual no banco.

`usuario_obras` é usado pela segurança para acesso real às obras. Não
confiar apenas em campos de lista no frontend.

------------------------------------------------------------------------

## 15. Notificações

Tabela `notificacoes` é parte importante do fluxo.

Regra desejada:

> Em operações transacionais, gerar notificações somente após COMMIT
> bem-sucedido.

Evitar notificar o próprio executor quando a regra funcional assim
determinar.

Sistema de notificações conhecido como `bdrNotificacoes`.

------------------------------------------------------------------------

## 16. Patrimônio

Regras importantes:

-   Patrimônio baixado não deve compor valor de ativos em uso/ativos
    normais do Dashboard.
-   Transferências devem manter histórico confiável.
-   Imagens genéricas/referência devem usar servidor próprio.
-   Estoque e Patrimônio seguem a mesma filosofia logística, embora
    possam ter mecânicas diferentes.

A faixa antiga "Exibindo 1--30..." foi removida e aprovada. Não
restaurar sem pedido.

------------------------------------------------------------------------

## 17. Git e segurança de segredos

Antes de commit relevante executar:

`node scripts/verificar-segredos.js`

Resultado esperado:

`Verificação de segredos: OK`

Existe hook:

`.githooks/pre-commit`

`.gitignore` protege, entre outros:

-   `node_modules`
-   logs
-   `.env`
-   `.env.*` exceto exemplo permitido
-   certificados/chaves
-   pastas de senhas/segredos
-   credenciais
-   backups/dumps sensíveis

Nunca colocar chave `service_role` no browser/frontend.

------------------------------------------------------------------------

## 18. Fluxo recomendado antes de commit/push

1.  Confirmar que o fluxo foi testado.
2.  Atualizar `CONTEXTO_ATLAS.md`.
3.  `git status --short`
4.  `git diff`
5.  Executar verificação de segredos.
6.  Commit com mensagem clara e sem nomes `v2/final/fix`.
7.  Push para `origin/dev`.
8.  Testar DEV online.
9.  Só depois decidir promoção para produção.

Nunca promover automaticamente para `oficial/main`.

------------------------------------------------------------------------

## 19. Regra de continuidade entre chats

Ao abrir um novo chat:

1.  Fornecer o ZIP/base atual do projeto quando o trabalho depender do
    código.
2.  Fornecer `CONTEXTO_ATLAS.md`.
3.  Pedir para ler este documento antes de alterar código.
4.  Palavra/frase de continuidade sugerida:

**CONTINUAR ATLAS PELO PROMPT MESTRE**

O novo chat deve tratar este documento como contexto operacional, mas
sempre conferir código/banco quando a informação puder ter mudado.

------------------------------------------------------------------------

## 20. Como melhorar o Atlas daqui para frente

### Prioridade 1 --- estabilidade da Expedição

Transformar o envio da remessa em RPC transacional, semelhante ao
recebimento.

Objetivo:

-   pedido;
-   itens;
-   patrimônio;
-   estoque/movimentações;
-   histórico;
-   notificações;

devem obedecer ao princípio **"tudo acontece ou nada acontece"**.

### Prioridade 2 --- auditoria Auth/RLS consolidada

Criar inventário de tabelas por módulo:

-   operações usadas;
-   GRANTs;
-   RLS;
-   policies;
-   dependência de `anon`;
-   dependência de `authenticated`;
-   acesso por obra/empresa;
-   risco de policies permissivas sobrepostas.

Eliminar gradualmente permissões antigas somente depois que todos os
usuários/fluxos necessários estiverem migrados.

### Prioridade 3 --- remover privilégios excessivos

Revisar:

-   `TRUNCATE` para `authenticated`;
-   policies `TO public`;
-   policies `USING (true)` antigas;
-   policies duplicadas/permissivas;
-   CRUD legado de `anon`.

Fazer por módulo, com teste antes/depois.

### Prioridade 4 --- performance do Romaneio

Hoje o Romaneio executa várias consultas sequenciais e mostra "Montando
Romaneio" por alguns instantes.

Melhorias possíveis, depois da estabilidade:

-   medir tempos antes de otimizar;
-   reduzir consultas repetidas;
-   buscar dados em paralelo quando seguro;
-   avaliar RPC/view específica de leitura;
-   reutilizar snapshot fechado sem recompor dados históricos;
-   não otimizar no escuro.

### Prioridade 5 --- histórico patrimonial

Auditar se toda transferência recebida gera o evento esperado no
histórico do patrimônio. No teste do PED-62, o patrimônio terminou
corretamente no destino, mas a tela de histórico patrimonial merece
validação específica antes de afirmar que está completa.

### Prioridade 6 --- UX da Expedição

Levar o padrão visual aprovado do fluxo de trânsito/recebimento para
separação e demais etapas, mantendo progressão clara sem poluir a tela.

### Prioridade 7 --- observabilidade

Para fluxos críticos, evoluir gradualmente para:

-   logs estruturados no backend;
-   identificação de operação/pedido;
-   erro técnico separado de mensagem ao usuário;
-   rastreabilidade de transações;
-   evitar `catch` silencioso.

------------------------------------------------------------------------

## 21. Pendências estacionadas

Não misturar com a tarefa atual sem necessidade:

-   "Esqueci minha senha" para usuário ATIVO com autorização do OWNER.
-   Otimização do tempo de montagem do Romaneio.
-   Evolução visual do PED-58/separação.
-   Auditoria geral de policies antigas.
-   Revisão de `TRUNCATE`.
-   Auditoria do histórico do patrimônio após transferência.
-   Segurança avançada/anti-VPN/desafios.
-   Integração Sienge.
-   Melhorias gerais de Dashboard.
-   Integração completa de NF-e.

------------------------------------------------------------------------

## 22. Estado atual / próximo passo

### Estado confirmado

-   Auth segura já está no commit `b55e4e0` em `origin/dev`.
-   PED-62 concluiu envio/recebimento após reparo do estado parcial.
-   Patrimônio PAT-040207 chegou ao destino e ficou `EM USO`.
-   Romaneio do PED-62 voltou a abrir após auditoria e correção
    consolidada de RLS/GRANTs.
-   A segurança do Romaneio restringe acesso por origem/destino/OWNER.
-   As quatro dependências de leitura do Romaneio foram adaptadas para
    Auth de forma controlada.

### Próximo passo recomendado

No próximo trabalho:

1.  Revisar este documento.
2.  Confirmar `git status`.
3.  Registrar este `CONTEXTO_ATLAS.md` no Git.
4.  Executar `node scripts/verificar-segredos.js`.
5.  Commitar o documento.
6.  Push para `origin/dev`.
7.  Fazer teste online do DEV.
8.  Depois decidir se a próxima prioridade será:
    -   tornar envio transacional;
    -   validar histórico patrimonial;
    -   ou fazer auditoria Auth/RLS por módulo.

------------------------------------------------------------------------

## 23. Princípio final

O Atlas já é um sistema operacional real. A meta não é apenas "fazer
funcionar".

Cada evolução deve buscar:

**funcionar + preservar dados + restringir acesso corretamente + ser
diagnosticável + ser simples de manter.**

Quando houver escolha entre uma correção rápida e uma solução limpa,
primeiro proteger produção e continuidade; em seguida consolidar a
solução correta sem remendos.

## Diagnóstico 2026-10-06 — campos e Expedição
- Cursor: causa comprovada no listener global de `JS/bdrUppercase.js`, que reatribuía `element.value` a cada evento `input` e podia deslocar o cursor ao final. A implementação deve preservar seleção/cursor e evitar reescrever quando o texto já estiver em maiúsculas.
- Filtros pesquisáveis do Patrimônio: os comboboxes exibem o texto da opção selecionada no próprio `input`; ao focar, o texto inteiro deve ficar selecionado para a primeira tecla substituir `Todas/Todos...`, evitando concatenação como `TODAS AS OBRAS/SETORESSAULO`.
- Patrimônio (medição no banco): 2.271 registros; 2.253 ativos; 2.247 elegíveis pela regra atual da Expedição; 2.195 elegíveis com marca+modelo; 28 sem marca; 51 sem modelo.
- Expedição: `atlasBuscarCatalogoCompleto` já pagina em lotes de 1000; portanto o limite PostgREST não deve, por si só, truncar o catálogo atual.
- Imagens de referência: `atlas_imagens_referencia` é carregada e associada por chave marca+modelo. Para tolerar diferenças apenas de acentos, espaços e pontuação, a chave é normalizada antes da comparação.
- Regra de diagnóstico aprendida: em comportamentos globais de formulário, inspecionar `getEventListeners(document)` antes de procurar módulo por módulo.


## Diagnóstico 2026-10-07 — Patrimônio offline e desempenho
- Checkpoint DEV informado pelo usuário: commit `65db806` em `origin/dev`; produção (`oficial`) não foi tocada.
- Cursor/uppercase, filtros pesquisáveis e Obra de lançamento foram testados e aprovados antes desse checkpoint.
- O cadastro offline já possui IndexedDB/fila e foi comprovado funcionando; não criar uma segunda fila/cache paralelo.
- Causa do autopreenchimento incompleto offline: o catálogo de sugestões guardava apenas `id/nome_bem/marca/modelo` e, ao escolher um item, fazia uma nova consulta `.select('*')` ao Supabase. Sem rede, restavam apenas os três campos básicos.
- Correção consolidada: o catálogo reutiliza os patrimônios completos já carregados por `carregarPatrimonios()`/IndexedDB; ao escolher uma sugestão, usa primeiro o registro completo em memória/cache e só consulta o Supabase como fallback quando o registro não existe localmente.
- Melhoria de desempenho do Gerar Patrimônio: uma única decisão de conectividade é obtida no início da gravação e reaproveitada na validação de duplicidade, geração do sequencial e INSERT/fila offline, evitando testes de conectividade repetidos dentro da mesma operação.
- A proteção de duplicidade e a geração de sequencial permanecem preservadas. Não substituir por `maior + 1` puramente local no modo online sem solução transacional/concorrente.
- A ordenação visual das obras foi percebida como não lógica e permanece estacionada para diagnóstico posterior.


### Seletores mobile do cadastro patrimonial (teste local pendente)
- Os selects tipo_item, status_inicial e estado_conservacao mantêm seus valores/eventos originais, mas apresentam opções em menu responsivo no mobile. Desktop mantém selects nativos.
- valor_bem solicita desativação de autocomplete do navegador; navegador pode ignorar essa preferência.
- Testar no Chrome modo dispositivo e no PWA real antes de Git/produção.

- Autocomplete Marca/Modelo: os dois wrappers tinham o mesmo z-index e o segundo (Modelo) encobria a lista do primeiro. A regra oficial agora eleva somente o campo com foco (:focus-within), mantendo os outros atrás; testar visualmente no PWA antes do Git.


## Diagnóstico de histórico de patrimônio — 2026-10-14
- Edição cadastral atualiza `public.patrimonio` e depois grava `CORRECAO_CADASTRAL` em `public.movimentacoes`, em operações separadas. Se a segunda falha, a edição já pode ter sido persistida.
- Erro observado: HTTP 403 / PostgreSQL 42501, `new row violates row-level security policy for table "movimentacoes"`.
- Requisição autenticada com OWNER válido; exemplo patrimônio 3328, empresa 20, obra 33, com payload coincidente.
- `movimentacoes` possui política INSERT para `authenticated` validando patrimônio, empresa e acesso à obra; políticas SELECT existentes são somente para `anon`. A requisição de histórico utilizava `.insert(...).select()` e `Prefer: return=representation`.
- Ajuste mínimo no arquivo oficial `JS/patrimonio/patrimonio.js`: para `movimentacoes`, INSERT sem `.select()`. Outras tabelas mantêm retorno de dados.
- HIPÓTESE A TESTAR: o retorno da linha recém-inserida exigia política SELECT e contribuía para a rejeição RLS. Não considerar resolvido antes de testar no DEV e consultar histórico.
- Pendência de arquitetura: consolidar atualização cadastral e histórico numa transação no servidor, e definir autorização por ação (editar, transferir, inativar), sem permitir acesso indevido entre obras.
- Não criar políticas RLS adicionais às cegas. Não aplicar em produção sem aprovação.

## Preferência de impressão em Minha conta (14/10/2026)
- Primeira etapa DEV: seção **Minhas impressoras** na Minha conta, sem alterar impressão de etiquetas existente.
- Opções: impressora padrão do sistema (seleção inicial) ou NIIMBOT B1 (50 × 30 mm).
- Persistência local por `usuarios_sistema.id` e por origem/navegador em `localStorage` (`atlas:impressora:<id>`); não sincroniza entre dispositivos.
- Seleção da B1 é apenas preferência nesta etapa; **não** conecta Bluetooth nem altera `window.print()`; isso será feito após validação da biblioteca e impressão real.
- Nenhuma alteração de banco de dados, RLS, permissões de obras, impressão convencional ou ambiente de produção.
- Próximos passos: validar visual/salvamento no DEV, integrar driver BLE B1 preservando o modelo original e testar offline, impressão individual e em lote.

## Minha conta — configuração de impressoras e teste BLE (14/10/2026)
- DEV: opções visuais por cartões para impressão convencional ou NIIMBOT B1; preferência existente preservada em `localStorage` por usuário.
- Conexão BLE experimental por `navigator.bluetooth.requestDevice` após clique, filtros `B1`/`NIIMBOT`, GATT connect/disconnect, indicador de estado e tratamento de desconexão. **Não é ainda impressão**; nenhum envio de comandos à impressora.
- A conexão BLE é temporária por página/dispositivo e pode cair em segundo plano. A lista de nomes anunciados deve ser validada em Windows, Android e Bluefy antes de expandir os filtros.
- A impressão convencional (Elgin/HP) permanece intacta; seleção B1 ainda não altera os botões de impressão.
- Sem mudanças em Supabase, RLS, produção ou obras. Próxima etapa: driver B1 e rasterização da etiqueta existente, com teste físico e offline.

## NIIMBOT B1 - primeiro teste físico DEV (14/10/2026)
- Driver original movido da raiz para `JS/impressao/niimbot.js`, carregado em `patrimonio.html`.
- Preferência local `atlas:impressora:<usuario.id>` roteia SOMENTE a impressão individual para a B1; impressoras convencionais continuam em `window.print()`.
- `JS/impressao/atlasEtiquetaImagemB1.js` rasteriza o DOM da etiqueta oficial com SVG foreignObject e escala proporcionalmente para 384x240 pixels (50x30 mm). Imagens incorporadas como data URLs. QR, legibilidade, borda e compatibilidade de navegadores exigem teste físico.
- Um clique inicia pareamento BLE com `Niimbot.connect()`; `printImage()` imprime uma cópia, sem repetição automática. Falha/incerteza exige inspeção física antes de tentar novamente.
- Não há sincronização de preferências entre dispositivos. BLE não é conexão simultânea multiusuário; outros aparelhos precisam se conectar quando a B1 estiver livre.
- Offline NÃO validado; fontes, logo, QR, driver e página precisam estar em cache antes de desconectar a internet.
- NÃO alterar produção, SQL, RLS ou perfil da Elgin/HP. Testar em DEV uma etiqueta antes de avançar para lote.

## NIIMBOT B1 — correção de canvas contaminado (14/10/2026)
- Diagnóstico em teste DEV: conexão BLE ocorreu, mas exportação de SVG `foreignObject` via canvas falhou com `Tainted canvases may not be exported`.
- Substituída integralmente a rasterização por desenho direto no Canvas 2D, usando geometria e estilos computados da etiqueta oficial, imagem da engrenagem e QR existentes; sem `foreignObject`, sem `fetch` adicional, sem alterar o driver BLE ou a impressão padrão.
- Escala proporcional para 384×240 pixels, margem de 4 px; sem retries automáticos.
- **Pendente validar fisicamente**: fidelidade visual (tipografia, espaçamentos, QR legível) e conclusão da impressão B1; se divergente, interromper e ajustar o rasterizador, sem alterar a etiqueta original.
- Risco conhecido: Canvas 2D não reproduz automaticamente todo CSS (letter-spacing e detalhes tipográficos podem variar); validação visual obrigatória antes de produção.


## Diagnóstico Bluefy / iPhone — conexão B1 (14/10/2026)
- Windows Chrome imprime etiqueta individual com sucesso; QR legível. Bluefy detecta a B1, mas a conexão de Minha conta não finalizava nem permitia repetir com clareza.
- A implementação anterior de Minha conta chamava requestDevice sem optionalServices e considerava sucesso apenas pelo GATT conectado, sem validar serviço/characteristic de impressão.
- Corrigido em `MinhaConta/JS/atlasMinhaConta.js`: autoriza serviço GATT NIIMBOT no seletor, verifica characteristic, limpa conexão em falhas, reabilita botão no finally e mostra erro/cancelamento.
- Esta correção não altera driver de impressão, formato da etiqueta, fluxo Elgin/HP, banco ou RLS. Testar em DEV no Bluefy; ainda não validado fisicamente no iPhone.
- Atenção: conexão em Minha conta e driver de impressão são sessões separadas, com possível disputa pelo mesmo periférico; unificar gerenciamento de sessão em evolução posterior.

### Diagnóstico 2026-10-16 — troca obrigatória de senha

- `usuarios_sistema` possui RLS ativo; somente políticas SELECT observadas. A atualização direta do navegador via `.update().select().single()` não é adequada e produziu erro de coerção JSON.
- Pablo Pelle id 35: `auth_status=ATIVO`, `auth_user_id` preenchido, flags de senha provisória ainda ativas. Lucas Souza id 36: `AGUARDANDO_ATIVACAO`, com `auth_user_id`. Lucas Richard id 31: registro LEGADO com mesmo e-mail do id 36; não mesclar/excluir sem análise.
- A página `alterar-senha.html` já usa a sessão Supabase Auth para `auth.updateUser({password})`, seguida da rota autenticada `/api/auth/concluir-ativacao`.
- Correção: após a troca de senha confirmada, a rota conclui as flags `senha_provisoria`, `senha_temporaria`, `trocar_senha` no registro vinculado ao `auth_user_id` autenticado; migração interna também conclui as flags. Exigir ao menos oito caracteres na troca Auth.
- Publicação: alterar-senha.html vai ao frontend DEV; servidor/server.js exige implantação separada no serviço Node backend. Não publicar apenas o frontend sem o backend. Testar primeiro com contas de teste e conferir que as flags mudaram; não gravar senha em texto puro via SQL.
- Pendente: fluxo administrativo de redefinição pelo OWNER ainda requer implementação/auditoria dedicada; não confundir com a troca de senha autenticada entregue aqui.


## Cadastro seguro de novos usuários — implementação local em avaliação (2026-10-20)
- Alterações preparadas em `servidor/server.js` e `JS/atlasUsuarios.js` (não publicadas nem testadas contra o Supabase real).
- Cadastro novo deixa de chamar `atlas_usuarios_salvar(CRIAR)` e passa a exigir Bearer Supabase Auth na rota `POST /api/auth/usuarios`. Nesta primeira etapa, somente OWNER autenticado cria novos usuários.
- Backend verifica formato dos dados, empresa/obras e duplicidades; cria identidade Auth, cadastro Atlas `AGUARDANDO_ATIVACAO` e vínculos em `usuario_obras`; tenta enviar recuperação de senha com redirect configurado para o primeiro acesso. Não cria senha legada.
- A edição de contas existentes continua no fluxo anterior; **a vulnerabilidade de autorização do RPC `atlas_usuarios_salvar` ainda precisa ser corrigida no banco** antes de delegar administração a MASTER.
- PENDENTE: confirmar esquema real das tabelas (`obras`, `usuarios_sistema`, `usuario_obras`, `atlas_usuario_obras`) e permissões do service role; testar envio de e-mail, redirect e conclusão da ativação; validar reversão em falhas parciais; testes OWNER/Master/legado.
- **Não publicar em produção sem esses testes.**


## Administração de usuários delegada — preparação local (2026-10-20)
- Alterações locais ainda NÃO implantadas nem validadas contra Supabase em execução.
- `servidor/server.js`: middleware `contextoAdministrativo` valida executor Auth pelo `auth_user_id`, consulta permissões e vínculos em `usuario_obras` via backend, sem aceitar `p_executor_id` do navegador.
- `POST /api/auth/usuarios`: deixa de exigir exclusivamente OWNER; requer `USUARIOS_CRIAR`, proíbe MASTER/OWNER e concessão de permissões/obras fora do escopo. Cadastro continua exigindo e-mail e usa Auth com convite; não cria senha legada.
- `GET /api/admin/usuarios/:id`: busca dados completos autorizados, sem coluna `senha`. `PATCH /api/admin/usuarios/:id`: atualiza campos cadastrais, status ou permissões com verificações independentes de `USUARIOS_EDITAR`, `USUARIOS_BLOQUEAR` e `USUARIOS_PERMISSOES`; impede editar OWNER, si próprio e MASTER por delegados.
- `JS/atlasUsuarios.js`: seleção de resumo tenta carregar ficha completa; caso indisponível, mantém consulta resumida sem edição; MASTER pode abrir cadastro quando tem `USUARIOS_CRIAR`; alterações cadastrais/permissões delegadas passam pelo backend autenticado.
- LIMITAÇÕES: alteração de vínculos de obras continua bloqueada até existir transação atômica; redefinição de senhas e encerramento de sessões delegados NÃO implementados; histórico administrativo dedicado NÃO implementado; login legado não foi migrado. A proteção do RPC legado `atlas_usuarios_salvar` requer revisão independente, não resolvida por esta alteração.
- Implantar somente em desenvolvimento e testar permissões positivas/negativas, perfis, obras, cadastro Auth e rollback antes de produção.


## Preparação de hierarquia GESTOR (não publicada) — 2026-10-21
- Usuário informou ter executado ADD COLUMN gestor_id bigint e criado FK usuarios_sistema_gestor_id_fkey NOT VALID (convalidated=false). Não há confirmação independente da coluna neste ambiente.
- Proposta: GESTOR só lista subordinados diretos com gestor_id igual ao ID autenticado, perfil ADMIN/ALMOXARIFE e mesma empresa. MASTER mantém listagem por obras compartilhadas; OWNER mantém escopo integral.
- Preparação local: SQL de substituição de atlas_usuarios_listar_autorizados, ajuste de validação de perfil GESTOR no cadastro de OWNER, bloqueio preventivo de criação e edição pelo GESTOR no navegador.
- PENDÊNCIAS BLOQUEANTES: autorização segura de GET/PATCH/DELETE para GESTOR no servidor; atribuição de gestor_id em fluxo autenticado e auditável; verificar políticas RLS e RPCs legadas; testes de integração com contas Auth e legadas; validar troca de senha provisória. Não publicar como funcionalidade concluída.
- Não houve alteração no banco ou deploy por esta preparação.


### Consulta de ficha administrativa pela Edge Function (preparação local, 21/10/2026)
- Implementada localmente a ação POST `acao: consultar` na Edge Function `atlas-admin-usuarios`, com verificação de token Supabase Auth, permissões administrativas e escopo OWNER/MASTER/GESTOR no servidor.
- `JS/atlasUsuarios.js` passa a usar essa ação para carregar fichas resumidas; a resposta mantém `_obras_vinculadas` e não inclui `gestor_id`.
- **Ainda não publicado nem testado em produção.** A edição (PATCH), ativação e migração de senha continuam dependendo da API doméstica.
- Pendência: auditar e migrar edição com transação para vínculos de obras e sincronização de email no Auth; validar catálogo completo de permissões do cadastro.


### Expedição / Patrimônio — revisão local de escopos (22/10/2026)
- Diagnóstico confirmado no catálogo da Thayanne: 126 itens exibidos, 124 associados a `obra_id=1`, um a `8` e um a `20`; rótulos eram inconsistentes porque `patrimonio.localizacao` substituía o nome da obra e o filtro admitia indiscriminadamente `obra_id=1` ou nomes contendo `CD`.
- Alterações locais preparadas, ainda **não validadas funcionalmente**: `expedicaoCore.js` usa nome oficial de `obras`, monta opções pelo ID oficial e limita itens às obras de `usuario_obras` e permissões explícitas `EXPEDICAO_OBRA_<id>` consultadas em `usuarios_sistema` (OWNER global); `patrimonio.js` não descarta destinos expressamente autorizados por divergência com `empresa_id` da sessão.
- Nenhum SQL ou dado alterado. Sintaxe JavaScript validada. Pendência obrigatória antes de publicar: testar com Thayanne as obras 22/33/17, fluxo individual e lote, e verificar que as RPCs do Supabase autorizam a transferência entre empresas quando prevista pela permissão; cliente não substitui validação de acesso no servidor.

### Cadastro seguro — base operacional (preparação local, 22/10/2026)
- Diagnóstico confirmado: `usuarios_sistema` tem `obra_id`, não `obra_operacional_id`; RPC `atlas_admin_criar_usuario` atualmente grava `v_obras[1]` (lista ordenada), ignorando a base escolhida.
- Preparado localmente (não publicado): `JS/atlasUsuarios.js` restringe a base às obras de atuação da empresa selecionada, escolhe automaticamente quando só há uma opção e envia `obra_operacional_id` ao criar.
- Preparado localmente (não publicado): Edge Function `atlas-admin-usuarios` valida base pertencente às obras, coloca a base na primeira posição de `p_obras` e delega catálogo de permissões à RPC (que mantém verificações de catálogo e escopo).
- Script SQL de implantação revisa a função existente **sem mudar a assinatura**, para gravar `p_obras[1]` em `usuarios_sistema.obra_id`; preserva o restante da definição existente e falha se o trecho esperado não existir. Necessário revisar a função vigente antes de executar.
- Pendente: implantação coordenada SQL → Edge Function → frontend; testes reais com conta fictícia, perfil/permissões, uma ou várias obras, troca de senha e edição legada. Não afirmar funcionamento em produção antes dos testes.

## Cadastro e senhas — integração preparada em 2026-10-22 (pendente de implantação)

- Código preparado, não publicado nem testado em ambiente Supabase real.
- Novo funcionário: Edge `atlas-admin-usuarios` cria conta Auth e usa a RPC transacional existente. A base escolhida é enviada primeiro em `p_obras`; o SQL de implantação altera a gravação de `usuarios_sistema.obra_id` para usar `p_obras[1]`, validado como obra permitida. Não acrescenta coluna.
- Formulário restringe a base às obras selecionadas da empresa; com apenas uma obra, seleciona automaticamente. Confere empresa das obras antes de cadastrar.
- Edge de cadastro valida formato das permissões; a RPC existente permanece como catálogo definitivo e autoriza concessões conforme escopo do executor.
- Redefinição de senha passa a ter botão independente no modal do funcionário, visível somente ao OWNER. O backend `atlas-senhas` publicado decide LEGADO ou ATIVO; o JS não migra contas automaticamente. O botão de salvar usuário não redefine senha.
- `atlas-senhas` e `atlas_trocar_senha_legada_segura` não foram modificadas neste pacote. A senha legada permanece em texto claro no mecanismo atual, uma dívida de segurança a eliminar quando terminar a migração.
- A implantação exige revisão do SQL, atualização coordenada da RPC e da Edge de cadastro, validação de sintaxe, testes locais e teste de cadastro controlado. O SQL existente usa substituição exata da definição da RPC e falha sem alterar se o texto não corresponder.
- Não afirmar que o fluxo de troca obrigatória Auth ou legado foi validado ponta a ponta sem teste efetivo.


### Cadastro com base operacional explícita (preparado; não implantado)
- RPC nova `atlas_admin_criar_usuario_com_base` recebe `p_obra_operacional_id` e valida pertencimento a `v_obras`, preservando a função antiga.
- Edge `atlas-admin-usuarios` passa a chamar a nova RPC; implantar SQL antes da Edge.
- SQL não executado; testes reais de Supabase pendentes.
