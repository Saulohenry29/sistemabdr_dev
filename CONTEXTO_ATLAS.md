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


## Expedição — preparação local da permissão (24/10/2026)

- Pedido 55 EXP-2026-561000-89 confirmado EM_TRANSITO de obra 22 para 33, saída por Thayanne; recebimento ainda não registrado.
- Thayanne ID 2 tem acesso a ambas em usuario_obras e Supabase Auth vinculado.
- Nesta etapa, apenas catálogo visual de permissões inclui EXPEDICAO_RECEBER_PROPRIA_REMESSA.
- PENDENTE: validação obrigatória no servidor, seleção segura da obra de destino, conferência física e correção da RPC atlas_receber_pedido. NÃO habilitar ou testar recebimento real ainda.


## Estoque — gerenciador local de estruturas (27/10/2026)

- Analisado ZIP completo `atlas_shell_reinicio_limpo(20261027-181040).zip`: estoque, entrada, enderecamento e prateleiras 3D existem; endereçamento atual usa padrão R-F-P-C-N.
- Alterados diretamente `estoque.html` e `JS/estoque.js` para incluir botão Gerenciar estruturas dentro das ações rápidas e modal com tipos PP/PA/MZ, códigos sequenciais e níveis automáticos `PP01-N01` etc.
- **Somente protótipo operacional de planejamento local:** dados persistidos em `localStorage` sob `ATLAS_ESTRUTURAS_RASCUNHO_LOCAL`, com exportação JSON e exclusão de rascunhos. Não usa Supabase, não altera saldos, não integra ao 3D, não cria endereços reais e não possui vínculo de produto.
- Pendente: validar visualmente na Shell; modelar persistência por obra/empresa, permissões e endereços sem conflito com R-F-P-C-N; backup antes de mudanças de banco; integrar inventário inicial com conferência de saldos, sem duplicação.


### Gerenciador de estruturas — colunas e níveis (27/10/2026)
- Ajuste local em `estoque.html` e `JS/estoque.js`: cadastro de quantidade de colunas (1–100) e níveis (1–30), prévia em matriz, endereços `PP01-C02-N05` e equivalentes PA/MZ. N01 representa o chão.
- PP01 do CD: lateral direita, 12 colunas × 4 níveis = 48 endereços. A orientação física da numeração das colunas ainda depende de confirmação.
- Rascunhos antigos sem campo `colunas` continuam legíveis como 1 coluna, sem alteração automática do armazenamento.
- Sem Supabase, sem movimentação de estoque, sem integração 3D. Testar no navegador antes de publicar.


### Gerenciador de estruturas — orientação espelhada (2026-10-27)
- Acrescentado checkbox **Espelhado** individual por estrutura PP/PA/MZ no rascunho local.
- A prévia exibe colunas na ordem inversa quando marcado, sem renumerar códigos ou alterar endereços, saldos ou produtos.
- O estado `espelhado` é salvo no rascunho local e incluído na exportação JSON; registros antigos sem o campo equivalem a não espelhados.
- Integração com mapa 3D e Supabase continua pendente.


### Gerenciador local — N01 no chão e edição (2026-10-27)
- Checkbox `Nível 01 começa no chão`, marcado por padrão. Desmarcado significa N01 na primeira posição elevada, sem mudar códigos.
- Estruturas existentes sem o campo `nivel01Chao` são interpretadas como N01 no chão.
- Botão Editar permite ajustar rascunhos existentes; aviso de sucesso após criar ou editar. Corrigido alinhamento do checkbox e nomenclatura Porta-Paletes.
- **Limitação conhecida:** prateleiras irregulares (quantidade de níveis diferente por coluna) ainda não são suportadas. Não criar posições físicas inexistentes.
- Apenas localStorage; nenhuma integração com banco, 3D ou saldos.


