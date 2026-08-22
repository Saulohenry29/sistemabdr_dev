(function(global){
  "use strict";
  if(global.AtlasUsuarios?.loaded) return;

  const STATE={users:[],works:[],companies:[],profiles:[],selected:null,draft:null,page:1,pageSize:10,table:"usuarios_sistema",dirty:false,worksDraft:new Set(),expeditionWorksDraft:new Set()};
  const OWNER_ID=1;
  const $=(s,c=document)=>c.querySelector(s); const $$=(s,c=document)=>[...c.querySelectorAll(s)];
  const db=()=>global.client||global.supabaseClient||null;
  const norm=v=>String(v??"").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const current=()=>{try{return JSON.parse(localStorage.getItem("usuario_logado")||localStorage.getItem("usuarioLogado")||"null")}catch{return null}};
  const currentIsOwner=()=>Number(current()?.id)===OWNER_ID;
  const LEGACY_MODULE_MAP={
    DASHBOARD:"DASHBOARD_VER",
    ENTRADA:"ENTRADA_VER",
    TRIAGEM:"TRIAGEM_VER",
    ESTOQUE:"ESTOQUE_VER",
    PATRIMONIO:"PATRIMONIO_VER",
    MANUTENCAO:"MANUTENCAO_VER",
    EXPEDICAO:"EXPEDICAO_VER",
    RELATORIOS:"RELATORIOS_VER",
    MOVIMENTACOES:"MOVIMENTACOES_VER",
    EMPRESAS:"EMPRESAS_VER",
    USUARIOS:"USUARIOS_VER",
    CONFIGURACOES:"CONFIGURACOES_VER"
  };
  const LEGACY_MODULE_TOKENS=new Set(Object.keys(LEGACY_MODULE_MAP));

  const EXPEDICAO_OBRA_PREFIX="EXPEDICAO_OBRA_";

  function obraIdDaPermissaoExpedicao(token){
    const texto=String(token||"").trim().toUpperCase();
    if(!texto.startsWith(EXPEDICAO_OBRA_PREFIX)) return null;
    const id=Number(texto.slice(EXPEDICAO_OBRA_PREFIX.length));
    return Number.isFinite(id)&&id>0?id:null;
  }

  function permissoesObrasExpedicao(permissoes){
    return new Set(
      [...(permissoes||[])]
        .map(obraIdDaPermissaoExpedicao)
        .filter(Boolean)
        .map(String)
    );
  }


  const permsOf=u=>new Set(
    String(u?.permissoes||"")
      .split(",")
      .map(x=>x.trim())
      .filter(Boolean)
      .filter(x=>!LEGACY_MODULE_TOKENS.has(norm(x)))
  );

  function normalizarPermissoesPerfilRapido(valor){
    const saida=new Set();

    String(valor||"")
      .split(",")
      .map(x=>x.trim())
      .filter(Boolean)
      .forEach(item=>{
        const chave=norm(item);
        saida.add(LEGACY_MODULE_MAP[chave]||item);
      });

    return [...saida];
  }
  const initials=n=>String(n||"U").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
  const workText=id=>{const w=STATE.works.find(x=>String(x.id)===String(id));return w?`${w.codigo_obra||w.codigo||"-"} - ${w.nome||"-"}`:"Sem obra principal"};
  const currentId=()=>Number(current()?.id||0);
  const hasCurrentPerm=perm=>permsOf(current()).has(perm);

  /*
    Responsabilidades separadas:
    - USUARIOS_EDITAR: dados cadastrais de OUTROS usuários.
    - USUARIOS_PERMISSOES: permissões/obras de OUTROS usuários.
    - Ninguém, exceto OWNER ID 1, eleva o próprio acesso.
  */
  const canEditUsers=()=>currentIsOwner()||hasCurrentPerm("USUARIOS_EDITAR");
  const canManagePermissions=()=>currentIsOwner()||hasCurrentPerm("USUARIOS_PERMISSOES");
  const isOwnSelected=()=>Number(STATE.selected?.id||0)===currentId();
  const selectedIsOwner=()=>Number(STATE.selected?.id||0)===OWNER_ID;
  const canEditSelected=()=>currentIsOwner()||(canEditUsers()&&!isOwnSelected()&&!selectedIsOwner());
  const canManageSelectedAccess=()=>currentIsOwner()||(canManagePermissions()&&!isOwnSelected()&&!selectedIsOwner());
  const canCreateUsers=()=>currentIsOwner()||hasCurrentPerm("USUARIOS_CRIAR");

  /*
    Preferências pessoais:
    - o próprio usuário pode ajustar somente suas notificações;
    - permissões, perfil e obras continuam protegidos;
    - administradores autorizados podem ajustar notificações de terceiros.
  */
  const canManageSelectedNotifications=()=>
    currentIsOwner() ||
    isOwnSelected() ||
    canManageSelectedAccess();

  const canManage=()=>canEditSelected()||canManageSelectedAccess();

  const PERMISSION_MODULES=[
    {id:"GERAL",title:"🧭 Acesso geral",items:[["DASHBOARD_VER","Dashboard"],["RELATORIOS_VER","Relatórios"],["VALORES_VER","Ver valores"]]},
    {id:"PATRIMONIO",title:"📦 Patrimônio",items:[["PATRIMONIO_VER","Visualizar / consultar"],["PATRIMONIO_CRIAR","Cadastrar"],["PATRIMONIO_EDITAR","Editar dados"],["PATRIMONIO_MOVIMENTAR","Movimentar"],["PATRIMONIO_IMPRIMIR","Imprimir etiquetas"],["PATRIMONIO_EXCLUIR","Excluir/inativar"],["CONFIGURAR_ETIQUETAS","Configurar etiquetas"]]},
    {id:"MANUTENCAO",title:"🔧 Manutenção",items:[["MANUTENCAO_VER","Acessar manutenção"],["MANUTENCAO_CRIAR","Enviar para manutenção"],["MANUTENCAO_SAIDA","Registrar saída / gerar link"],["MANUTENCAO_ANALISAR_ORCAMENTO","Analisar orçamento / laudo"],["MANUTENCAO_APROVAR","Aprovar, recusar ou pedir ajuste"],["MANUTENCAO_RECEBER","Registrar recebimento"],["MANUTENCAO_PREVENTIVA_GERENCIAR","Gerenciar manutenção preventiva"]] },
    {id:"EXPEDICAO",title:"🚚 Expedição",access:"EXPEDICAO_VER",items:[["SOLICITAR_MATERIAL","Novo pedido"],["APROVAR_PEDIDO_ORIGEM","Aprovar ou recusar"],["SEPARAR_PEDIDO","Separar pedido"],["EXPEDICAO_TRANSPORTE","Retirada e transporte"],["ENTREGAR_MATERIAL","Entregar/enviar"],["CONFERIR_MERCADORIA","Receber e conferir"]]},
    {id:"ESTOQUE",title:"📚 Estoque / Entrada",items:[["ESTOQUE_VER","Acessar estoque"],["ESTOQUE_ENTRADA","Entrada"],["ESTOQUE_SAIDA","Saída"],["ESTOQUE_TRANSFERIR","Transferir"],["ENTRADA_VER","Tela de entrada"],["TRIAGEM_VER","Triagem"]]},
    {id:"EMPRESAS",title:"🏢 Empresas / Obras",items:[["EMPRESAS_VER","Visualizar"],["EMPRESAS_CRIAR","Criar"],["EMPRESAS_EDITAR","Editar"],["EMPRESAS_INATIVAR","Inativar/reativar"],["EMPRESAS_EXCLUIR","Excluir"]]},
    {id:"USUARIOS",title:"👥 Usuários / Administração",items:[["USUARIOS_VER","Visualizar usuários"],["USUARIOS_CRIAR","Criar usuários"],["USUARIOS_EDITAR","Editar usuários"],["USUARIOS_BLOQUEAR","Bloquear usuários"],["USUARIOS_PERMISSOES","Gerenciar permissões"],["CONFIGURACOES_VER","Configurações"]]}
  ];

  const OPTIONAL_NOTIFS=[
    {id:"PATRIMONIO",title:"📦 Patrimônio",items:[["NOTIF_PATRIMONIO_CRIACAO","Criação de patrimônio"],["NOTIF_PATRIMONIO_ETIQUETA","Impressão de etiqueta"],["NOTIF_PATRIMONIO_MOVIMENTACAO","Movimentação"],["NOTIF_PATRIMONIO_STATUS","Excluir, inativar e reativar"]]},
    {id:"MANUTENCAO",title:"🔧 Manutenção",items:[["NOTIF_MANUTENCAO_NOVA_ORDEM","Nova ordem de manutenção"],["NOTIF_MANUTENCAO_ORCAMENTO","Orçamento recebido, aprovado ou ajustado"],["NOTIF_MANUTENCAO_STATUS","Mudanças no andamento do serviço"],["NOTIF_MANUTENCAO_RETORNO","Recebimento, divergência e finalização"],["NOTIF_MANUTENCAO_PREVENTIVA","Lembretes de manutenção preventiva"]]},
    {id:"ESTOQUE",title:"📚 Estoque",items:[["NOTIF_ESTOQUE_MOVIMENTACAO","Entradas e saídas"],["NOTIF_ESTOQUE_BAIXO","Estoque baixo"]]},
    {id:"INVENTARIO",title:"📋 Inventário",items:[["NOTIF_INVENTARIO_ANDAMENTO","Andamento e divergências"],["NOTIF_INVENTARIO_FINALIZADO","Inventário finalizado"]]}
  ];

  const OPERATIONAL_NOTIFS=[
    {perm:["APROVAR_PEDIDO_ORIGEM","EXPEDICAO_APROVAR"],notif:"NOTIF_EXPEDICAO_PEDIDOS",label:"Novo pedido para aprovação"},
    {perm:["APROVAR_PEDIDO_ORIGEM","EXPEDICAO_APROVAR"],notif:"NOTIF_EXPEDICAO_APROVACAO",label:"Aprovação ou recusa"},
    {perm:["SEPARAR_PEDIDO","EXPEDICAO_SEPARAR"],notif:"NOTIF_EXPEDICAO_SEPARACAO",label:"Pedido autorizado para separação"},
    {perm:["EXPEDICAO_TRANSPORTE","ENTREGAR_MATERIAL","EXPEDICAO_ENTREGAR"],notif:"NOTIF_EXPEDICAO_TRANSPORTE",label:"Retirada e em trânsito"},
    {perm:["SOLICITAR_MATERIAL","CONFERIR_MERCADORIA","EXPEDICAO_RECEBER"],notif:"NOTIF_EXPEDICAO_RECEBIMENTO",label:"Recebimento e divergência"}
  ];

  function toast(msg){let t=$("#atlasUsersToast");if(!t){t=document.createElement("div");t.id="atlasUsersToast";t.className="atlas-toast";document.body.appendChild(t)}t.textContent=msg;t.classList.add("show");clearTimeout(global.__uToast);global.__uToast=setTimeout(()=>t.classList.remove("show"),3200)}
  function modal(id,open){const el=$("#"+id);if(el)el.hidden=!open}
  function setDirty(v=true){
    STATE.dirty=v;
    $("#pendingChangesText").textContent=v?"Alterações ainda não salvas":"Nenhuma alteração pendente";
    if($("#btnSalvarPermissoes")){
      $("#btnSalvarPermissoes").disabled=
        !STATE.selected ||
        !(canManageSelectedAccess() || isOwnSelected());
    }
  }

  async function loadSafe(table,order="nome"){try{const r=await db().from(table).select("*").order(order);if(r.error)throw r.error;return r.data||[]}catch(e){console.warn("Atlas Usuários:",table,e.message||e);return[]}}
  async function load(){if(!db())throw new Error("Supabase não carregado.");STATE.users=await loadSafe("usuarios_sistema","nome");if(!STATE.users.length){STATE.table="usuarios";STATE.users=await loadSafe("usuarios","nome")}STATE.works=await loadSafe("obras","nome");STATE.companies=await loadSafe("empresas","nome");STATE.profiles=await loadSafe("perfis_rapidos","id");STATE.profiles=STATE.profiles.filter(p=>p.ativo!==false);fillFilters();renderUsers();renderProfiles();document.documentElement.classList.remove("atlas-users-loading")}

  function visibleUsers(){return STATE.users.filter(u=>currentIsOwner()||Number(u.id)!==OWNER_ID)}
  function filteredUsers(){const term=norm($("#filtroBusca").value);const pf=norm($("#filtroPerfil").value);const work=$("#filtroObra").value;const st=$("#filtroStatus").value;return visibleUsers().filter(u=>(!term||norm(`${u.nome} ${u.usuario} ${u.email}`).includes(term))&&(!pf||norm(u.perfil)===pf)&&(!work||String(u.obra_id)===String(work))&&(!st||(st==="ATIVO")===(u.ativo!==false)))}
  function fillFilters(){const perf=[...new Set(visibleUsers().map(u=>String(u.perfil||"").trim()).filter(Boolean))].sort();$("#filtroPerfil").innerHTML='<option value="">Todos os perfis</option>'+perf.map(p=>`<option>${esc(p)}</option>`).join("");$("#formPerfil").innerHTML=perf.map(p=>`<option>${esc(p)}</option>`).join("")||'<option>OPERADOR</option>';const opts=STATE.works.map(w=>`<option value="${w.id}">${esc(workText(w.id))}</option>`).join("");$("#filtroObra").innerHTML='<option value="">Todas as obras</option>'+opts;$("#formObra").innerHTML='<option value="">Selecione</option>'+opts;$("#formEmpresa").innerHTML='<option value="">Selecione</option>'+STATE.companies.map(e=>`<option value="${e.id}">${esc(e.nome||e.razao_social||e.id)}</option>`).join("")}

  function renderPagination(totalPages){
    const box = $("#paginacaoUsuarios");
    if(!box) return;

    if(totalPages <= 1){
      box.innerHTML =
        `<button type="button" class="active" data-page="1">1</button>`;
      return;
    }

    const currentPage = STATE.page;
    const pages = [];

    const addPage = page => {
      if(page >= 1 && page <= totalPages && !pages.includes(page)){
        pages.push(page);
      }
    };

    addPage(1);
    addPage(currentPage - 1);
    addPage(currentPage);
    addPage(currentPage + 1);
    addPage(totalPages);

    pages.sort((a,b)=>a-b);

    let html = `
      <button type="button"
              data-page="${currentPage - 1}"
              ${currentPage <= 1 ? "disabled" : ""}
              aria-label="Página anterior">‹</button>
    `;

    let previous = 0;

    pages.forEach(page => {
      if(previous && page - previous > 1){
        html += `<span aria-hidden="true">…</span>`;
      }

      html += `
        <button type="button"
                data-page="${page}"
                class="${page === currentPage ? "active" : ""}"
                aria-current="${page === currentPage ? "page" : "false"}">
          ${page}
        </button>
      `;

      previous = page;
    });

    html += `
      <button type="button"
              data-page="${currentPage + 1}"
              ${currentPage >= totalPages ? "disabled" : ""}
              aria-label="Próxima página">›</button>
    `;

    box.innerHTML = html;
  }

  function renderUsers(){
    const list = filteredUsers();
    const total = list.length;

    const totalLabel = $("#totalUsuarios");
    if(totalLabel){
      totalLabel.textContent = `${total} usuário(s)`;
    }

    const pages = Math.max(
      1,
      Math.ceil(total / STATE.pageSize)
    );

    STATE.page = Math.min(
      Math.max(STATE.page, 1),
      pages
    );

    const startIndex =
      (STATE.page - 1) * STATE.pageSize;

    const pageUsers = list.slice(
      startIndex,
      startIndex + STATE.pageSize
    );

    const box = $("#listaUsuarios");
    if(!box) return;

    box.innerHTML = pageUsers.length
      ? pageUsers.map(user => `
          <div class="atlas-user-row
                      ${String(STATE.selected?.id) === String(user.id) ? "selected" : ""}"
               data-user-id="${esc(user.id)}"
               role="button"
               tabindex="0"
               aria-label="Selecionar ${esc(user.nome || "usuário")}">

            <div class="atlas-user-cell">
              <div class="atlas-avatar row">
                ${esc(initials(user.nome))}
              </div>

              <div>
                <strong>${esc(user.nome || "Sem nome")}</strong>
                <small>${esc(user.email || user.usuario || "-")}</small>
              </div>
            </div>

            <span class="atlas-profile-badge">
              ${esc(user.perfil || "-")}
            </span>

            <span class="atlas-work-cell">
              ${esc(workText(user.obra_id))}
            </span>

            <span class="atlas-status
                         ${user.ativo === false ? "inactive" : "active"}">
              ${user.ativo === false ? "INATIVO" : "ATIVO"}
            </span>
          </div>
        `).join("")
      : `<div class="atlas-empty">
           Nenhum usuário encontrado.
         </div>`;

    renderPagination(pages);
  }

  function selectUser(id){
    try{
      const user = STATE.users.find(
        item => String(item.id) === String(id)
      );

      if(!user){
        console.warn(
          "Atlas Usuários: funcionário não encontrado.",
          id
        );
        return false;
      }

      if(
        Number(user.id) === OWNER_ID &&
        !currentIsOwner()
      ){
        return false;
      }

      STATE.selected = user;

      STATE.draft = {
        ...user,
        permissions:new Set(permsOf(user)),
        works:new Set(
          String(user.obras_liberadas || "")
            .split(",")
            .map(value => value.trim())
            .filter(Boolean)
        )
      };

      STATE.worksDraft =
        new Set(STATE.draft.works);

      STATE.expeditionWorksDraft =
        permissoesObrasExpedicao(STATE.draft.permissions);

      // A obra principal sempre faz parte do escopo da Expedição.
      if(user.obra_id){
        STATE.expeditionWorksDraft.add(String(user.obra_id));
      }

      const emptyState = $("#semUsuario");
      const content = $("#conteudoUsuario");

      if(emptyState){
        emptyState.hidden = true;
        emptyState.style.display = "none";
      }

      if(content){
        content.hidden = false;
        content.style.display = "flex";
      }

      const setText = (elementId, text) => {
        const element = $("#"+elementId);
        if(element){
          element.textContent = text ?? "-";
        }
      };

      setText("selectedAvatar", initials(user.nome));
      setText("selectedName", user.nome || "-");
      setText(
        "selectedLogin",
        user.email || user.usuario || "-"
      );
      setText("selectedProfile", user.perfil || "-");
      setText(
        "selectedLastAccess",
        user.ultimo_acesso
          ? new Date(user.ultimo_acesso)
              .toLocaleString("pt-BR")
          : "Não informado"
      );
      setText(
        "selectedWork",
        workText(user.obra_id)
      );

      const status = $("#selectedStatus");
      if(status){
        status.textContent =
          user.ativo === false ? "INATIVO" : "ATIVO";

        status.className =
          "atlas-status " +
          (user.ativo === false ? "inactive" : "active");
      }

      const sections = [
        ["dados", renderData],
        ["permissões", renderPermissions],
        ["notificações", renderNotifications],
        ["obras", renderWorksInline],
        ["histórico", renderHistory],
        ["resumo", renderSummary]
      ];

      sections.forEach(([name, render]) => {
        try{
          render();
        }catch(error){
          console.error(
            `Atlas Usuários: erro em ${name}.`,
            error
          );
        }
      });

      renderUsers();

      if($("#btnEditarUsuario")) $("#btnEditarUsuario").disabled=!canEditSelected();
      if($("#btnPerfilRapido")) $("#btnPerfilRapido").disabled=!canManageSelectedAccess();

      atualizarVisibilidadeAbasUsuario();

      activateTab("dados");
      setDirty(false);

      const scrollArea =
        $(".atlas-tab-scroll-area");

      if(scrollArea){
        scrollArea.scrollTop = 0;
      }

      console.log(
        `✅ Funcionário selecionado: ${user.nome} (ID ${user.id})`
      );

      return true;
    }catch(error){
      console.error(
        "Atlas Usuários: falha ao selecionar funcionário.",
        error
      );

      alert(
        "Não foi possível abrir este funcionário. " +
        "Confira o erro vermelho no Console."
      );

      return false;
    }
  }

  function atualizarVisibilidadeAbasUsuario(){
    if(!STATE.selected) return;

    const podeGerenciarAcesso = canManageSelectedAccess();
    const proprio = isOwnSelected() && !currentIsOwner();

    const tabPermissoes = $('.atlas-tab[data-tab="permissoes"]');
    const tabObras = $('.atlas-tab[data-tab="obras"]');

    /*
      Não mostramos opções de acesso para quem não pode administrá-las.
      Isso evita expor permissões que o próprio usuário não pode alterar.
    */
    if(tabPermissoes) tabPermissoes.hidden = !podeGerenciarAcesso;
    if(tabObras) tabObras.hidden = !podeGerenciarAcesso;

    if($("#tabPermissoes")) $("#tabPermissoes").hidden = !podeGerenciarAcesso;
    if($("#tabObras")) $("#tabObras").hidden = !podeGerenciarAcesso;

    /*
      Na própria conta, dados estruturais não são alterados por aqui.
      Mantemos troca de senha e preferências de notificação.
    */
    if($("#btnEditarUsuario")) $("#btnEditarUsuario").hidden = proprio;
    if($("#btnPerfilRapido")) $("#btnPerfilRapido").hidden = proprio || !podeGerenciarAcesso;

    if($("#btnTrocarSenha")){
      $("#btnTrocarSenha").hidden = false;
      $("#btnTrocarSenha").disabled = false;
    }

    if(proprio){
      const abaAtiva = $('.atlas-tab.active')?.dataset?.tab;
      if(abaAtiva === "permissoes" || abaAtiva === "obras"){
        activateTab("dados");
      }
    }
  }

  function moduleHtml(m){
    const bloqueado=!canManageSelectedAccess();

    const switchCabecalho=m.access
      ? `<label class="atlas-switch"><input type="checkbox" class="module-access" data-module="${m.id}" value="${m.access}" ${STATE.draft.permissions.has(m.access)?"checked":""} ${bloqueado?"disabled":""}><span></span></label>`
      : `<label class="atlas-switch"><input type="checkbox" class="module-master" data-module="${m.id}" ${bloqueado?"disabled":""}><span></span></label>`;

    const linhas=m.items.map(([p,l])=>`
      <div class="atlas-permission-row">
        <label>${esc(l)}</label>
        <label class="atlas-switch">
          <input type="checkbox" class="permission-toggle" value="${p}" ${STATE.draft.permissions.has(p)?"checked":""} ${bloqueado?"disabled":""}>
          <span></span>
        </label>
      </div>`).join("");

    const obras=m.id==="EXPEDICAO"
      ? `<div class="atlas-permission-row atlas-expedition-works-row">
           <label>
             Empresas / obras visíveis
             <small>Controle exclusivo do catálogo, pedidos e movimentações da Expedição.</small>
           </label>
           <button type="button" class="atlas-btn light atlas-expedition-works-btn" data-config-expedition-works ${bloqueado?"disabled":""}>
             <i class="fa-solid fa-building-circle-check"></i> Configurar
           </button>
         </div>`
      : "";

    return `<section class="atlas-module-card" data-permission-module="${m.id}">
      <h3><span>${m.title}</span>${switchCabecalho}</h3>
      ${linhas}
      ${obras}
    </section>`;
  }

  function renderPermissions(){
    $("#permissionModules").innerHTML=PERMISSION_MODULES.map(moduleHtml).join("");
    syncModuleMasters();

    const geral=$("#switchTodasPermissoes");
    if(geral){
      const toggles=[...$$(".permission-toggle"),...$$(".module-access")];
      geral.checked=toggles.length>0&&toggles.every(x=>x.checked);
      geral.disabled=!canManageSelectedAccess();
    }
  }
  function syncModuleMasters(){
    PERMISSION_MODULES.forEach(m=>{
      if(m.access){
        const access=$(`.module-access[data-module="${m.id}"]`);
        if(access) access.checked=STATE.draft.permissions.has(m.access);
        return;
      }

      const items=m.items.map(x=>x[0]);
      const master=$(`.module-master[data-module="${m.id}"]`);
      if(master) master.checked=items.every(p=>STATE.draft.permissions.has(p));
    });
  }


  function expedicaoObraPrincipalId(){
    return String(STATE.selected?.obra_id||"");
  }

  function expedicaoObrasTemporarias(){
    const set=new Set(STATE.expeditionWorksDraft||[]);
    const principal=expedicaoObraPrincipalId();
    if(principal) set.add(principal);
    return set;
  }

  function garantirModalObrasExpedicao(){
    let bg=$("#modalExpedicaoObras");
    if(bg) return bg;

    bg=document.createElement("div");
    bg.id="modalExpedicaoObras";
    bg.className="modal-bg";
    bg.hidden=true;

    bg.innerHTML=`
      <div class="modal atlas-expedition-works-modal"
           role="dialog"
           aria-modal="true"
           aria-labelledby="expWorksTitle">

        <button type="button"
                class="fechar"
                id="btnFecharExpedicaoObras"
                aria-label="Fechar"
                title="Fechar">X</button>

        <div class="atlas-expedition-works-head">
          <h3 id="expWorksTitle">
            <i class="fa-solid fa-building-circle-check"></i>
            Empresas / obras visíveis
          </h3>
          <p>Defina quais locais este funcionário poderá consultar e operar dentro da Expedição.</p>
        </div>

        <div class="atlas-expedition-works-toolbar">
          <div class="atlas-expedition-works-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input id="buscaExpedicaoObras"
                   type="search"
                   autocomplete="off"
                   placeholder="Buscar empresa, código ou obra...">
          </div>

          <button type="button"
                  class="atlas-btn light"
                  id="btnSelecionarTodasExpedicaoObras">
            Selecionar todas
          </button>
        </div>

        <div id="listaExpedicaoObras"
             class="atlas-expedition-works-list"></div>

        <div class="atlas-expedition-works-actions">
          <small id="resumoExpedicaoObras"></small>

          <button type="button"
                  class="atlas-btn primary"
                  id="btnSalvarExpedicaoObras">
            <i class="fa-solid fa-floppy-disk"></i>
            Salvar seleção
          </button>
        </div>
      </div>`;

    document.body.appendChild(bg);

    // Fecha pelo X.
    $("#btnFecharExpedicaoObras").addEventListener("click",()=>{
      fecharModalObrasExpedicao();
    });

    // Fecha ao clicar fora da caixa, igual aos demais modais.
    bg.addEventListener("click",event=>{
      if(event.target===bg) fecharModalObrasExpedicao();
    });

    return bg;
  }

  function fecharModalObrasExpedicao(){
    const bg=$("#modalExpedicaoObras");
    if(!bg) return;

    // display:none é obrigatório; só hidden não vence style.display=flex.
    bg.style.display="none";
    bg.hidden=true;
  }

  function atualizarResumoExpedicaoObras(tempSet){
    const resumo=$("#resumoExpedicaoObras");
    if(!resumo) return;

    const principal=expedicaoObraPrincipalId();
    const ids=new Set(tempSet||[]);
    if(principal) ids.add(principal);

    resumo.textContent=`${ids.size} obra(s) selecionada(s)`;
  }

  function renderModalObrasExpedicao(tempSet){
    const lista=$("#listaExpedicaoObras");
    if(!lista) return;

    const termo=norm($("#buscaExpedicaoObras")?.value||"");
    const principal=expedicaoObraPrincipalId();

    const obras=STATE.works
      .filter(w=>{
        const texto=`${w.codigo_obra||w.codigo||""} ${w.nome||""}`;
        return !termo || norm(texto).includes(termo);
      })
      .sort((a,b)=>
        String(a.codigo_obra||a.codigo||"")
          .localeCompare(
            String(b.codigo_obra||b.codigo||""),
            "pt-BR",
            {numeric:true}
          )
      );

    lista.innerHTML=obras.map(w=>{
      const id=String(w.id);
      const obrigatoria=id===principal;
      const selecionada=obrigatoria||tempSet.has(id);

      return `
        <button type="button"
                class="atlas-expedition-work-item ${obrigatoria?"principal":""} ${selecionada?"selecionada":""}"
                data-expedition-work-id="${esc(id)}"
                aria-pressed="${selecionada?"true":"false"}"
                ${obrigatoria?"disabled":""}>

          <span class="atlas-expedition-work-checkmark" aria-hidden="true">
            <i class="fa-solid fa-check"></i>
          </span>

          <span class="atlas-expedition-work-text">
            <strong>${esc(w.codigo_obra||w.codigo||"-")} - ${esc(w.nome||"-")}</strong>
            <small>${obrigatoria
              ? "Obra principal — acesso obrigatório"
              : "Disponível para a Expedição"}</small>
          </span>
        </button>`;
    }).join("") || '<div class="atlas-empty">Nenhuma obra encontrada.</div>';

    atualizarResumoExpedicaoObras(tempSet);
  }

  function abrirModalObrasExpedicao(){
    if(!STATE.selected||!canManageSelectedAccess()) return;

    const bg=garantirModalObrasExpedicao();
    const tempSet=expedicaoObrasTemporarias();

    const busca=$("#buscaExpedicaoObras");
    const lista=$("#listaExpedicaoObras");
    const selecionarTodas=$("#btnSelecionarTodasExpedicaoObras");
    const salvar=$("#btnSalvarExpedicaoObras");

    busca.value="";
    renderModalObrasExpedicao(tempSet);

    /*
      Pesquisa pode reconstruir a lista porque muda os resultados exibidos.
      A seleção de uma obra NÃO reconstrói a lista.
    */
    busca.oninput=()=>{
      renderModalObrasExpedicao(tempSet);
    };

    /*
      Seleção por botão de linha.
      Evita a combinação label + checkbox + change que estava causando
      o conteúdo branco/refluxo visual no navegador.
    */
    lista.onclick=event=>{
      const linha=event.target.closest("[data-expedition-work-id]");
      if(!linha || linha.disabled) return;

      const id=String(linha.dataset.expeditionWorkId||"");
      if(!id) return;

      const selecionar=!tempSet.has(id);

      if(selecionar) tempSet.add(id);
      else tempSet.delete(id);

      linha.classList.toggle("selecionada",selecionar);
      linha.setAttribute("aria-pressed",selecionar?"true":"false");

      atualizarResumoExpedicaoObras(tempSet);
    };

    selecionarTodas.onclick=()=>{
      STATE.works.forEach(w=>tempSet.add(String(w.id)));
      renderModalObrasExpedicao(tempSet);
    };

    salvar.onclick=()=>{
      const principal=expedicaoObraPrincipalId();
      if(principal) tempSet.add(principal);

      STATE.expeditionWorksDraft=new Set(tempSet);

      [...STATE.draft.permissions]
        .filter(token=>obraIdDaPermissaoExpedicao(token))
        .forEach(token=>STATE.draft.permissions.delete(token));

      STATE.expeditionWorksDraft.forEach(id=>{
        STATE.draft.permissions.add(`${EXPEDICAO_OBRA_PREFIX}${id}`);
      });

      setDirty();
      fecharModalObrasExpedicao();
      toast("Obras visíveis da Expedição atualizadas. Clique em Salvar alterações.");
    };

    bg.hidden=false;
    bg.style.display="flex";

    setTimeout(()=>busca?.focus(),30);
  }

  /*
    ESC fecha o modal.
    Instalado uma única vez para não acumular listeners a cada abertura.
  */
  if(!window.__atlasEscModalExpedicaoObras){
    window.__atlasEscModalExpedicaoObras=true;

    document.addEventListener("keydown",event=>{
      if(event.key!=="Escape") return;

      const bg=$("#modalExpedicaoObras");
      if(!bg || bg.hidden || bg.style.display==="none") return;

      event.preventDefault();
      fecharModalObrasExpedicao();
    });
  }

  function operationalPermissions(){const ps=STATE.draft.permissions;return OPERATIONAL_NOTIFS.map(n=>({...n,active:n.perm.some(p=>ps.has(p))}))}
  function renderNotifications(){
    const bloqueado = !canManageSelectedNotifications();
    const operational={id:"EXPEDICAO",title:"🚚 Expedição — automática pelo papel",items:operationalPermissions()};const opHtml=`<section class="atlas-module-card"><h3><span>${operational.title}</span><span class="atlas-auto-tag">AUTOMÁTICA</span></h3>${operational.items.map(i=>`<div class="atlas-permission-row auto"><label>${esc(i.label)}<small>${i.active?"Ativa pela função do usuário":"Não aplicável ao papel atual"}</small></label><label class="atlas-switch"><input type="checkbox" disabled ${i.active?"checked":""}><span></span></label></div>`).join("")}</section>`;const opt=OPTIONAL_NOTIFS.map(m=>`<section class="atlas-module-card"><h3><span>${m.title}</span><label class="atlas-switch"><input class="notif-module-master" data-notif-module="${m.id}" type="checkbox" ${bloqueado?"disabled":""}><span></span></label></h3>${m.items.map(([p,l])=>`<div class="atlas-permission-row"><label>${esc(l)}</label><label class="atlas-switch"><input class="notification-toggle" type="checkbox" value="${p}" ${STATE.draft.permissions.has(p)?"checked":""} ${bloqueado?"disabled":""}><span></span></label></div>`).join("")}</section>`).join("");$("#notificationModules").innerHTML=opHtml+opt;const mode=["NOTIF_MODO_SOM","NOTIF_MODO_VISUAL","NOTIF_MODO_SILENCIOSO"].find(x=>STATE.draft.permissions.has(x))||"NOTIF_MODO_SOM";const radio=$(`input[name="notificationMode"][value="${mode}"]`);
    if(radio) radio.checked=true;
    $$('input[name="notificationMode"]').forEach(r=>r.disabled=bloqueado);
    $("#modoAtualTexto").textContent=mode==="NOTIF_MODO_SOM"?"Som e aviso":mode==="NOTIF_MODO_VISUAL"?"Apenas aviso":"Silencioso";OPTIONAL_NOTIFS.forEach(m=>{const master=$(`.notif-module-master[data-notif-module="${m.id}"]`);if(master)master.checked=m.items.every(([p])=>STATE.draft.permissions.has(p))})}

  function renderSummary(){
    if(!STATE.draft) return;

    const mode =
      ["NOTIF_MODO_SOM","NOTIF_MODO_VISUAL","NOTIF_MODO_SILENCIOSO"]
        .find(item => STATE.draft.permissions.has(item))
      || "NOTIF_MODO_SOM";

    const modoTexto = $("#modoAtualTexto");
    if(modoTexto){
      modoTexto.textContent =
        mode === "NOTIF_MODO_SOM"
          ? "Som e aviso"
          : mode === "NOTIF_MODO_VISUAL"
            ? "Apenas aviso"
            : "Silencioso";
    }

    const resumo = $("#accessSummary");
    if(!resumo) return;
  }

  function updatePerm(value,checked){checked?STATE.draft.permissions.add(value):STATE.draft.permissions.delete(value);setDirty();renderNotifications();renderSummary()}
  function applyProfile(profile){
    /*
      Perfis rápidos antigos podem conter nomes de módulos legados.
      Ao APLICAR o modelo, convertemos para o padrão explícito *_VER.
    */
    const list=normalizarPermissoesPerfilRapido(profile.permissoes);
    STATE.draft.permissions=new Set(list);
    STATE.draft.perfil_rapido=profile.nome;
    STATE.draft.perfil=profile.nome;
    $("#selectedProfile").textContent=profile.nome;
    renderPermissions();
    renderNotifications();
    renderSummary();
    setDirty();
    modal("modalPerfis",false);
    toast(`Perfil ${profile.nome} carregado na tela. Clique em Salvar Permissões.`);
  }


  function activateTab(nome){$$('.atlas-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===nome));$$('.atlas-tab-content').forEach(x=>x.classList.remove('active'));const alvo=$('#tab'+nome.charAt(0).toUpperCase()+nome.slice(1));if(alvo)alvo.classList.add('active');const area=$('.atlas-tab-scroll-area');if(area)area.scrollTop=0}
  function renderData(){if(!STATE.selected)return;const u=STATE.draft||STATE.selected;const itens=[['Nome completo',u.nome||'-'],['Usuário',u.usuario||'-'],['E-mail',u.email||'Não informado'],['Perfil',u.perfil||'-'],['Empresa',u.empresa_id||'-'],['Obra principal',workText(u.obra_id)],['Status',u.ativo===false?'INATIVO':'ATIVO'],['Perfil rápido',u.perfil_rapido||'Personalizado']];const el=$('#dataSummary');if(el)el.innerHTML=itens.map(([a,b])=>`<div class="atlas-data-card"><small>${esc(a)}</small><strong>${esc(b)}</strong></div>`).join('')}
  function renderWorksInline(){
    const box=$('#listaObrasInline');
    if(!box)return;

    const termo=norm($('#buscaObrasInline')?.value||'');
    const bloqueado=!canManageSelectedAccess();

    box.innerHTML=STATE.works
      .filter(w=>norm(workText(w.id)).includes(termo))
      .map(w=>`<label class="atlas-work-row"><input class="work-inline-check" type="checkbox" value="${w.id}" ${STATE.worksDraft.has(String(w.id))?'checked':''} ${bloqueado?'disabled':''}><span>${esc(workText(w.id))}</span></label>`)
      .join('')||'<div class="atlas-empty">Nenhuma obra encontrada.</div>';

    if($("#btnMarcarObrasInline")) $("#btnMarcarObrasInline").disabled=bloqueado;
    if($("#btnDesmarcarObrasInline")) $("#btnDesmarcarObrasInline").disabled=bloqueado;
  }
  function renderHistory(){const u=STATE.selected;if(!u)return;const rows=[['fa-user-plus','Cadastro criado',u.created_at?new Date(u.created_at).toLocaleString('pt-BR'):'Data não informada'],['fa-pen-to-square','Última atualização',u.updated_at?new Date(u.updated_at).toLocaleString('pt-BR'):'Data não informada'],['fa-right-to-bracket','Último acesso',u.ultimo_acesso?new Date(u.ultimo_acesso).toLocaleString('pt-BR'):'Ainda não registrado'],['fa-user-shield','Perfil atual',u.perfil||'-'],['fa-building','Obra principal',workText(u.obra_id)]];const el=$('#historyTimeline');if(el)el.innerHTML=rows.map(([i,t,d])=>`<div class="atlas-history-item"><div class="atlas-history-icon"><i class="fa-solid ${i}"></i></div><div><strong>${esc(t)}</strong><span>${esc(d)}</span></div></div>`).join('')}
  function renderProfiles(){const owner=currentIsOwner();$("#quickProfiles").innerHTML=STATE.profiles.length?STATE.profiles.map(p=>`<article class="atlas-profile-card" data-profile-id="${p.id}"><i class="fa-solid fa-user-shield"></i><h3>${esc(p.nome)}</h3><p>${esc(p.descricao||"Perfil rápido")}</p><div class="actions"><button class="apply-profile" data-profile-id="${p.id}">Aplicar</button>${owner?`<button class="edit-profile" data-profile-id="${p.id}">Editar</button>`:""}</div></article>`).join(""):'<div class="atlas-empty">Nenhum perfil rápido encontrado.</div>'}


  async function savePermissions(){
    if(!STATE.selected) return;

    /*
      PRÓPRIA CONTA:
      salva somente preferências de notificação.
      Mesmo que alguém tente manipular o front-end pelo Console,
      permissões, perfil e obras são reconstruídos a partir do registro atual.
    */
    if(isOwnSelected() && !currentIsOwner()){
      const atuais = permsOf(STATE.selected);
      const notificacoesEditaveis = new Set([
        ...OPTIONAL_NOTIFS.flatMap(m=>m.items.map(([p])=>p)),
        "NOTIF_MODO_SOM",
        "NOTIF_MODO_VISUAL",
        "NOTIF_MODO_SILENCIOSO"
      ]);

      const p = new Set(
        [...atuais].filter(x=>!notificacoesEditaveis.has(x))
      );

      OPTIONAL_NOTIFS
        .flatMap(m=>m.items)
        .forEach(([notif])=>{
          if(STATE.draft.permissions.has(notif)) p.add(notif);
        });

      const modes=[
        "NOTIF_MODO_SOM",
        "NOTIF_MODO_VISUAL",
        "NOTIF_MODO_SILENCIOSO"
      ];

      const mode=
        modes.find(x=>STATE.draft.permissions.has(x)) ||
        "NOTIF_MODO_SOM";

      modes.forEach(x=>p.delete(x));
      p.add(mode);
      p.add("RECEBER_NOTIFICACOES");

      /*
        Notificações operacionais continuam automáticas:
        são recalculadas a partir das permissões reais do usuário.
      */
      OPERATIONAL_NOTIFS.forEach(n=>{
        if(n.perm.some(x=>p.has(x))) p.add(n.notif);
        else p.delete(n.notif);
      });

      if(OPERATIONAL_NOTIFS.some(n=>p.has(n.notif))){
        p.add("NOTIF_EXPEDICAO");
      }else{
        p.delete("NOTIF_EXPEDICAO");
      }

      const payload={
        permissoes:[...p].join(","),
        updated_at:new Date().toISOString()
      };

      const r=await db()
        .from(STATE.table)
        .update(payload)
        .eq("id",STATE.selected.id)
        .select();

      if(r.error){
        alert("Erro ao salvar preferências: "+r.error.message);
        return;
      }

      Object.assign(STATE.selected,payload);
      Object.assign(STATE.draft,payload,{permissions:p});

      const idx=STATE.users.findIndex(
        x=>Number(x.id)===Number(STATE.selected.id)
      );
      if(idx>=0) Object.assign(STATE.users[idx],payload);

      const u={...current(),...payload};
      localStorage.setItem("usuario_logado",JSON.stringify(u));
      localStorage.setItem("usuarioLogado",JSON.stringify(u));

      setDirty(false);
      renderNotifications();
      renderSummary();
      renderData();
      toast("Preferências de notificações salvas.");
      return;
    }

    /*
      ADMINISTRAÇÃO DE ACESSO:
      somente quem possui autorização para gerenciar o usuário selecionado.
    */
    if(!canManageSelectedAccess()){
      alert("Você não possui permissão para gerenciar acessos deste usuário.");
      return;
    }

    const p=new Set(
      [...STATE.draft.permissions].filter(x=>!LEGACY_MODULE_TOKENS.has(norm(x)))
    );

    p.add("RECEBER_NOTIFICACOES");

    OPERATIONAL_NOTIFS.forEach(n=>{
      if(n.perm.some(x=>p.has(x))) p.add(n.notif);
      else p.delete(n.notif);
    });

    if(OPERATIONAL_NOTIFS.some(n=>p.has(n.notif))){
      p.add("NOTIF_EXPEDICAO");
    }else{
      p.delete("NOTIF_EXPEDICAO");
    }

    const modes=[
      "NOTIF_MODO_SOM",
      "NOTIF_MODO_VISUAL",
      "NOTIF_MODO_SILENCIOSO"
    ];
    if(!modes.some(x=>p.has(x))) p.add("NOTIF_MODO_SOM");

    [...p]
      .filter(token=>obraIdDaPermissaoExpedicao(token))
      .forEach(token=>p.delete(token));

    const principalExpedicao=expedicaoObraPrincipalId();
    if(principalExpedicao) STATE.expeditionWorksDraft.add(principalExpedicao);

    STATE.expeditionWorksDraft.forEach(id=>{
      p.add(`${EXPEDICAO_OBRA_PREFIX}${id}`);
    });

    const payload={
      permissoes:[...p].join(","),
      perfil:STATE.draft.perfil||STATE.selected.perfil||"OPERADOR",
      perfil_rapido:STATE.draft.perfil_rapido||null,
      obras_liberadas:[...STATE.worksDraft].join(","),
      updated_at:new Date().toISOString()
    };

    const r=await db()
      .from(STATE.table)
      .update(payload)
      .eq("id",STATE.selected.id)
      .select();

    if(r.error){
      alert("Erro ao salvar: "+r.error.message);
      return;
    }

    Object.assign(STATE.selected,payload);
    Object.assign(STATE.draft,payload,{permissions:p});

    const idx=STATE.users.findIndex(
      x=>Number(x.id)===Number(STATE.selected.id)
    );
    if(idx>=0) Object.assign(STATE.users[idx],payload);

    if(Number(current()?.id)===Number(STATE.selected.id)){
      const u={...current(),...payload};
      localStorage.setItem("usuario_logado",JSON.stringify(u));
      localStorage.setItem("usuarioLogado",JSON.stringify(u));
    }

    setDirty(false);
    renderUsers();
    renderPermissions();
    renderNotifications();
    renderSummary();
    renderData();
    renderWorksInline();
    renderHistory();
    toast("Permissões, notificações e obras salvas com sucesso.");
  }

  function openUserModal(user=null,focusPassword=false){if(user&&Number(user.id)===OWNER_ID&&!currentIsOwner())return;$("#formId").value=user?.id||"";$("#formNome").value=user?.nome||"";$("#formUsuario").value=user?.usuario||"";$("#formEmail").value=user?.email||"";$("#formPerfil").value=user?.perfil||$("#formPerfil option")?.value||"OPERADOR";$("#formEmpresa").value=user?.empresa_id||"";$("#formObra").value=user?.obra_id||"";$("#formAtivo").value=String(user?.ativo!==false);$("#formSenha").value="";$("#modalUsuarioTitulo").textContent=user?"Editar usuário":"Novo usuário";modal("modalUsuario",true);if(focusPassword)setTimeout(()=>$("#formSenha").focus(),80)}
  async function saveUser(){
    const id=$("#formId").value;

    if(id && Number(id)===currentId() && !currentIsOwner()){
      alert("Por segurança, alterações da sua própria conta devem usar as opções pessoais do sistema.");
      return;
    }

    if(id && Number(id)===OWNER_ID && !currentIsOwner()){
      alert("O usuário OWNER não pode ser alterado.");
      return;
    }

    if(id && !canEditSelected()){
      alert("Você não possui permissão para editar este usuário.");
      return;
    }

    if(!id && !canCreateUsers()){
      alert("Você não possui permissão para criar usuários.");
      return;
    }

    const payload={nome:$("#formNome").value.trim(),usuario:$("#formUsuario").value.trim(),email:$("#formEmail").value.trim()||null,perfil:$("#formPerfil").value,empresa_id:$("#formEmpresa").value?Number($("#formEmpresa").value):null,obra_id:$("#formObra").value?Number($("#formObra").value):null,ativo:$("#formAtivo").value==="true",updated_at:new Date().toISOString()};const senha=$("#formSenha").value.trim();if(!payload.nome||!payload.usuario){alert("Informe nome e usuário.");return}if(senha)Object.assign(payload,{senha,senha_temporaria:true,senha_provisoria:true,trocar_senha:true});let r;if(id)r=await db().from(STATE.table).update(payload).eq("id",id).select();else{if(!senha){alert("Informe uma senha provisória para o novo usuário.");return}const prof=STATE.profiles.find(p=>norm(p.nome)===norm(payload.perfil));Object.assign(payload,{permissoes:prof?.permissoes||"",perfil_rapido:prof?.nome||payload.perfil});r=await db().from(STATE.table).insert([payload]).select()}if(r.error){alert("Erro ao salvar usuário: "+r.error.message);return}modal("modalUsuario",false);await load();const saved=Array.isArray(r.data)?r.data[0]:r.data;if(saved?.id)selectUser(saved.id);toast("Usuário salvo com sucesso.")}

  async function testAudio(){
    if(!global.AtlasAudio){
      alert("O módulo de áudio não foi carregado. Confira JS/atlasAudio/atlasAudio.js.");
      return;
    }

    try{
      await global.AtlasAudio.liberar?.();
      global.AtlasAudio.definirVolume?.(1);
      await global.AtlasAudio.notificacao?.();
      toast("Teste de som executado.");
    }catch(error){
      console.error("Atlas Usuários: teste de áudio falhou.",error);
      alert("O navegador não conseguiu tocar o som. Clique na página e tente novamente.");
    }
  }

  function openProfileEditor(profile){if(!currentIsOwner())return;$("#editProfileId").value=profile.id||"";$("#editProfileName").value=profile.nome||"";$("#editProfileDescription").value=profile.descricao||"";modal("modalEditarPerfil",true)}
  async function saveProfileModel(){if(!currentIsOwner()||!STATE.selected)return;const id=$("#editProfileId").value;const nome=$("#editProfileName").value.trim();if(!id||!nome){alert("Informe o nome do perfil.");return}const payload={nome,descricao:$("#editProfileDescription").value.trim()||null,permissoes:[...STATE.draft.permissions].join(","),ativo:true};const r=await db().from("perfis_rapidos").update(payload).eq("id",id).select();if(r.error){alert("Erro ao salvar perfil: "+r.error.message);return}modal("modalEditarPerfil",false);STATE.profiles=await loadSafe("perfis_rapidos","id");STATE.profiles=STATE.profiles.filter(p=>p.ativo!==false);renderProfiles();toast("Modelo do perfil rápido atualizado.")}

  function bind(){
    ["filtroBusca","filtroPerfil","filtroObra","filtroStatus"].forEach(id=>{
      const campo=$("#"+id);
      if(!campo)return;
      campo.addEventListener(
        id==="filtroBusca"?"input":"change",
        ()=>{STATE.page=1;renderUsers()}
      );
    });
    const userList = $("#listaUsuarios");

    userList?.addEventListener("click", event => {
      const row =
        event.target.closest("[data-user-id]");

      if(!row) return;

      event.preventDefault();
      selectUser(row.dataset.userId);
    });

    userList?.addEventListener("keydown", event => {
      if(!["Enter"," "].includes(event.key)) return;

      const row =
        event.target.closest("[data-user-id]");

      if(!row) return;

      event.preventDefault();
      selectUser(row.dataset.userId);
    });
    $("#paginacaoUsuarios")?.addEventListener("click", event => {
      const button =
        event.target.closest("button[data-page]");

      if(!button || button.disabled) return;

      const page = Number(button.dataset.page);

      if(!Number.isFinite(page)) return;

      STATE.page = page;
      renderUsers();

      const list = $("#listaUsuarios");
      if(list) list.scrollTop = 0;
    });

    if($("#btnNovoUsuario"))$("#btnNovoUsuario").onclick=()=>openUserModal();
    if($("#btnEditarUsuario"))$("#btnEditarUsuario").onclick=()=>openUserModal(STATE.selected);
    if($("#btnTrocarSenha"))$("#btnTrocarSenha").onclick=()=>{
      if(isOwnSelected() && !currentIsOwner()){
        location.href="alterar-senha.html";
        return;
      }
      openUserModal(STATE.selected,true);
    };
    if($("#btnPerfilRapido"))$("#btnPerfilRapido").onclick=()=>modal("modalPerfis",true);
    if($("#btnSalvarUsuario"))$("#btnSalvarUsuario").onclick=saveUser;
    if($("#btnSalvarModeloPerfil"))$("#btnSalvarModeloPerfil").onclick=saveProfileModel;
    if($("#btnSalvarPermissoes"))$("#btnSalvarPermissoes").onclick=savePermissions;
    if($("#btnDescartar"))$("#btnDescartar").onclick=()=>STATE.selected&&selectUser(STATE.selected.id);
    if($("#btnTestarSom"))$("#btnTestarSom").onclick=testAudio;

    $$("[data-close-modal]").forEach(button=>{
      button.onclick=()=>modal(button.dataset.closeModal,false);
    });

    $$(".atlas-tab").forEach(button=>{
      button.onclick=()=>activateTab(button.dataset.tab);
    });

    $("#permissionModules")?.addEventListener("click",event=>{
      const btn=event.target.closest("[data-config-expedition-works]");
      if(btn){
        event.preventDefault();
        abrirModalObrasExpedicao();
      }
    });

    $("#permissionModules")?.addEventListener("change",event=>{
      if(!canManageSelectedAccess()) return;

      if(event.target.classList.contains("permission-toggle")){
        updatePerm(event.target.value,event.target.checked);
      }

      if(event.target.classList.contains("module-access")){
        updatePerm(event.target.value,event.target.checked);
        renderPermissions();
      }

      if(event.target.classList.contains("module-master")){
        const modulo=PERMISSION_MODULES.find(item=>item.id===event.target.dataset.module);
        if(!modulo)return;

        modulo.items.forEach(([permission])=>{
          event.target.checked
            ? STATE.draft.permissions.add(permission)
            : STATE.draft.permissions.delete(permission);
        });

        renderPermissions();
        renderNotifications();
        renderSummary();
        setDirty();
      }
    });

    if($("#switchTodasPermissoes")){
      $("#switchTodasPermissoes").onchange=event=>{
        if(!canManageSelectedAccess()) return;
        PERMISSION_MODULES.forEach(modulo=>{
          if(modulo.access){
            event.target.checked
              ? STATE.draft.permissions.add(modulo.access)
              : STATE.draft.permissions.delete(modulo.access);
          }

          modulo.items.forEach(([permission])=>{
            event.target.checked
              ? STATE.draft.permissions.add(permission)
              : STATE.draft.permissions.delete(permission);
          });
        });

        renderPermissions();
        renderNotifications();
        renderSummary();
        setDirty();
      };
    }

    $("#notificationModules")?.addEventListener("change",event=>{
      if(!canManageSelectedNotifications()) return;

      if(event.target.classList.contains("notification-toggle")){
        updatePerm(event.target.value,event.target.checked);
      }

      if(event.target.classList.contains("notif-module-master")){
        const modulo=OPTIONAL_NOTIFS.find(item=>item.id===event.target.dataset.notifModule);
        if(!modulo)return;

        modulo.items.forEach(([notification])=>{
          event.target.checked
            ? STATE.draft.permissions.add(notification)
            : STATE.draft.permissions.delete(notification);
        });

        renderNotifications();
        renderSummary();
        setDirty();
      }
    });

    $$('input[name="notificationMode"]').forEach(radio=>{
      radio.onchange=()=>{
        if(!canManageSelectedNotifications()) return;
        ["NOTIF_MODO_SOM","NOTIF_MODO_VISUAL","NOTIF_MODO_SILENCIOSO"]
          .forEach(item=>STATE.draft.permissions.delete(item));

        STATE.draft.permissions.add(radio.value);
        renderNotifications();
        renderSummary();
        setDirty();
      };
    });

    $("#quickProfiles")?.addEventListener("click",event=>{
      const id=event.target.dataset.profileId;
      if(!id)return;

      const profile=STATE.profiles.find(item=>String(item.id)===String(id));
      if(!profile)return;

      if(event.target.classList.contains("apply-profile"))applyProfile(profile);
      if(event.target.classList.contains("edit-profile"))openProfileEditor(profile);
    });

    if($("#buscaObrasInline"))$("#buscaObrasInline").oninput=renderWorksInline;

    $("#listaObrasInline")?.addEventListener("change",event=>{
      if(!event.target.classList.contains("work-inline-check"))return;
      if(!canManageSelectedAccess()) return;

      event.target.checked
        ? STATE.worksDraft.add(event.target.value)
        : STATE.worksDraft.delete(event.target.value);

      STATE.draft.obras_liberadas=[...STATE.worksDraft].join(",");
      setDirty();
      renderSummary();
    });

    if($("#btnMarcarObrasInline")){
      $("#btnMarcarObrasInline").onclick=()=>{
        if(!canManageSelectedAccess()) return;
        STATE.worksDraft=new Set(STATE.works.map(work=>String(work.id)));
        STATE.draft.obras_liberadas=[...STATE.worksDraft].join(",");
        renderWorksInline();
        setDirty();
        renderSummary();
      };
    }

    if($("#btnDesmarcarObrasInline")){
      $("#btnDesmarcarObrasInline").onclick=()=>{
        if(!canManageSelectedAccess()) return;
        STATE.worksDraft.clear();
        STATE.draft.obras_liberadas="";
        renderWorksInline();
        setDirty();
        renderSummary();
      };
    }

    window.addEventListener("beforeunload",event=>{
      if(!STATE.dirty)return;
      event.preventDefault();
      event.returnValue="";
    });
  }

  function initTop(){
    const user=current();
    const nome=$("#usuarioNome");
    const perfil=$("#usuarioPerfil");

    if(nome)nome.textContent="Olá, "+(user?.nome||"Usuário");
    if(perfil)perfil.textContent=user?.perfil||"-";
    if($("#btnNovoUsuario")) $("#btnNovoUsuario").hidden=!canCreateUsers();
  }

  async function init(){initTop();bind();try{await load()}catch(e){document.documentElement.classList.remove("atlas-users-loading");alert(e.message||"Não foi possível carregar usuários.")}}

  global.AtlasUsuarios = {
    loaded:true,
    state:STATE,
    selectUser,
    load
  };

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

  console.log("✅ ATLAS USUÁRIOS carregado - padrão único, painel e paginação corrigidos");
})(window);