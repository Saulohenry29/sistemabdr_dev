(function(global){
  "use strict";
  if(global.AtlasUsuarios?.loaded) return;

  const STATE={users:[],works:[],companies:[],profiles:[],selected:null,draft:null,page:1,pageSize:8,table:"usuarios_sistema",dirty:false,worksDraft:new Set(),expeditionWorksDraft:new Set(),formWorksDraft:new Set(),formWorksTemp:new Set()};
  const OWNER_ID=1;
  const USUARIOS_COLUNAS="id,nome,usuario,perfil,empresa_id,obra_id,ativo,criado_em,email,criado_por,atualizado_em,permissoes,updated_at,ultimo_login,foto_url,telefone,cargo,senha_provisoria,trocar_senha,data_reset_senha,perfil_rapido,senha_temporaria,obras_liberadas,observacao_acesso,auth_user_id,owner_sistema,auth_status,auth_ativado_em,auth_ativado_por";
  const $=(s,c=document)=>c.querySelector(s); const $$=(s,c=document)=>[...c.querySelectorAll(s)];
  function hostWindow(){
    try{
      if(global.parent && global.parent !== global && global.parent.document) return global.parent;
    }catch(_){ }
    return global;
  }
  const db=()=>global.client||global.supabaseClient||hostWindow().client||hostWindow().supabaseClient||null;
  const atlasAudio=()=>global.AtlasAudio||hostWindow().AtlasAudio||null;
  const norm=v=>String(v??"").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const ARQUIVOS_BASE_URL="https://arquivos.sathtech.com.br/files/";
  const ATLAS_API_BASE_URL="https://arquivos.sathtech.com.br";
  const avatarUrl=v=>{const x=String(v||"").trim();if(!x)return "";if(/^https?:\/\//i.test(x))return x;return ARQUIVOS_BASE_URL+x.replace(/^\/+/,"")};
  const avatarHtml=(u,classe="")=>{const url=avatarUrl(u?.foto_url);return url?`<img class="atlas-avatar-img ${classe}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:esc(initials(u?.nome))};
  let fotoArquivoPendente=null;
  let removerFotoPendente=false;
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
  const workText=id=>{const w=STATE.works.find(x=>String(x.id)===String(id));return w?`${w.codigo_obra||w.codigo||"-"} - ${w.nome||"-"}`:"Sem obra definida"};
  const worksText=u=>{const qtd=obrasDoUsuario(u).size;return qtd?`${qtd} obra${qtd===1?"":"s"} de atuação`:"Nenhuma obra de atuação"};
  const currentId=()=>Number(current()?.id||0);
  const hasCurrentPerm=perm=>permsOf(current()).has(perm);

  function idsObrasPermitidasAtual(){
    if(currentIsOwner()) return null;
    const u=current()||{};
    const ids=new Set();
    if(u.obra_id!=null&&String(u.obra_id).trim()) ids.add(String(u.obra_id));
    String(u.obras_liberadas||"").split(",").map(x=>x.trim()).filter(Boolean).forEach(id=>ids.add(String(id)));
    return ids;
  }

  function obraPermitidaAtual(id){
    if(currentIsOwner()) return true;
    if(id==null||String(id).trim()==="") return false;
    return idsObrasPermitidasAtual().has(String(id));
  }

  function permissoesConcediveisAtual(){
    return currentIsOwner()?null:permsOf(current());
  }

  function permissaoConcedivelAtual(token){
    return currentIsOwner()||permissoesConcediveisAtual().has(String(token||"").trim());
  }

  function obrasDoUsuario(u){
    const ids=new Set();
    // Os vinculos de usuario_obras sao a referencia para a listagem.
    // Os campos legados continuam considerados apenas quando ainda nao ha
    // vinculos carregados para o registro.
    if(Array.isArray(u?._obras_vinculadas)){
      u._obras_vinculadas.forEach(id=>ids.add(String(id)));
      return ids;
    }
    if(u?.obra_id!=null&&String(u.obra_id).trim()) ids.add(String(u.obra_id));
    String(u?.obras_liberadas||"").split(",").map(x=>x.trim()).filter(Boolean).forEach(id=>ids.add(String(id)));
    return ids;
  }

  function usuarioDentroDoEscopo(u){
    if(currentIsOwner()) return true;
    if(Number(u?.id)===OWNER_ID) return false;
    const permitidas=idsObrasPermitidasAtual();
    return [...obrasDoUsuario(u)].some(id=>permitidas.has(String(id)));
  }

  function empresaPermitidaAtual(id){
    if(currentIsOwner()) return true;
    if(id==null||String(id).trim()==="") return false;
    const permitidas=idsObrasPermitidasAtual();
    return STATE.works.some(w=>String(w.empresa_id)===String(id)&&permitidas.has(String(w.id))) || String(current()?.empresa_id||"")===String(id);
  }

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
  const canEditSelected=()=>currentIsOwner()||(canEditUsers()&&!isOwnSelected()&&!selectedIsOwner()&&!!STATE.selected&&!STATE.selected._consulta_resumida&&norm(STATE.selected.perfil)!=="MASTER"&&(norm(current()?.perfil)!=="GESTOR"||["ADMIN","ALMOXARIFE"].includes(norm(STATE.selected.perfil))));
  const canManageSelectedAccess=()=>currentIsOwner()||(canManagePermissions()&&!isOwnSelected()&&!selectedIsOwner()&&!!STATE.selected&&!STATE.selected._consulta_resumida&&norm(STATE.selected.perfil)!=="MASTER"&&(norm(current()?.perfil)!=="GESTOR"||["ADMIN","ALMOXARIFE"].includes(norm(STATE.selected.perfil))));
  const canCreateUsers=()=>currentIsOwner()||(["MASTER","GESTOR"].includes(norm(current()?.perfil))&&hasCurrentPerm("USUARIOS_CRIAR"));

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
    {id:"GERAL",title:"🧭 Acesso geral",items:[["DASHBOARD_VER","Dashboard"],["VALORES_VER","Ver valores"]]},
    {id:"RELATORIOS",title:"📄 Relatórios",access:"RELATORIOS_VER",items:[
      ["RELATORIOS_OBRAS_PERMITIDAS","Obras permitidas (mesmas da aba Obras)"],
      ["RELATORIOS_TODAS_OBRAS","Ver todas as obras / setores"],
      ["RELATORIOS_EXPORTAR","Imprimir / exportar Excel e CSV"],
      ["PATRIMONIO_CONFERIR_RELATORIO","Conferir, assinar e consultar relatórios assinados"],
      ["SIENGE_EXPORTAR","Exportação e códigos Sienge"]
    ]},
    {id:"PATRIMONIO",title:"📦 Patrimônio",items:[["PATRIMONIO_VER","Visualizar / consultar"],["PATRIMONIO_CRIAR","Cadastrar"],["PATRIMONIO_EDITAR","Editar dados"],["PATRIMONIO_MOVIMENTAR","Movimentar"],["PATRIMONIO_IMPRIMIR","Imprimir etiquetas"],["PATRIMONIO_EXCLUIR","Excluir/inativar"],["CONFIGURAR_ETIQUETAS","Configurar etiquetas"]]},
    {id:"MANUTENCAO",title:"🔧 Manutenção",items:[["MANUTENCAO_VER","Acessar manutenção"],["MANUTENCAO_CRIAR","Enviar para manutenção"],["MANUTENCAO_SAIDA","Registrar saída / gerar link"],["MANUTENCAO_ANALISAR_ORCAMENTO","Analisar orçamento / laudo"],["MANUTENCAO_APROVAR","Aprovar, recusar ou pedir ajuste"],["MANUTENCAO_RECEBER","Registrar recebimento"],["MANUTENCAO_PREVENTIVA_GERENCIAR","Gerenciar manutenção preventiva"]] },
    {id:"EXPEDICAO",title:"🚚 Expedição",access:"EXPEDICAO_VER",items:[["SOLICITAR_MATERIAL","Novo pedido"],["APROVAR_PEDIDO_ORIGEM","Aprovar ou recusar"],["SEPARAR_PEDIDO","Separar pedido"],["EXPEDICAO_FISCAL","Fiscal / Romaneio e NF-e"],["EXPEDICAO_TRANSPORTE","Retirada e transporte"],["ENTREGAR_MATERIAL","Entregar/enviar"],["CONFERIR_MERCADORIA","Receber e conferir"]]},
    {id:"ESTOQUE",title:"📚 Estoque / Entrada",items:[["ESTOQUE_VER","Acessar estoque"],["ESTOQUE_ENTRADA","Entrada"],["ESTOQUE_SAIDA","Saída"],["ESTOQUE_TRANSFERIR","Transferir"],["ENTRADA_VER","Tela de entrada"],["TRIAGEM_VER","Triagem"]]},
    {id:"EMPRESAS",title:"🏢 Empresas / Obras",items:[["EMPRESAS_VER","Visualizar"],["EMPRESAS_CRIAR","Criar"],["EMPRESAS_EDITAR","Editar"],["EMPRESAS_INATIVAR","Inativar/reativar"],["EMPRESAS_EXCLUIR","Excluir"]]},
    {id:"USUARIOS",title:"👥 Usuários / Administração",items:[["USUARIOS_VER","Visualizar usuários"],["USUARIOS_CRIAR","Criar usuários"],["USUARIOS_EDITAR","Editar usuários"],["USUARIOS_BLOQUEAR","Bloquear usuários"],["USUARIOS_PERMISSOES","Gerenciar permissões"],["USUARIOS_OBRAS","Gerenciar vínculos de obras (em preparação)"],["USUARIOS_HISTORICO","Consultar histórico administrativo"],["CONFIGURACOES_VER","Configurações"]]}
  ];

  function aplicarPadraoRelatorios(permissoes){
    const p = permissoes instanceof Set ? permissoes : new Set(permissoes || []);

    if(!p.has("RELATORIOS_VER")){
      p.delete("RELATORIOS_OBRAS_PERMITIDAS");
      p.delete("RELATORIOS_TODAS_OBRAS");
      p.delete("RELATORIOS_EXPORTAR");
      return p;
    }

    // Acesso padrão ao Relatório:
    // - mesmas obras liberadas na aba Obras;
    // - imprimir/exportar Excel/CSV.
    // Recursos avançados continuam opcionais.
    p.add("RELATORIOS_EXPORTAR");

    if(p.has("RELATORIOS_TODAS_OBRAS")){
      p.delete("RELATORIOS_OBRAS_PERMITIDAS");
    }else{
      p.add("RELATORIOS_OBRAS_PERMITIDAS");
    }

    return p;
  }

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

  function toast(msg,tipo="sucesso"){
    const host=(window.parent && window.parent!==window) ? window.parent : window;
    const feedback=host.AtlasFeedback || window.AtlasFeedback;
    if(feedback){
      if(tipo==="erro") return feedback.erro(msg);
      if(tipo==="aviso") return feedback.aviso(msg);
      if(tipo==="info") return feedback.info(msg);
      return feedback.sucesso(msg);
    }
    return alert(msg);
  }

  function setSaving(salvando){
    const b=$("#btnSalvarPermissoes");
    if(!b) return;
    if(!b.dataset.labelOriginal) b.dataset.labelOriginal=b.innerHTML;
    b.disabled=!!salvando;
    b.innerHTML=salvando
      ? '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...'
      : b.dataset.labelOriginal;
  }

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

  async function adminSupabase(corpo){
    const {data,error}=await db().functions.invoke("atlas-admin-usuarios",{body:corpo});
    if(error){
      let mensagem=error.message||"Falha na administração de funcionários.";
      try{const detalhe=await error.context?.json?.(); mensagem=detalhe?.erro||detalhe?.error||mensagem;}catch(_){ }
      throw new Error(mensagem);
    }
    if(data?.sucesso!==true) throw new Error(data?.erro||"Operação não confirmada pelo servidor.");
    return data;
  }

  async function loadUsersScoped(){
    const cliente=db();
    const owner=currentIsOwner();
    if(!owner && norm(current()?.perfil)==="GESTOR"){
      const sessao=await cliente.auth.getSession();
      if(sessao.error||!sessao.data?.session) throw new Error("GESTOR exige sessão Supabase Auth. A listagem legada foi bloqueada por segurança.");
    }

    // Listagem autenticada do MASTER: o servidor valida a identidade e as
    // obras compartilhadas. A RPC não fornece dados para editar permissões.
    if(!owner){
      const sessao=await cliente.auth.getSession();
      if(sessao.error) throw sessao.error;
      if(sessao.data?.session){
        const resultado=await cliente.rpc("atlas_usuarios_listar_autorizados");
        if(resultado.error) throw resultado.error;
        return (resultado.data||[]).map(u=>({
          ...u,
          _consulta_resumida:true,
          _obras_vinculadas:u.obras_compartilhadas||[]
        }));
      }
    }

    // Mantém o fluxo existente do OWNER e das sessões legadas.
    // A migração do login legado exige uma etapa de segurança separada.
    const obrasPermitidas=owner?null:[...idsObrasPermitidasAtual()].map(Number).filter(Number.isFinite);
    if(!owner&&!obrasPermitidas.length) return [];

    // Nunca selecionar senha: o cadastro legado ainda possui essa coluna.
    // A consulta obedece a RLS; nao usar chaves privilegiadas no navegador.
    let vinculos=[];
    let idsUsuarios=null;
    if(!owner){
      const resposta=await cliente.from("usuario_obras")
        .select("usuario_id,obra_id").in("obra_id",obrasPermitidas);
      if(resposta.error) throw resposta.error;
      vinculos=resposta.data||[];
      idsUsuarios=[...new Set(vinculos.map(v=>Number(v.usuario_id)).filter(Number.isFinite))];
      if(!idsUsuarios.length) return [];
    }

    let consulta=cliente.from("usuarios_sistema").select(USUARIOS_COLUNAS).order("nome");
    if(!owner) consulta=consulta.in("id",idsUsuarios);
    const resultado=await consulta;
    if(resultado.error) throw resultado.error;
    const usuarios=resultado.data||[];

    if(owner&&usuarios.length){
      // Para o OWNER, carregar os vinculos de todos os usuarios retornados.
      const ids=usuarios.map(u=>u.id);
      for(let i=0;i<ids.length;i+=200){
        const r=await cliente.from("usuario_obras")
          .select("usuario_id,obra_id").in("usuario_id",ids.slice(i,i+200));
        if(r.error) throw r.error;
        vinculos.push(...(r.data||[]));
      }
    }

    const mapa=new Map();
    vinculos.forEach(v=>{
      const chave=String(v.usuario_id);
      if(!mapa.has(chave)) mapa.set(chave,new Set());
      mapa.get(chave).add(String(v.obra_id));
    });
    return usuarios.map(u=>({
      ...u,
      _obras_vinculadas:mapa.has(String(u.id))?[...mapa.get(String(u.id))]:null
    })).filter(usuarioDentroDoEscopo);
  }

  async function load(){
    if(!db())throw new Error("Supabase não carregado.");
    const ids=idsObrasPermitidasAtual();
    if(currentIsOwner()){
      STATE.works=await loadSafe("obras","nome");
    }else{
      const obraIds=[...ids].map(Number).filter(Number.isFinite);
      if(obraIds.length){
        const r=await db().from("obras").select("*").in("id",obraIds).order("nome");
        if(r.error) throw r.error;
        STATE.works=r.data||[];
      }else STATE.works=[];
    }

    const empresasPermitidas=new Set(STATE.works.map(w=>String(w.empresa_id||"")).filter(Boolean));
    if(current()?.empresa_id) empresasPermitidas.add(String(current().empresa_id));

    /* Empresas e perfis rápidos passam pela RPC transitória do módulo.
       Não abrimos SELECT direto nessas tabelas e não mexemos no Supabase Auth agora. */
    const aux=await db().rpc("atlas_usuarios_carregar_auxiliares",{
      p_executor_id:currentId()
    });
    if(aux.error) throw aux.error;
    const auxData=Array.isArray(aux.data)?(aux.data[0]||{}):(aux.data||{});
    const empresasAux=Array.isArray(auxData.empresas)?auxData.empresas:[];
    const perfisAux=Array.isArray(auxData.perfis_rapidos)?auxData.perfis_rapidos:[];

    STATE.companies=currentIsOwner()
      ? empresasAux
      : empresasAux.filter(e=>empresasPermitidas.has(String(e.id)));

    STATE.table="usuarios_sistema";
    STATE.users=await loadUsersScoped();
    STATE.profiles=perfisAux;
    STATE.profiles=STATE.profiles
      .filter(p=>p.ativo!==false)
      .filter(p=>currentIsOwner()||norm(p.nome)!=="MASTER")
      .map(p=>currentIsOwner()?p:{...p,permissoes:normalizarPermissoesPerfilRapido(p.permissoes).filter(permissaoConcedivelAtual).join(",")});
    fillFilters();renderUsers();renderProfiles();
    if($("#btnNovoUsuario")) $("#btnNovoUsuario").hidden=!canCreateUsers();
    document.documentElement.classList.remove("atlas-users-loading");
  }

  function visibleUsers(){return STATE.users.filter(u=>norm(current()?.perfil)==="GESTOR" ? (["ADMIN","ALMOXARIFE"].includes(norm(u.perfil)) && String(u.empresa_id)===String(current()?.empresa_id)) : (u._consulta_resumida||usuarioDentroDoEscopo(u)))}
  function filteredUsers(){const term=norm($("#filtroBusca").value);const pf=norm($("#filtroPerfil").value);const work=$("#filtroObraUsuario").value;const st=$("#filtroStatusUsuario").value;return visibleUsers().filter(u=>(!term||norm(`${u.nome} ${u.usuario} ${u.email}`).includes(term))&&(!pf||norm(u.perfil)===pf)&&(!work||obrasDoUsuario(u).has(String(work)))&&(!st||(st==="ATIVO")===(u.ativo!==false)))}
  function fillFilters(){const perf=[...new Set([...visibleUsers().map(u=>String(u.perfil||"").trim()),"ADMIN","ALMOXARIFE",...(currentIsOwner()?["MASTER","GESTOR"]:[])].filter(Boolean))].sort();$("#filtroPerfil").innerHTML='<option value="">Todos os perfis</option>'+perf.map(p=>`<option>${esc(p)}</option>`).join("");$("#formPerfil").innerHTML=perf.filter(p=>currentIsOwner()||(["ADMIN","ALMOXARIFE"].includes(norm(p)))).map(p=>`<option>${esc(p)}</option>`).join("")||'<option>ALMOXARIFE</option>';const opts=STATE.works.map(w=>`<option value="${w.id}">${esc(workText(w.id))}</option>`).join("");$("#filtroObraUsuario").innerHTML='<option value="">Todas as obras</option>'+opts;$("#formEmpresa").innerHTML='<option value="">Selecione</option>'+STATE.companies.map(e=>`<option value="${e.id}">${esc(e.nome||e.razao_social||e.id)}</option>`).join("");const base=$("#formObraOperacional");if(base)base.innerHTML='<option value="">Sem base operacional</option>'+STATE.works.map(w=>`<option value="${w.id}">${esc(workText(w.id))}</option>`).join("")}

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
                ${avatarHtml(user)}
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
              ${esc(worksText(user))}
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

  function criarDraftUsuario(user){
    return {
      ...user,
      permissions:new Set(permsOf(user)),
      works:obrasDoUsuario(user)
    };
  }

  async function carregarObraOperacionalUsuario(user){
    if(!user?.id) return null;
    const {data,error}=await db().rpc("atlas_obra_operacional_expedicao",{p_usuario_id:Number(user.id)});
    if(error){
      console.warn("Atlas Usuários: não foi possível carregar a base operacional.",error.message);
      return null;
    }
    const linha=Array.isArray(data)?(data[0]||null):data;
    return linha?.obra_id?Number(linha.obra_id):null;
  }

  async function selectUser(id){
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

      if(user._consulta_resumida){
        try{
          const {data:resposta,error:erroConsulta}=await db().functions.invoke("atlas-admin-usuarios",{
            body:{acao:"consultar",usuario_id:Number(user.id)}
          });
          if(erroConsulta||resposta?.sucesso!==true||!resposta?.funcionario){
            throw new Error(resposta?.erro||erroConsulta?.message||"Falha ao consultar funcionário.");
          }
          Object.assign(user,resposta.funcionario,{_consulta_resumida:false});
        }catch(error){
          // Sem dados completos, exibir apenas informações públicas da listagem.
          toast("Ficha em modo de consulta: "+error.message,"info");
        }
      }

      STATE.selected = user;

      STATE.draft = criarDraftUsuario(user);
      carregarObraOperacionalUsuario(user).then(obraId=>{
        if(String(STATE.selected?.id)!==String(user.id)) return;
        user._obra_operacional_id=obraId;
        STATE.selected._obra_operacional_id=obraId;
        if(STATE.draft) STATE.draft._obra_operacional_id=obraId;
        renderData();
      });

      // Relatórios: ao liberar o módulo, aplica o pacote padrão.
      aplicarPadraoRelatorios(STATE.draft.permissions);

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

      const selectedAvatar = $("#selectedAvatar");
      if(selectedAvatar) selectedAvatar.innerHTML = avatarHtml(user);
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
        worksText(user)
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
    const itensVisiveis=m.items.filter(([p])=>permissaoConcedivelAtual(p));
    const acessoVisivel=!m.access||permissaoConcedivelAtual(m.access);
    if(!currentIsOwner()&&!acessoVisivel&&!itensVisiveis.length) return "";

    const switchCabecalho=m.access
      ? `<label class="atlas-switch"><input type="checkbox" class="module-access" data-module="${m.id}" value="${m.access}" ${STATE.draft.permissions.has(m.access)?"checked":""} ${bloqueado?"disabled":""}><span></span></label>`
      : `<label class="atlas-switch"><input type="checkbox" class="module-master" data-module="${m.id}" ${bloqueado?"disabled":""}><span></span></label>`;

    const linhas=itensVisiveis.map(([p,l])=>{
      const padraoRelatorio = m.id === "RELATORIOS" &&
        (p === "RELATORIOS_OBRAS_PERMITIDAS" || p === "RELATORIOS_EXPORTAR");
      const travadoPadrao = padraoRelatorio &&
        STATE.draft.permissions.has("RELATORIOS_VER") &&
        !(p === "RELATORIOS_OBRAS_PERMITIDAS" && STATE.draft.permissions.has("RELATORIOS_TODAS_OBRAS"));

      return `
      <div class="atlas-permission-row ${padraoRelatorio ? "atlas-permission-default" : ""}">
        <label>${esc(l)}${padraoRelatorio ? '<small>Padrão ao liberar Relatórios</small>' : ''}</label>
        <label class="atlas-switch">
          <input type="checkbox" class="permission-toggle" value="${p}" ${STATE.draft.permissions.has(p)?"checked":""} ${(bloqueado || travadoPadrao)?"disabled":""}>
          <span></span>
        </label>
      </div>`;
    }).join("");

    const obras=m.id==="EXPEDICAO" && (currentIsOwner() || permissaoConcedivelAtual("EXPEDICAO_VER"))
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
    const preservadas=currentIsOwner()?[]:[...permsOf(STATE.selected)].filter(p=>!permissaoConcedivelAtual(p));
    const concediveis=currentIsOwner()?list:list.filter(permissaoConcedivelAtual);
    STATE.draft.permissions=new Set([...preservadas,...concediveis]);
    aplicarPadraoRelatorios(STATE.draft.permissions);
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
  function authStatusInfo(u){
    const status=String(u?.auth_status||'LEGADO').trim().toUpperCase();
    if(status==='ATIVO'&&u?.auth_user_id){
      return {status:'ATIVO',titulo:'Acesso seguro ativo',descricao:'Esta conta já autentica pelo Supabase Auth.',classe:'active'};
    }
    if(status==='AGUARDANDO_ATIVACAO'){
      return {status:'AGUARDANDO',titulo:'Aguardando ativação',descricao:'A migração foi iniciada e o usuário ainda precisa concluir o acesso seguro.',classe:'pending'};
    }
    return {status:'LEGADO',titulo:'Acesso legado',descricao:'O usuário continua entrando normalmente pelo método atual até a migração ser ativada.',classe:'legacy'};
  }

  function renderAuthStatus(){
    if(!STATE.selected)return;
    const u=STATE.draft||STATE.selected;
    const info=authStatusInfo(u);
    const titulo=$('#authStatusTitulo');
    const descricao=$('#authStatusDescricao');
    const badge=$('#authStatusBadge');
    const botao=$('#btnAtivarAcessoSeguro');
    if(titulo) titulo.textContent=info.titulo;
    if(descricao) descricao.textContent=info.descricao;
    if(badge){badge.textContent=info.status;badge.className=`atlas-auth-badge ${info.classe}`;}
    if(botao){
      const podeAtivar=currentIsOwner()&&info.status==='LEGADO';
      const podeReenviar=currentIsOwner()&&info.status==='AGUARDANDO';
      botao.hidden=!(podeAtivar||podeReenviar);
      botao.disabled=false;
      botao.innerHTML=podeReenviar
        ? '<i class="fa-regular fa-bell"></i> Reenviar aviso'
        : '<i class="fa-solid fa-shield-halved"></i> Ativar acesso seguro';
      botao.title=podeReenviar
        ? 'Disponibilizar novamente o aviso de atualização de segurança no sininho deste usuário.'
        : 'Preparar o acesso seguro deste usuário no BDR Gestão.';
    }
  }

  async function reenviarAvisoAcessoSeguro(){
    if(!currentIsOwner()||!STATE.selected) return;
    const usuario=STATE.selected;
    const botao=$('#btnAtivarAcessoSeguro');
    if(botao){botao.disabled=true;botao.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';}
    try{
      const {data:{session},error:erroSessao}=await db().auth.getSession();
      if(erroSessao||!session?.access_token) throw new Error('Sua sessão segura expirou. Entre novamente.');
      const resposta=await fetch(`${ATLAS_API_BASE_URL}/api/auth/usuarios/${encodeURIComponent(usuario.id)}/notificar-ativacao`,{
        method:'POST',
        headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
        body:'{}'
      });
      const payload=await resposta.json().catch(()=>({}));
      if(!resposta.ok||!payload.ok) throw new Error(payload.error||'Não foi possível disponibilizar o aviso.');
      toast(payload.message||'Aviso de atualização de segurança disponibilizado para o usuário.');
    }catch(error){
      toast(error.message||'Não foi possível disponibilizar o aviso.','erro');
    }finally{
      renderAuthStatus();
    }
  }

  function abrirConfirmacaoAcessoSeguro(){
    if(!currentIsOwner()||!STATE.selected) return;
    const info=authStatusInfo(STATE.selected);
    if(info.status==='AGUARDANDO'){
      reenviarAvisoAcessoSeguro();
      return;
    }
    const usuario=STATE.selected;
    const email=String(usuario.email||'').trim();
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      toast('Este usuário precisa ter um e-mail válido antes da ativação do acesso seguro.','aviso');
      return;
    }
    const nome=$('#confirmarAcessoSeguroNome');
    const emailEl=$('#confirmarAcessoSeguroEmail');
    if(nome) nome.textContent=usuario.nome||'Usuário';
    if(emailEl) emailEl.textContent=email;
    modal('modalConfirmarAcessoSeguro',true);
  }

  async function ativarAcessoSeguro(){
    if(!currentIsOwner()||!STATE.selected) return;
    const usuario=STATE.selected;
    modal('modalConfirmarAcessoSeguro',false);
    const botao=$('#btnAtivarAcessoSeguro');
    const confirmar=$('#btnConfirmarAcessoSeguro');
    if(botao){botao.disabled=true;botao.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Ativando...';}
    if(confirmar) confirmar.disabled=true;
    try{
      const {data:{session},error:erroSessao}=await db().auth.getSession();
      if(erroSessao||!session?.access_token) throw new Error('Sua sessão segura expirou. Entre novamente.');
      const resposta=await fetch(`${ATLAS_API_BASE_URL}/api/auth/usuarios/${encodeURIComponent(usuario.id)}/ativar`,{
        method:'POST',
        headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
        body:'{}'
      });
      const payload=await resposta.json().catch(()=>({}));
      if(!resposta.ok||!payload.ok) throw new Error(payload.error||'Não foi possível ativar o acesso seguro.');
      const idx=STATE.users.findIndex(u=>String(u.id)===String(usuario.id));
      if(idx>=0) STATE.users[idx]={...STATE.users[idx],...payload.user};
      STATE.selected=idx>=0?STATE.users[idx]:{...STATE.selected,...payload.user};
      STATE.draft=criarDraftUsuario(STATE.selected);

      // Confirma o estado diretamente na fonte oficial antes de redesenhar.
      // A resposta da API pode concluir a ativação antes de a tela possuir
      // todos os campos atualizados do cadastro.
      await atualizarStatusAuthSelecionado();
      renderUsers();
      renderData();
      toast(payload.message||'Acesso seguro preparado. O usuário poderá concluir a atualização dentro do BDR Gestão.',payload.notificacao_criada===false?'aviso':undefined);
    }catch(error){
      toast(error.message||'Não foi possível ativar o acesso seguro.','erro');
    }finally{
      if(confirmar) confirmar.disabled=false;
      if(botao){botao.innerHTML='<i class="fa-solid fa-shield-halved"></i> Ativar acesso seguro';renderAuthStatus();}
    }
  }

  function renderData(){if(!STATE.selected)return;const u=STATE.draft||STATE.selected;const itens=[['Nome completo',u.nome||'-'],['Usuário',u.usuario||'-'],['E-mail',u.email||'Não informado'],['Perfil',u.perfil||'-'],['Empresa',u.empresa_id||'-'],['Obras de atuação',worksText(u)],['Base operacional da Expedição',workText(u._obra_operacional_id)||'Não definida'],['Status',u.ativo===false?'INATIVO':'ATIVO'],['Perfil rápido',u.perfil_rapido||'Personalizado']];const el=$('#dataSummary');if(el)el.innerHTML=itens.map(([a,b])=>`<div class="atlas-data-card"><small>${esc(a)}</small><strong>${esc(b)}</strong></div>`).join('');renderAuthStatus()}
  function renderWorksInline(){
    const box=$('#listaObrasInline');
    if(!box)return;

    const termo=norm($('#buscaObrasInline')?.value||'');
    const bloqueado=!canManageSelectedAccess();

    box.innerHTML=STATE.works
      .filter(w=>norm(workText(w.id)).includes(termo))
      .map(w=>`<label class="atlas-work-row"><input class="work-inline-check" type="checkbox" value="${w.id}" ${STATE.expeditionWorksDraft.has(String(w.id))?'checked':''} ${bloqueado?'disabled':''}><span>${esc(workText(w.id))}</span></label>`)
      .join('')||'<div class="atlas-empty">Nenhuma obra encontrada.</div>';

    if($("#btnMarcarObrasInline")) $("#btnMarcarObrasInline").disabled=bloqueado;
    if($("#btnDesmarcarObrasInline")) $("#btnDesmarcarObrasInline").disabled=bloqueado;
  }
  function renderHistory(){const u=STATE.selected;if(!u)return;const rows=[['fa-user-plus','Cadastro criado',u.created_at?new Date(u.created_at).toLocaleString('pt-BR'):'Data não informada'],['fa-pen-to-square','Última atualização',u.updated_at?new Date(u.updated_at).toLocaleString('pt-BR'):'Data não informada'],['fa-right-to-bracket','Último acesso',u.ultimo_acesso?new Date(u.ultimo_acesso).toLocaleString('pt-BR'):'Ainda não registrado'],['fa-user-shield','Perfil atual',u.perfil||'-'],['fa-building','Obras de atuação',worksText(u)]];const el=$('#historyTimeline');if(el)el.innerHTML=rows.map(([i,t,d])=>`<div class="atlas-history-item"><div class="atlas-history-icon"><i class="fa-solid ${i}"></i></div><div><strong>${esc(t)}</strong><span>${esc(d)}</span></div></div>`).join('')}
  function renderProfiles(){const owner=currentIsOwner();$("#quickProfiles").innerHTML=STATE.profiles.length?STATE.profiles.map(p=>`<article class="atlas-profile-card" data-profile-id="${p.id}"><i class="fa-solid fa-user-shield"></i><h3>${esc(p.nome)}</h3><p>${esc(p.descricao||"Perfil rápido")}</p><div class="actions"><button class="apply-profile" data-profile-id="${p.id}">Aplicar</button>${owner?`<button class="edit-profile" data-profile-id="${p.id}">Editar</button>`:""}</div></article>`).join(""):'<div class="atlas-empty">Nenhum perfil rápido encontrado.</div>'}


  async function savePermissions(){
    if(!STATE.selected) return;
    setSaving(true);

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

    const r=await db().rpc("atlas_usuarios_salvar",{
        p_acao:"ATUALIZAR",
        p_usuario_id:Number(STATE.selected.id),
        p_dados:payload,
        p_executor_id:currentId()
      });

      if(r.error){
        setSaving(false);
        toast("Não foi possível salvar: "+r.error.message,"erro");
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
      setSaving(false);
      toast("Preferências de notificações salvas com sucesso.");
      return;
    }

    /*
      ADMINISTRAÇÃO DE ACESSO:
      somente quem possui autorização para gerenciar o usuário selecionado.
    */
    if(!canManageSelectedAccess()){
      setSaving(false);
      toast("Você não possui permissão para gerenciar acessos deste usuário.","erro");
      return;
    }

    const originais=permsOf(STATE.selected);
    const p=new Set(
      [...STATE.draft.permissions]
        .filter(x=>!LEGACY_MODULE_TOKENS.has(norm(x)))
        .filter(x=>currentIsOwner()||permissaoConcedivelAtual(x))
    );
    if(!currentIsOwner()){
      [...originais].filter(x=>!permissaoConcedivelAtual(x)).forEach(x=>p.add(x));
    }

    aplicarPadraoRelatorios(p);
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
      obra_id:null,
      obras_liberadas:[...STATE.worksDraft].filter(obraPermitidaAtual).join(","),
      updated_at:new Date().toISOString()
    };

    let r;
    if(!currentIsOwner()){
      try{
        if(norm(payload.perfil)!==norm(STATE.selected.perfil))
          throw new Error("Alteração de perfil hierárquico deve ser feita pelo OWNER.");
        if([...STATE.worksDraft].sort().join(",")!==[...obrasDoUsuario(STATE.selected)].sort().join(","))
          throw new Error("Alteração de obras requer transação segura e ainda não está disponível.");
        const retorno=await adminSupabase({acao:"editar",usuario_id:Number(STATE.selected.id),
          alteracoes:{permissoes:[...p],perfil_rapido:payload.perfil_rapido}});
        r={data:retorno.funcionario,error:null};
      }catch(erro){r={error:erro}}
    }else{
      r=await db().rpc("atlas_usuarios_salvar",{
        p_acao:"ATUALIZAR",p_usuario_id:Number(STATE.selected.id),
        p_dados:payload,p_executor_id:currentId()
      });
    }

    if(r.error){
      setSaving(false);
      toast("Não foi possível salvar: "+r.error.message,"erro");
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
    const pend=$("#pendingChangesText");
    if(pend){
      pend.textContent="Alterações salvas com sucesso";
      pend.classList.add("save-success");
      clearTimeout(global.__uSaveOk);
      global.__uSaveOk=setTimeout(()=>{
        pend.classList.remove("save-success");
        if(!STATE.dirty) pend.textContent="Nenhuma alteração pendente";
      },3200);
    }
    setSaving(false);
    toast("Alterações salvas com sucesso.");
  }

  function atualizarPreviewFoto(user=null){
    const box=$("#formAvatarPreview");
    if(!box)return;
    if(fotoArquivoPendente){
      const url=URL.createObjectURL(fotoArquivoPendente);
      box.innerHTML=`<img class="atlas-avatar-img" src="${esc(url)}" alt="Prévia da foto">`;
      box.querySelector("img")?.addEventListener("load",()=>URL.revokeObjectURL(url),{once:true});
      return;
    }
    if(removerFotoPendente){box.textContent=initials($("#formNome")?.value||user?.nome);return}
    box.innerHTML=avatarHtml(user||{nome:$("#formNome")?.value});
  }
  function atualizarResumoFormObras(){
    const qtd=STATE.formWorksDraft.size;
    const resumo=$("#formObrasResumo");
    if(resumo) resumo.textContent=qtd?`${qtd} obra${qtd===1?"":"s"} selecionada${qtd===1?"":"s"}`:"Selecionar obras";
  }

  // A base de Expedição é uma das obras do funcionário e da empresa escolhida.
  function sincronizarBaseOperacional(){
    const base=$("#formObraOperacional");
    if(!base)return;
    const empresa=String($("#formEmpresa")?.value||"");
    const obras=STATE.works.filter(w=>STATE.formWorksDraft.has(String(w.id)) && String(w.empresa_id)===empresa);
    const anterior=base.value;
    base.innerHTML='<option value="">Selecione a base operacional</option>'+obras.map(w=>`<option value="${w.id}">${esc(workText(w.id))}</option>`).join("");
    if(obras.some(w=>String(w.id)===anterior))base.value=anterior;
    else if(obras.length===1)base.value=String(obras[0].id);
    else base.value="";
    base.disabled=obras.length===0;
  }

  function renderFormObras(){
    const box=$("#listaFormObras");
    if(!box) return;
    const termo=norm($("#buscaFormObras")?.value||"");
    box.innerHTML=STATE.works
      .filter(w=>!termo||norm(workText(w.id)).includes(termo))
      .map(w=>`<label class="atlas-work-row"><input class="form-work-check" type="checkbox" value="${w.id}" ${STATE.formWorksTemp.has(String(w.id))?"checked":""}><span>${esc(workText(w.id))}</span></label>`)
      .join("")||'<div class="atlas-empty">Nenhuma obra encontrada.</div>';
    const contador=$("#formObrasContador");
    if(contador) contador.textContent=`${STATE.formWorksTemp.size} selecionada${STATE.formWorksTemp.size===1?"":"s"}`;
  }

  function abrirFormObras(){
    STATE.formWorksTemp=new Set(STATE.formWorksDraft);
    if($("#buscaFormObras")) $("#buscaFormObras").value="";
    renderFormObras();
    modal("modalFormObras",true);
  }

  async function openUserModal(user=null,focusPassword=false){
    if(user?(!canEditSelected()):(!canCreateUsers()))return;
    if(user&&Number(user.id)===OWNER_ID&&!currentIsOwner())return;
    fotoArquivoPendente=null; removerFotoPendente=false;
    $("#formId").value=user?.id||"";$("#formNome").value=user?.nome||"";$("#formUsuario").value=user?.usuario||"";$("#formEmail").value=user?.email||"";$("#formPerfil").value=user?.perfil||$("#formPerfil option")?.value||"ALMOXARIFE";$("#formEmpresa").value=user?.empresa_id||"";$("#formAtivo").value=String(user?.ativo!==false);$("#formSenha").value="";
    STATE.formWorksDraft=obrasDoUsuario(user||{});
    const obraOperacional=user?await carregarObraOperacionalUsuario(user):null;
    if(user) user._obra_operacional_id=obraOperacional;
    const baseOperacional=$("#formObraOperacional");
    if(baseOperacional) baseOperacional.value=obraOperacional?String(obraOperacional):"";
    sincronizarBaseOperacional();
    atualizarResumoFormObras();
    if($("#formFotoArquivo")) $("#formFotoArquivo").value="";
    $("#modalUsuarioTitulo").textContent=user?"Editar usuário":"Novo usuário";
    const senhaLabel=$("#formSenha")?.closest("label");
    if(senhaLabel){
      // A senha provisória é exibida apenas durante esta edição.
      let controles=senhaLabel.querySelector("#atlasSenhaControles");
      if(!controles){
        controles=document.createElement("div");
        controles.id="atlasSenhaControles";
        controles.style.cssText="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px";
        const olho=document.createElement("button");
        olho.type="button";olho.id="atlasMostrarSenha";
        olho.style.cssText="border:1px solid #d5dce6;background:#fff;color:#344054;border-radius:9px;padding:9px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer";
        olho.textContent="Mostrar senha";
        olho.onclick=()=>{
          const campo=$("#formSenha");
          const mostrar=campo.type==="password";
          campo.type=mostrar?"text":"password";
          olho.textContent=mostrar?"Ocultar senha":"Mostrar senha";
          olho.setAttribute("aria-pressed",String(mostrar));
        };
        const copiar=document.createElement("button");
        copiar.type="button";copiar.id="atlasCopiarSenha";
        copiar.style.cssText="border:1px solid #d5dce6;background:#fff;color:#344054;border-radius:9px;padding:9px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer";
        copiar.textContent="Copiar senha";
        copiar.onclick=async()=>{
          const valor=$("#formSenha")?.value||"";
          if(!valor){alert("Digite uma senha provisória primeiro.");return;}
          try{
            await navigator.clipboard.writeText(valor);
            copiar.textContent="Copiada ✓";
            setTimeout(()=>{if(copiar.isConnected)copiar.textContent="Copiar senha";},2000);
          }catch(_){alert("Não foi possível copiar automaticamente. Selecione o campo para copiar.");}
        };
        controles.append(olho,copiar);
        senhaLabel.appendChild(controles);
      }
      $("#formSenha").type="password";
      const olho=senhaLabel.querySelector("#atlasMostrarSenha");
      if(olho){olho.textContent="Mostrar senha";olho.setAttribute("aria-pressed","false");}
      const copiar=senhaLabel.querySelector("#atlasCopiarSenha");
      if(copiar)copiar.textContent="Copiar senha";
      senhaLabel.hidden=!user || !currentIsOwner();
      let botao=senhaLabel.querySelector("#btnRedefinirSenhaSeparada");
      if(!botao){
        botao=document.createElement("button");
        botao.type="button";
        botao.id="btnRedefinirSenhaSeparada";
        botao.className="btn btn-secondary";
        botao.style.cssText="display:block;margin-top:12px;padding:11px 16px;border:0;border-radius:9px;background:#a30e1a;color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer;max-width:100%;white-space:normal";
        senhaLabel.appendChild(botao);
        botao.onclick=redefinirSenhaSeparada;
      }
      const info=authStatusInfo(user);
      botao.textContent=info.status==='ATIVO'?"Definir senha provisória (Supabase Auth)":info.status==='LEGADO'?"Redefinir senha (legado)":"Ativação pendente — redefinição indisponível";
      botao.disabled=info.status==='AGUARDANDO';
      const aviso=senhaLabel.querySelector("#avisoSenhaSeparada")||document.createElement("small");
      aviso.id="avisoSenhaSeparada";
      aviso.textContent="Digite a senha (8 a 128 caracteres) e clique em Definir. Depois da confirmação, use Mostrar ou Copiar. Salvar usuário não altera credenciais.";
      aviso.style.cssText="display:block;margin-top:8px;font-size:12px;line-height:1.5;color:#667085";
      if(!aviso.parentNode)senhaLabel.appendChild(aviso);
    }
    atualizarPreviewFoto(user); modal("modalUsuario",true);if(focusPassword&&user)setTimeout(()=>$("#formSenha").focus(),80)
  }
  async function enviarAvatarAtlas(arquivo){
    const client=db();
    const sessao=await client?.auth?.getSession?.();
    const token=sessao?.data?.session?.access_token;
    if(!token) throw new Error("Sua conta ainda não possui uma sessão Supabase Auth válida para enviar imagens.");
    const form=new FormData(); form.append("avatar",arquivo);
    const resposta=await fetch("https://arquivos.sathtech.com.br/api/avatars",{method:"POST",headers:{Authorization:`Bearer ${token}`},body:form});
    let body={}; try{body=await resposta.json()}catch(_){ }
    if(!resposta.ok||!body?.file?.path) throw new Error(body?.error||`Falha no envio da foto (HTTP ${resposta.status}).`);
    return body.file.path;
  }
  async function redefinirSenhaSeparada(){
    const id=Number($("#formId")?.value);
    const senha=$("#formSenha")?.value||"";
    if(!currentIsOwner()||!Number.isSafeInteger(id)||id<=0){alert("Somente o OWNER pode redefinir senhas.");return;}
    if(senha.length<8||senha.length>128){alert("Informe uma senha provisória de 8 a 128 caracteres.");return;}
    if(!confirm("Redefinir SOMENTE a senha deste funcionário? Outras alterações do formulário não serão salvas."))return;
    const botao=$("#btnRedefinirSenhaSeparada");
    if(botao)botao.disabled=true;
    try{
      const {data:{session},error:erroSessao}=await db().auth.getSession();
      if(erroSessao||!session?.access_token)throw new Error("Sessão Supabase Auth inválida. Entre novamente.");
      const {data:retorno,error:erroFuncao}=await db().functions.invoke("atlas-senhas",{
        body:{acao:"redefinir",usuario_id:id,senha}
      });
      if(erroFuncao){
        let detalhe="Não foi possível contatar o serviço de senhas.";
        try{const resposta=await erroFuncao.context?.json?.();detalhe=resposta?.error||detalhe;}catch(_e){}
        throw new Error(detalhe);
      }
      if(!retorno?.ok)throw new Error(retorno?.error||"Redefinição não confirmada.");
      // Não apagar a senha antes de o administrador poder conferi-la e copiá-la.
      // openUserModal limpa o campo ao reabrir o formulário.
      const campoSenha=$("#formSenha");
      if(campoSenha)campoSenha.type="password";
      const botaoOlho=$("#atlasMostrarSenha");
      if(botaoOlho){botaoOlho.textContent="Mostrar senha";botaoOlho.setAttribute("aria-pressed","false");}
      toast("Senha provisória definida. Confira e copie antes de fechar este formulário.");
      await load();
    }catch(erro){alert("Senha não redefinida: "+erro.message);}
    finally{if(botao)botao.disabled=false;}
  }

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

    const payload={
      nome:$("#formNome").value.trim(),
      usuario:$("#formUsuario").value.trim(),
      email:$("#formEmail").value.trim()||null,
      perfil:$("#formPerfil").value,
      empresa_id:$("#formEmpresa").value?Number($("#formEmpresa").value):null,
      obra_id:null,
      obra_operacional_id:$("#formObraOperacional")?.value?Number($("#formObraOperacional").value):null,
      ativo:$("#formAtivo").value==="true",
      updated_at:new Date().toISOString()
    };
    payload.obras_liberadas=[...STATE.formWorksDraft].join(",");
    const senha=$("#formSenha").value.trim();

    if(!currentIsOwner()){
      if(!id && [...STATE.formWorksDraft].some(obraId=>!obraPermitidaAtual(obraId))){alert("Você só pode vincular usuários às suas obras liberadas.");return}
      if(payload.empresa_id&&!empresaPermitidaAtual(payload.empresa_id)){alert("Você só pode vincular usuários às suas empresas liberadas.");return}
      if(["MASTER","GESTOR"].includes(norm(payload.perfil))){alert("Somente o OWNER ID 1 pode cadastrar MASTER ou GESTOR.");return}
    }
    if(!payload.nome||!payload.usuario){alert("Informe nome e usuário.");return}
    if(!payload.empresa_id){alert("Selecione a empresa do funcionário.");return}
    const obrasSelecionadas=[...STATE.formWorksDraft].map(id=>STATE.works.find(w=>String(w.id)===String(id)));
    if(obrasSelecionadas.some(w=>!w || String(w.empresa_id)!==String(payload.empresa_id))){
      alert("As obras de atuação precisam pertencer à empresa selecionada. Ajuste as obras ou a empresa.");return;
    }
    if(!id && !payload.obra_operacional_id){alert("Selecione a base operacional da Expedição.");return}
    if(payload.obra_operacional_id && !STATE.formWorksDraft.has(String(payload.obra_operacional_id))){
      alert("A base operacional da Expedição também precisa estar marcada nas Obras de atuação.");
      return;
    }
    // Edição: senha é operação separada, autorizada pelo backend e não pelo RPC de cadastro.
    // Novos usuários nunca recebem senha legada.
    if(senha && id && !currentIsOwner()) { alert("Somente o OWNER pode redefinir senhas de funcionários."); return; }
    if(senha && id && senha.length < 8) { alert("A senha provisória precisa ter pelo menos 8 caracteres."); return; }

    if(!id){
      if(!payload.email){alert("Informe o e-mail do funcionário para enviar a ativação segura.");return}
      const prof=STATE.profiles.find(p=>norm(p.nome)===norm(payload.perfil));
      const perfilPerms=normalizarPermissoesPerfilRapido(prof?.permissoes||"").filter(permissaoConcedivelAtual);
      Object.assign(payload,{
        permissoes:perfilPerms.join(","),
        perfil_rapido:prof?.nome||payload.perfil,
        obras_liberadas:[...STATE.formWorksDraft].join(",")
      });
    }

    // Redefinição é ação independente, nunca parte de Salvar usuário.
    if(id && senha){
      alert("Para redefinir a senha, use o botão próprio. Salvar usuário não altera credenciais.");
      return;
    }

    if(!id){
      try{
        const {data:{session},error:erroSessao}=await db().auth.getSession();
        if(erroSessao || !session?.access_token) throw new Error("Para criar funcionários é necessário entrar com uma conta Supabase Auth autorizada.");
        const permissoesCadastro=String(payload.permissoes||"").split(",").map(p=>p.trim().toUpperCase()).filter(Boolean);
        if(!STATE.formWorksDraft.size) throw new Error("Selecione pelo menos uma obra de atuação.");
        if(!permissoesCadastro.length) throw new Error("O perfil escolhido não possui permissões definidas. Configure um perfil rápido antes de cadastrar.");
        if(!["ADMIN","ALMOXARIFE","MASTER","GESTOR"].includes(norm(payload.perfil))) throw new Error("Perfil incompatível com o cadastro seguro.");
        if(norm(current()?.perfil)==="GESTOR"&&! ["ADMIN","ALMOXARIFE"].includes(norm(payload.perfil))) throw new Error("GESTOR só pode cadastrar ADMIN ou ALMOXARIFE.");
        if(payload.ativo!==true) throw new Error("Cadastro inicial de usuário inativo ainda não está disponível no fluxo seguro.");
        if(fotoArquivoPendente) throw new Error("Cadastre primeiro o funcionário; o envio da foto será feito após a criação.");
        const {data:retorno,error:erroFuncao}=await db().functions.invoke("atlas-admin-usuarios",{
          method:"POST",
          body:{
            nome:payload.nome,usuario:payload.usuario,email:payload.email,perfil:payload.perfil,
            empresa_id:payload.empresa_id,permissoes:permissoesCadastro,
            obra_operacional_id:payload.obra_operacional_id,
            obras:[...STATE.formWorksDraft].map(Number)
          }
        });
        if(erroFuncao){
          let detalhe=erroFuncao.message||"Falha na Edge Function de cadastro.";
          try{const corpoErro=await erroFuncao.context?.json?.();detalhe=corpoErro?.erro||corpoErro?.error||detalhe;}catch(_){ }
          throw new Error(detalhe);
        }
        if(retorno?.sucesso!==true||!retorno?.funcionario?.id) throw new Error(retorno?.erro||"A Edge Function não confirmou o cadastro.");
        modal("modalUsuario",false);
        await load();
        await selectUser(retorno.funcionario.id);
        if(retorno.senha_provisoria){
          alert("Funcionário criado no Supabase Auth.\n\nSenha provisória (exibida uma única vez): "+retorno.senha_provisoria+"\n\nA troca obrigatória de senha ainda precisa ser validada antes de liberar o acesso.");
        }
        toast(retorno.mensagem||"Usuário criado no Supabase Auth.");
      }catch(erro){alert("Cadastro seguro não concluído: "+erro.message)}
      return;
    }

    if(id && !currentIsOwner()){
      try{
        const alteracoes={nome:payload.nome,usuario:payload.usuario,email:payload.email};
        if(payload.ativo!==STATE.selected.ativo){
          if(!hasCurrentPerm("USUARIOS_BLOQUEAR"))throw new Error("Sem permissão para bloquear ou reativar usuários.");
          alteracoes.ativo=payload.ativo;
        }
        // O formulário também permite escolher obras; não fingir que essa mudança foi salva.
        if([...STATE.formWorksDraft].sort().join(",")!==[...obrasDoUsuario(STATE.selected)].sort().join(","))
          throw new Error("A edição de vínculos de obras ainda não está disponível com segurança.");
        const retorno=await adminSupabase({acao:"editar",usuario_id:Number(id),alteracoes});
        Object.assign(STATE.selected,retorno.funcionario);
        modal("modalUsuario",false);
        await load();
        await selectUser(id);
        toast("Dados cadastrais atualizados.");
      }catch(erro){alert("Alteração não concluída: "+erro.message)}
      return;
    }
    const r=await db().rpc("atlas_usuarios_salvar",{
      p_acao:id?"ATUALIZAR":"CRIAR",
      p_usuario_id:id?Number(id):null,
      p_dados:payload,
      p_executor_id:currentId()
    });
    if(r.error){
      alert((id && senha ? "A senha foi redefinida, mas os demais dados do cadastro NÃO foram salvos: " : "Erro ao salvar usuário: ")+r.error.message);
      return;
    }

    modal("modalUsuario",false);
    await load();
    const saved=Array.isArray(r.data)?r.data[0]:r.data;
    if(saved?.id){
      saved._obra_operacional_id=payload.obra_operacional_id||null;
      const salvoLocal=STATE.users.find(u=>Number(u.id)===Number(saved.id));
      if(salvoLocal) salvoLocal._obra_operacional_id=saved._obra_operacional_id;
      selectUser(saved.id);
      if(Number(saved.id)===currentId()){
        const atualizado=STATE.users.find(u=>Number(u.id)===Number(saved.id))||saved;
        localStorage.setItem("usuario_logado",JSON.stringify(atualizado));
        localStorage.setItem("usuarioLogado",JSON.stringify(atualizado));
        try{hostWindow().dispatchEvent(new CustomEvent("atlas:usuario-atualizado",{detail:atualizado}))}catch(_){ }
      }
    }
    fotoArquivoPendente=null; removerFotoPendente=false;
    toast("Usuário salvo com sucesso.");
  }

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
    ["filtroBusca","filtroPerfil","filtroObraUsuario","filtroStatusUsuario"].forEach(id=>{
      const campo=$("#"+id);
      if(!campo)return;
      campo.addEventListener(
        id==="filtroBusca"?"input":"change",
        ()=>{
          STATE.page=1;
          renderUsers();
          if(id==="filtroBusca"){
            const encontrados=filteredUsers();
            if(encontrados.length===1 && String(STATE.selected?.id)!==String(encontrados[0].id)){
              selectUser(encontrados[0].id);
            }
          }
        }
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
    if($("#btnAtivarAcessoSeguro"))$("#btnAtivarAcessoSeguro").onclick=abrirConfirmacaoAcessoSeguro;
    if($("#btnConfirmarAcessoSeguro"))$("#btnConfirmarAcessoSeguro").onclick=ativarAcessoSeguro;
    if($("#formFotoArquivo"))$("#formFotoArquivo").onchange=e=>{fotoArquivoPendente=e.target.files?.[0]||null;removerFotoPendente=false;atualizarPreviewFoto(STATE.selected)};
    if($("#btnRemoverFoto"))$("#btnRemoverFoto").onclick=()=>{fotoArquivoPendente=null;removerFotoPendente=true;if($("#formFotoArquivo"))$("#formFotoArquivo").value="";atualizarPreviewFoto(STATE.selected)};
    if($("#formNome"))$("#formNome").addEventListener("input",()=>{if(!fotoArquivoPendente&&!STATE.selected?.foto_url)atualizarPreviewFoto(STATE.selected)});
    if($("#formEmpresa")) $("#formEmpresa").addEventListener("change",sincronizarBaseOperacional);
    if($("#btnFormObras")) $("#btnFormObras").onclick=abrirFormObras;
    if($("#buscaFormObras")) $("#buscaFormObras").oninput=renderFormObras;
    $("#listaFormObras")?.addEventListener("change",event=>{
      if(!event.target.classList.contains("form-work-check")) return;
      event.target.checked?STATE.formWorksTemp.add(String(event.target.value)):STATE.formWorksTemp.delete(String(event.target.value));
      renderFormObras();
    });
    if($("#btnAplicarFormObras")) $("#btnAplicarFormObras").onclick=()=>{
      STATE.formWorksDraft=new Set(STATE.formWorksTemp);
      atualizarResumoFormObras();
      sincronizarBaseOperacional();
      modal("modalFormObras",false);
    };
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
        const valor = event.target.value;

        if(valor === "RELATORIOS_OBRAS_PERMITIDAS" && event.target.checked){
          STATE.draft.permissions.delete("RELATORIOS_TODAS_OBRAS");
        }

        if(valor === "RELATORIOS_TODAS_OBRAS" && event.target.checked){
          STATE.draft.permissions.delete("RELATORIOS_OBRAS_PERMITIDAS");
        }

        updatePerm(valor,event.target.checked);
        aplicarPadraoRelatorios(STATE.draft.permissions);
        renderPermissions();
      }

      if(event.target.classList.contains("module-access")){
        const valor = event.target.value;
        updatePerm(valor,event.target.checked);

        if(valor === "RELATORIOS_VER"){
          aplicarPadraoRelatorios(STATE.draft.permissions);
        }

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
        ? STATE.expeditionWorksDraft.add(event.target.value)
        : STATE.expeditionWorksDraft.delete(event.target.value);

      // Destinos de Expedição não modificam as Obras de atuação.
      setDirty();
      renderSummary();
    });

    if($("#btnMarcarObrasInline")){
      $("#btnMarcarObrasInline").onclick=()=>{
        if(!canManageSelectedAccess()) return;
        STATE.expeditionWorksDraft=new Set(STATE.works.map(work=>String(work.id)));
        renderWorksInline();
        setDirty();
        renderSummary();
      };
    }

    if($("#btnDesmarcarObrasInline")){
      $("#btnDesmarcarObrasInline").onclick=()=>{
        if(!canManageSelectedAccess()) return;
        STATE.expeditionWorksDraft.clear();
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

  let atualizandoStatusAuth=false;
  async function atualizarStatusAuthSelecionado(){
    if(atualizandoStatusAuth||!STATE.selected?.id||STATE.dirty||!db()) return;
    atualizandoStatusAuth=true;
    try{
      const {data,error}=await db().from("usuarios_sistema")
        .select("id,auth_status,auth_user_id,auth_ativado_em,auth_ativado_por")
        .eq("id",Number(STATE.selected.id)).maybeSingle();
      if(error||!data) return;
      const idx=STATE.users.findIndex(u=>Number(u.id)===Number(data.id));
      if(idx>=0) Object.assign(STATE.users[idx],data);
      Object.assign(STATE.selected,data);
      if(STATE.draft) Object.assign(STATE.draft,data);
      renderUsers();
      renderAuthStatus();
    }catch(_){ }finally{atualizandoStatusAuth=false;}
  }

  function initTop(){
    const user=current();
    const nome=$("#usuarioNome");
    const perfil=$("#usuarioPerfil");

    if(nome)nome.textContent="Olá, "+(user?.nome||"Usuário");
    if(perfil)perfil.textContent=Number(user?.id)===OWNER_ID?"OWNER":(user?.perfil||"-");
    if($("#btnNovoUsuario")) $("#btnNovoUsuario").hidden=!canCreateUsers();
  }

  let iniciado=false;
  let ultimoHost=null;
  let listenersStatusAuthRegistrados=false;
  async function init(){
    const host=document.querySelector('.atlas-shell-module[data-module="usuarios"]');
    if(!host) return;
    if(host!==ultimoHost){
      ultimoHost=host;
      initTop();
      bind();
      if(!listenersStatusAuthRegistrados){
        listenersStatusAuthRegistrados=true;
        window.addEventListener("focus",atualizarStatusAuthSelecionado);
        document.addEventListener("visibilitychange",()=>{if(!document.hidden) atualizarStatusAuthSelecionado();});
      }
    }
    iniciado=true;
    try{await load()}catch(e){document.documentElement.classList.remove("atlas-users-loading");alert(e.message||"Não foi possível carregar usuários.")}
  }

  global.AtlasUsuarios = {loaded:true,state:STATE,selectUser,load,iniciar:init};

  if(document.body?.classList.contains('atlas-shell-page')){
    window.addEventListener('atlas:module-loaded',event=>{
      if(event.detail?.module==='usuarios') init();
    });
  }else if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();

})(window);