### Prévia 3D das estruturas locais (2026-10-28)
- Em `prateleiras-3d.html`, botão **Estruturas do CD (teste)** lê `ATLAS_ESTRUTURAS_RASCUNHO_LOCAL` do navegador e desenha PP/PA/MZ no Three.js existente.
- Respeita colunas, níveis, espelhamento e posições inativas. Clique em posição azul consulta código de planejamento. Posição inativa é cinza e não clicável.
- Posicionamento espacial inicial por texto `direita`/`esquerda` e centro; não é levantamento dimensional real do CD. Não persiste nem integra endereços/saldos ao Supabase.
- Modo legado do Endereçamento 3D preservado no botão Ativar 3D.


### Diagnóstico e integração de recebimento de RP na Expedição — 10/11/2026
- Confirmado no ZIP completo de 10/11: cartões RP originados em `atlas_patrimonio_remessas` eram exibidos na aba A receber, mas `atlasAbrirRemessaPatrimonial` não construía ação de recebimento; pedidos comuns PED já possuíam fluxo próprio.
- Correção local, **não publicada**: o modal RP oferece confirmação apenas para a obra operacional destinatária com permissão `PATRIMONIO_MOVIMENTAR`, reutilizando o modal de conferência e a RPC existente `atlas_receber_transferencia_patrimonial`. RP e PED continuam separados. Há revalidação do status antes da RPC, trava contra cliques simultâneos e tentativa de notificar a origem após sucesso. Fora desse escopo, o modal explica por que não há botão.
- CSS da RP usa identificador próprio para não impedir o carregamento do CSS completo do recebimento PED. Incluídas versões dos scripts para evitar cache antigo.
- Otimização pontual: associação dos `itens_retirada` aos `pedidos_retirada` por `Map` em uma passagem, sem mudar consultas nem regras.
- **Pendente:** remessas RP criadas como `AGUARDANDO_EXPEDICAO` ainda precisam da operação de despacho na origem; não há ação correspondente identificada no JS enviado. O modal passa a explicar a pendência, sem atualizar status diretamente no navegador.
- Validações locais: `node --check` sem erro; cenários simulados de autorização, recebimento normal, divergência e cancelamento passaram; visualização em Chromium confirmou botão para destinatário autorizado e aviso para outro operador. Não substituem teste com Supabase real.
- **Pendente:** teste funcional no DEV com usuário operacional da obra de destino; checar RPC/RLS servidor e transição da remessa para Histórico, inclusive divergência, antes de promover ao OFICIAL. A causa maior de lentidão pode incluir a RPC `atlas_contexto_expedicao` chamada individualmente por pedido em trânsito; otimização de rede deve ser planejada separadamente.


## 2026-11-10 — Relatório (remetente) + Romaneio RP vertical — versão piloto DEV
- A consulta de eventos patrimoniais passou a separar **Enviado por** de **Recebido / realizado por**, sem inferir o remetente a partir do recebedor. O remetente da RP vem de `atlas_patrimonio_remessas.enviado_por_nome`; outros eventos usam `enviado_por`, ou o ENVIO registrado para a mesma combinação patrimônio + referência de remessa/pedido. Ausência de prova mostra `—`. Consulta de patrimônios troca o título da nova coluna para **Cadastrado por**.
- Colunas no histórico redistribuídas para 10 posições, com ellipsis e nome completo por `title`, sem alterar o cabeçalho fixo e a paginação. Exportação, impressão de eventos e detalhe aproveitam o remetente auditado quando ele foi encontrado; o Excel mantém campos separados para enviado e recebido. Colunas da impressão de eventos foram reequilibradas para incluir Enviado por.
- `JS/AtlasRomaneio.js`: impressão PED em **A4 retrato**, tabela compactada com todos os dados fiscais preservados em sublinhas; nova visualização de romaneio RP obtida **somente por leitura** de cabeçalho, itens e patrimônio. RP nunca escreve na tabela `romaneios` (atualmente vinculada a PED).
- `JS/patrimonio/patrimonio-remessas.js`: após a RPC criar RP, tentar notificar funcionários com `EXPEDICAO_FISCAL` da empresa para análise de NF-e. Aviso inclui deep link da RP e deduplicação por `tipo + link + destinatário`. RP 22/33 somente pode notificar OWNER. Falha de notificação não desfaz nem duplica remessa; interface apresenta aviso. Não há decisão automática sobre obrigatoriedade fiscal.
- Expedição: link do romaneio no detalhe da RP; deep link `acao=romaneio-rp&remessa=...`; histórico PED/RP em uma ordem por data de recebimento (com fallback para envio/cadastro); confirmação RP apresenta feedback de sucesso antes do recarregamento pesado.
- **Sem SQL nesta entrega**. **Pendências críticas** antes de produção: verificar RLS de `atlas_patrimonio_remessas` e `atlas_patrimonio_remessa_itens` (snapshot de sentinela as mostrava sem RLS), conferir `EXPEDICAO_FISCAL` e acesso por empresa, validar que notificações são gravadas em sessão autenticada; criar fluxo fiscal persistente e transacional para NF-e obrigatória/dispensada, bloqueio de saída e comprovantes. A notificação é uma tarefa informativa, não uma liberação fiscal. Permissões fiscais podem ser lista de tokens ou texto separado por vírgulas/ponto e vírgula; a leitura do cadastro deve respeitar RLS e permissões de obras, que ainda exigem testes reais.
- **Testes locais:** `node --check` para JS, mock Chromium de 30 patrimônios em RP (somente leitura), verificação visual da nova tabela com 10 colunas em 1280/1820 px e nomes longos. Não foram feitos testes com Supabase de produção.


## 10/11/2026 — Correção da autoria de transferência no Relatório (preparação DEV)
- Caso auditado por leitura no Supabase: patrimônio `PAT-7280429` (`patrimonio_movimentacoes.id=37`, `pedido_id=71`) apresenta `solicitado_por=JOAO PAULO SOUZA DE BRITO`, `enviado_por=Saulo Henrique`, `recebido_por=CLAUDENILSON`. A primeira pessoa iniciou a transferência pelo Patrimônio; Saulo realizou etapa de despacho posterior; Claudenilson confirmou o recebimento. Não confundir as três atuações.
- Na coluna **Enviado por** do Histórico, priorizar `solicitado_por` (primeira etapa) quando estiver registrado; para `RP` direta sem esse campo, usar `atlas_patrimonio_remessas.enviado_por_nome`; não deduzir autores apenas a partir da obra. Recebimento mantém `recebido_por`.
- O detalhe e a impressão detalhada mostram também a pessoa do despacho intermediário, quando for diferente da pessoa que iniciou. Exportação Excel preserva ambos separadamente.
- Filtro de funcionário harmoniza maiúsculas, diacríticos e nomes com sobrenomes complementares: `João Paulo Souza` pode corresponder a `JOAO PAULO SOUZA DE BRITO`; abreviações de menos de três palavras não são equiparadas por prefixo por risco de homônimos. Filtro continua subordinado às obras autorizadas e às fontes de eventos selecionadas.
- Mudança somente em `JS/relatorios/relatorios.js`, versão do script em `relatorios.html` e este contexto; sem SQL, sem atualização retroativa de autoria no Supabase, sem mexer no fluxo de remessas ou no romaneio fiscal. Pendência: validar com dados reais no DEV antes de promover ao BDR Gestão OFICIAL.


## 10/11/2026 — Consulta consolidada de atividade de funcionário e ficha de movimentação (DEV)
- Fonte: versão do Relatório corrigido de autoria da transferência, sem alterar Supabase. Arquivos originais atualizados: `JS/relatorios/relatorios.js`, `relatorios.html`, `CSS/relatorios/relatorios.css` e `CONTEXTO_ATLAS.md`.
- **Consulta por pessoa:** quando o campo Funcionário tem seleção e o Tipo de registro está vazio (padrão), as fontes consultadas passam a incluir cadastro de bens e eventos reais de patrimônio/remessa. Busca rápida por nome participante também ativa a pesquisa consolidada. Se a pessoa remover a seleção/pesquisa, volta ao padrão de consultar apenas os patrimônios. Um tipo explicitamente escolhido (ex.: Cadastro ou Histórico) continua sendo respeitado. Busca textual ignora diferenças de acento e caixa. A participação ainda considera `solicitado_por`, `enviado_por`, `recebido_por`, `usuario`, entre outros campos existentes, sem identificar pessoas pelo nome da obra.
- **Resumo contextual:** exibe cadastros efetivamente feitos pelo funcionário, eventos de movimentação com participação, transferências cujo início está atribuído ao funcionário e recebimentos confirmados. Não confundir `responsavel` atual por patrimônio com autor de cadastro. O contador geral de funcionários agora considera todos os participantes auditáveis dos registros filtrados, não apenas o executor final.
- **Detalhes:** ficha organizada com cabeçalho, primeiro e último participantes, trajeto, etapas datadas e campos complementares; dados de aprovação, despacho, motorista/placa, patrimônio, baixa, observação e auditoria continuam disponíveis quando presentes no registro. Os valores exibidos são escapados para HTML; papéis vazios são identificados como não registrados, sem inventar autoria.
- **Layout:** tabela de 10 colunas com `colgroup` sincronizado entre cabeçalho fixo e corpo, descrição menor, origem/destino maiores, separação sutil entre grupos; nomes continuam com ellipsis/tooltip. CSS restrito ao módulo, incluindo responsividade do diálogo. Versões de CSS/JS atualizadas no HTML para evitar cache legado.
- **Testes locais:** `node --check` OK; Chromium com DOM e dados simulados de `PAT-7280429`: consulta padrão, funcionário `JOAO PAULO SOUZA` → `JOAO PAULO SOUZA DE BRITO`, recebedor Claudenilson, diálogo com Saulo como despachante, busca rápida por nome, tipo Cadastro explícito, busca comum por descrição e ausência de exceções JavaScript.
- **Pendências:** conferir em DEV com conexão Supabase e demais tipos de registros, nomes homônimos e autorização por obra; publicar OFICIAL somente após aprovação. Não houve SQL nem alteração dos dados no banco.


### Relatórios — filtros neutros e nomes compactos (10/11/2026)
- A seleção vazia em **Tipo de registro** deve significar **Todos os registros**, combinando cadastro patrimonial (um registro por bem) e histórico real (uma linha por evento), sempre respeitando as obras autorizadas.
- Filtros de funcionário, obra, período, tipo, status e categoria sem seleção não restringem o universo. Uma escolha explícita aplica só o recorte selecionado; usar “Limpar filtros” volta a Todos.
- Busca por João Paulo em qualquer papel registrado (cadastro, solicitação/envio inicial, despacho, recebimento) sem atribuir ao executor intermediário uma solicitação de outro usuário.
- **Somente na tabela**, nomes com mais de duas palavras mostram as duas primeiras + `...`; tooltip e aria-label preservam o nome integral e os documentos exportados permanecem completos. Homônimos que compartilham dois nomes recebem sobrenomes adicionais até distinguir os nomes conhecidos.
- Colgroup espelhado no cabeçalho/corpo: percentuais 8/10/14/9/15/15/10/10/6/3, priorizando Origem/Destino, mantendo tabela com rolagem horizontal em telas estreitas.
- `PATRIMONIO_BAIXADO` é linha sintética de situação atual, não evento histórico: não deve aparecer como movimentação extra no padrão Todos; somente em filtro explícito de BAIXA.
- Não altera schema/RLS, autenticação, permissões, movimentações gravadas ou exportação existente. Validar no VS Code e DEV antes de publicar no oficial.
- Validação executada: `node --check` aprovado; cenário Chromium com dados fictícios validou seleção Todos (cadastros + eventos), João Paulo (envio + recebimento), exclusividade de cadastro, busca rápida, filtro de obra, reset e abreviação com homônimos. Validação com dados reais do Supabase permanece pendente no ambiente DEV.

## 10/11/2026 — Permissões por obra, romaneios e notificações: diagnóstico e correção local

### Decisão de arquitetura (sem nomes de usuários de teste)

- **Owner absoluto:** usuário `usuarios_sistema.id=1` com `owner_sistema=true`, acesso global. `ADMIN`/`MASTER` não adquirem alcance global pelo perfil. Permissões para ações operacionais são separadas da permissão de **consulta**.
- **Obras autorizadas para consulta:** vínculos em `public.usuario_obras` (`usuario_id`, `obra_id`), consultados para o usuário autenticado. `usuarios_sistema.obras_liberadas` pode existir como configuração/cache legado, mas não concede acesso quando divergir da associação confirmada. `atlas_usuario_obras` representa a **obra operacional** na Expedição (papel de origem/destino), não a relação completa de obras consultáveis. O cadastro legado `usuarios_sistema.obra_id` pode ser nulo.
- **Transferências entre obras:** um usuário com acesso efetivo à origem **ou** destino pode consultar/imprimir o romaneio de uma RP/PED. Isso não concede autorização para **receber**, **despachar**, **autorizar** ou **decidir NF-e**, que continuam sujeitos ao papel operacional e permissões próprias. Nunca conceder acesso só por perfil ou empresa.
- **Notificações:** mensagens vinculadas a obras devem ser gravadas e exibidas apenas para destinatários com vínculo à obra de origem/destino pertinente, ou Owner. Avisos gerais sem obra não são confundidos com eventos patrimoniais sem escopo. Quem executa a ação não recebe a própria notificação informativa.
- **Relatórios:** obras disponíveis, patrimônios cadastrados, remessas diretas e movimentações têm de respeitar os vínculos efetivos do usuário. Não embutir exceções por IDs de obras de teste nem por nomes de funcionários; usar contas e obras de teste somente como casos de validação.

### Evidência do Supabase (consultas SELECT, sem SQL de alteração)

- Foi confirmada divergência em um usuário de teste: `usuarios_sistema.obras_liberadas` apresentava **22 e 33**, `usuario_obras` apresentava **22 e 33**, porém `atlas_usuario_obras` continha somente **22**. `usuarios_sistema.obra_id` estava nulo. Essa divergência foi um indício para falha do filtro de Relatórios; as três fontes têm finalidades distintas, não podem ser intercambiadas para conceder acesso.
- Remessa `atlas_patrimonio_remessas.id=2` possui origem **33**, destino **22**, status `EM_TRANSITO`. A Expedição permitia visualizar a RP e o romaneio negava com mensagem de escopo, porque o frontend bloqueava hardcoded ambas as obras para não-Owner.
- Em `notificacoes`, as linhas **934** e **922** foram realmente gravadas com `usuario_destino_id=4`, `obra_origem_id=14`, `obra_destino_id=14`, para patrimônio da obra **14**, embora o destinatário consultado tivesse vínculos **22/33**. Não era apenas a apresentação no sininho.
- `JS/patrimonio/patrimonio.js` selecionava destinatários de exclusão/reativação por `empresa_id` e `RECEBER_NOTIFICACOES`, **sem verificar obra**. `JS/bdrNotificacoes.js` listava as notificações pelo ID do usuário sem filtro posterior de obra. `JS/patrimonio/patrimonio-remessas.js` também tinha caminhos de INSERT direto que ignoravam a decisão central.
- Policies identificadas: `patrimonio` possui policies permissivas `true` inclusive `anon`; `patrimonio_movimentacoes` permite `SELECT/INSERT/UPDATE` amplo para `anon,authenticated`; `notificacoes` e `bdr_notificacoes` têm operações amplas com condições `true`. Policies permissivas combinam-se por **OR**; uma policy restritiva adicional não garante isolamento enquanto outras estiverem abertas. `usuario_obras` tem SELECT autenticado para `(usuario_id=atlas_usuario_id() OR atlas_e_owner())`, e SELECT amplo para `anon`. As políticas exatas e os GRANTs/RPCs precisam ser auditados em conjunto antes de intervenção.

### Alterações locais preparadas a partir do ZIP completo de 10/11/2026 (NÃO publicadas)

- `JS/relatorios/relatorios.js`: consulta `usuario_obras` antes do carregamento patrimonial; sem vínculo, nenhum bem/obra é incluído; ao consultar obras/histórico aplica filtro para os IDs vinculados. Retirados filtros fixos de obras 22/33 e fallback ADMIN/MASTER que transformava acesso em privilégio global. Owner preservado. `relatorios.html` recebeu versão de script para evitar cache antigo.
- `JS/AtlasRomaneio.js`: RP e PED consultam `usuario_obras` do usuário antes de abrir documento. A RP não escreve em `romaneios`; PED verifica escopo antes de iniciar `obterRomaneio` (que pode atualizar snapshot). Não se remove permissão operacional de recebimento. `JS/expedicao/expedicaoBoot.js` atualiza query de versão.
- `JS/patrimonio/patrimonio.js`: destinatários de exclusão/reativação precisam ter vínculo à obra do patrimônio. Se a consulta falha, não tenta notificar toda a empresa.
- `JS/atlasGestorNotificacoes.js`: valida vínculo do destinatário com origem/destino antes de INSERT de notificação com obra; a permissão global por `MASTER` foi retirada. Se RLS impedir consultar o destinatário/vínculo, falha **fechada** e registra aviso no console.
- `JS/patrimonio/patrimonio-remessas.js`: removidos INSERTs diretos de fallback para notificações operacionais, que contornavam as regras do Gestor. Reorganizado aviso de Expedição via Gestor e vínculos. Romaneio fiscal de RP deixa de ter exclusão fixa por obra de teste, mas destinatário só recebe com permissão fiscal **e** vínculo confirmado.
- `JS/atlasWorkflowManutencao.js`: notificações de manutenção passam a levar a obra da OS/patrimônio; sem obra identificável, não são enviadas indiscriminadamente por empresa. `manutencao.html` recebeu versão atualizada do script.
- `JS/bdrNotificacoes.js`: lista do sininho filtra pelo vínculo `usuario_obras` com consulta periódica; notificações antigas indevidas deixam de aparecer ao usuário não-Owner. Realtime deixa de reproduzir um aviso antes da validação de obra. Notificações gerais sem obra ainda são permitidas se não tiverem referência operacional ambígua. Arquivos HTML relacionados atualizados somente nos parâmetros de cache das dependências.
- Nenhuma SQL de alteração executada; nenhuma exclusão/reclassificação retroativa de notificação; nenhuma mudança de usuário/perfil/grants/RLS em produção. Pacote local para teste, **não aprovado para OFICIAL**.

### Limitações importantes e pendências de segurança

1. **Crítica — proteção real da API:** a filtragem JavaScript **não é controle de segurança suficiente** com policies RLS amplas. Preparar numa etapa separada, sob autorização explícita e após inventário conjunto de GRANTs, Auth, políticas, triggers e RPCs, a mudança no PostgreSQL que valide destinatário, obra e identidade no servidor. **NÃO executar DROP POLICY/REVOKE às cegas**, pois o legado ainda usa `anon`.
2. A rotina central de envio consulta usuários/vínculos com as políticas atuais. Um usuário não-Owner pode não conseguir ler a associação de outro usuário, mesmo legítimo; nesse caso a notificação **não é enviada** em vez de gerar vazamento. Requer função/RPC segura no servidor para geração/recuperação de destinatários com RLS apropriada, e testes de contas distintas.
3. `bdr_notificacoes` e fluxos legados que gravam fora do Gestor ainda precisam de auditoria antes da liberação em produção. Corrigir apenas a tabela `notificacoes` não elimina as policies permissivas das demais tabelas.
4. Relatórios e outros módulos ainda possuem operações de consulta legadas e filtros de interface. Até RLS correta, um cliente que invoque Supabase diretamente pode contornar o filtro visual. Avaliar consultas escopadas no servidor para todo o histórico, inclusive `patrimonio_movimentacoes`, remessas e itens.
5. Fazer testes reais em DEV com pelo menos três perfis: Owner; funcionário com acesso à origem/destino; funcionário sem acesso. Verificar listagem de obras, cadastros e histórico, abertura/impressão de RP/PED, recebimento restrito ao destino, notificações antigas e novas, Realtime/áudio, trocas de obra/empresa e casos de falha de consulta.
6. Não afirmar que a versão local corrigiu a segurança do Supabase; a revisão da RLS é etapa obrigatória ainda pendente.

------------------------------------------------------------------------

## Romaneio patrimonial — implementação do layout e assinaturas (10/11/2026)

### Decisão funcional aprovada

- Modelo A4 vertical, seguindo a referência visual BDR | Atlas: cabeçalho compacto, remessa/data/status, origem/destino, transporte, tabela detalhada e rodapé de consulta.
- **Não** imprimir blocos separados de “Observações” ou “Situação fiscal”; as informações fiscais e eventuais NF-e permanecem na operação administrativa do Atlas.
- Relação de patrimônios com PAT, descrição, marca/modelo/série/chassi/placa/RENAVAM/código de insumo quando presentes, quantidade/unidade, NCM, nota de entrada e valor patrimonial existente; nunca inventar dados fiscais faltantes.
- Total de patrimônios discreto. Para muitos bens, a tabela continua nas páginas seguintes, com as assinaturas no final do documento.
- Assinaturas exigidas pelo processo operacional: **responsável pela saída** e **motorista**. O recebimento no destino continua em **Expedição → A receber → Confirmar recebimento**, sem assinatura no romaneio. A remessa só passa a RECEBIDO pelo fluxo normal de recepção; assinatura não muda automaticamente o status.
- O romaneio é **documento operacional, não fiscal**. A tela fiscal de PED continua existente e separada. Estar no mesmo município **não determina, por si só**, dispensa de NF-e.
- Consulta/impressão permitidas por vínculo autorizado à obra de origem **ou** destino. Assinar saída e gerar link para motorista exigem vínculo à **obra de origem** ou Owner. Somente o Owner possui acesso global.

### Alterações técnicas nesta entrega — arquivos do projeto

- `JS/AtlasRomaneio.js`: interface A4 dos romaneios RP, acesso ao documento de transporte PED sem substituir as rotinas fiscais existentes, painel de assinaturas, QR de **consulta autenticada** do documento, captura por canvas, uso opcional de assinatura pessoal salva, impressão e atualização de assinaturas reais.
- `JS/expedicao/expedicaoBoot.js` e `expedicao.html`: versões de scripts atualizadas para evitar o cache antigo.
- `assinatura-romaneio.html` (**nova funcionalidade**): página independente para o motorista com link de uso único, lista dos itens, aceite explícito e assinatura desenhada no celular. O token é removido da URL visível após a abertura.
- `sql/atlas_romaneio_assinaturas.sql` (**migração proposta, NÃO EXECUTADA**): tabelas privadas com RLS e RPCs de autorização, leitura, assinaturas e links de motorista. A migração **não** é parte das mudanças já aplicadas no Supabase.

### Garantias e limites

- Apenas assinaturas lidas de RPC segura, correspondentes à versão corrente do documento, são mostradas como válidas e impressas. Assinaturas ausentes/inválidas aparecem como **pendentes**. Sem migração validada, a impressão A4 funciona, mas as opções de assinar ficam indisponíveis.
- A assinatura fica vinculada à versão dos bens/rotas e aos campos relevantes do documento; versões anteriores são preservadas por registros separados. Alterações de bens invalidam a assinatura para a nova versão, exigindo nova confirmação.
- Assinatura do motorista por link comprova ação com token e traço capturado, mas **não verifica identidade civil do motorista**; não constitui, por si só, assinatura eletrônica qualificada.
- O QR no documento impresso abre a rota autenticada do Atlas. Não é um serviço público de validação criptográfica e não deve ser descrito como prova de autenticidade independente.
- A migração SQL proposta utiliza somente `auth.uid()` para assinar a saída; usuários exclusivamente legados precisam ser migrados para o Supabase Auth. A migração exige revisão técnica de schema, RLS/GRANTs, testes em DEV e aprovação explícita antes da execução.
- A revisão RLS geral de Patrimônio/Notificações identificada em 10/11 continua pendente. Este trabalho não a corrige e não deve ser promovido ao oficial sem avaliação de segurança.

### Evidências dos testes isolados

- Sintaxe JavaScript validada com Node.
- Teste de interface no Chromium com dados **simulados** da remessa RP-2: 2 patrimônios, transportador, status EM_TRANSITO, duas áreas de assinatura, link e QR de motorista, atualização de assinatura assinada.
- PDF de validação A4 vertical de 1 página gerado em Chromium e renderizado para conferência visual. Nenhum dado real de produção foi alterado.
- **Pendentes antes de implantação:** executar/validar a migração em DEV após aprovação, testar com Auth real, tokens expirados/reutilizados, permissão origin/dest, múltiplas páginas, recebimento e assinatura no celular. Nada da assinatura foi testado com o Supabase real.


### Revisão local 11/11/2026 — Relatórios e abas do romaneio (não publicada)
- CSS dos Relatórios: removidas somente as divisórias **verticais** da tabela de movimentações; mantidos os espaçamentos, linhas horizontais e indicador lateral da linha.
- `JS/AtlasRomaneio.js`: abas Documento A4 / Assinaturas com alinhamento e altura uniformes. Não altera impressão nem fluxo de recebimento.
- O Atlas local e o oficial utilizam **o mesmo projeto Supabase**: não há banco DEV isolado. **Não executar** `sql/atlas_romaneio_assinaturas.sql` nesse banco até haver homologação isolada, backup, revisão das funções e autorização expressa.
- Consulta de esquema confirmou `atlas_patrimonio_remessa_itens.codigo_qr`, `.nome_bem` e `patrimonio.valor_aquisicao`. A migração proposta ainda usa `patrimonio.valor_bem` (incompatível com o esquema informado), além de referências não confirmadas como `patrimonio.ncm`, `patrimonio.numero_nfe` e colunas de `pedidos_retirada`.
- Pendências: confirmar o esquema de `pedidos_retirada`, revisar autorização de quem pode assinar a saída, testar bloqueios de acesso direto/RLS, token do motorista e imutabilidade antes de executar SQL. Nenhuma migração foi aplicada nesta revisão.
- A publicação isolada do CSS de Relatórios é independente da ativação de assinaturas. Não promover scripts/SQL de assinaturas como funcionalidade habilitada.

### Segunda revisão — 11/11/2026, antes da publicação Git (ainda não publicada)

- Fonte: ZIP completo `atlas_shell_reinicio_limpo (3)(8).zip`, comparado ao pacote visual `Atlas_Ajustes_Relatorios_Abas_20261111.zip`.
- `CSS/relatorios/relatorios.css`: corrigida a regressão da primeira revisão, que alterava para azul a faixa lateral da tabela. Mantido **3px vermelho #b51621** no primeiro campo de cada linha; somente divisórias verticais internas removidas. Larguras, espaçamento e bordas horizontais preservados.
- `JS/AtlasRomaneio.js`: abas `Documento A4` e `Assinaturas` alinhadas e com altura mínima 46px, ambas na mesma linha inclusive em viewport estreito, com rolagem horizontal quando necessário. Não afeta PDF nem recebimento da Expedição.
- Evidências: `node --check` em `JS/AtlasRomaneio.js` e scripts dos Relatórios; Chromium em 1440px e 375px verificou computed styles da borda vermelha e ausência de divisórias, e igualdade de altura/posição das abas. **Não houve teste de autenticação Supabase com usuários reais**, nem execução de SQL.
- Publicação: esse pacote revisado contém somente 3 arquivos editados (CSS, Romaneio JS e este contexto). A correção de consulta para não-Owner está no `JS/relatorios/relatorios.js` do projeto completo, **não é implementada pelo CSS**. Ao comparar com Git DEV/OFICIAL, publicar também os arquivos atuais do módulo Relatórios que diferirem do ramo-alvo, depois de revisar o diff, sem incluir a migração de assinaturas.
- Pendências críticas: Supabase compartilhado entre local e produção; RLS permissivas e `sql/atlas_romaneio_assinaturas.sql` ainda incompatível com parte do esquema confirmado. **Não executar a migração nem afirmar segurança de acesso só com filtro client-side.**
