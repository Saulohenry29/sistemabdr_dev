(function(global){
  "use strict";
  if(global.AtlasUsuarios?.loaded) return;

  const STATE={users:[],works:[],companies:[],profiles:[],selected:null,draft:null,page:1,pageSize:8,table:"usuarios_sistema",dirty:false,worksDraft:new Set(),expeditionWorksDraft:new Set(),formWorksDraft:new Set(),formWorksTemp:new Set()};
  const OWNER_ID=1;
  function atlasSenhaValida(valor){
    if(typeof valor!=="string" || valor.length<8 || valor.length>128 || /[\u0000-\u001f\u007f]/.test(valor))return false;
    return [/[a-z]/.test(valor),/[A-Z]/.test(valor),/[0-9]/.test(valor),/[^A-Za-z0-9]/.test(valor)].filter(Boolean).length>=2;
  }
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
    const nome=norm(token);
    // Acesso global e delegação privilegiada são exclusivos do OWNER,
    // mesmo que uma conta MASTER antiga ainda tenha esses tokens.
    if(!currentIsOwner() && ["TODAS_OBRAS_VER","RELATORIOS_TODAS_OBRAS","ADMINISTRACAO_DELEGADA"].includes(nome))return false;
    return currentIsOwner()||permissoesConcediveisAtual().has(nome);
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
  // Espelha a autorização da Edge Function atlas-admin-usuarios.
  // Não concede permissão: o servidor valida perfil, alvo e todas as obras.
  const podeRedefinirSenhaAuth=()=>currentIsOwner()||(
    ["MASTER","GESTOR"].includes(norm(current()?.perfil)) &&
    hasCurrentPerm("USUARIOS_EDITAR") && hasCurrentPerm("USUARIOS_PERMISSOES")
  );
  const isOwnSelected=()=>Number(STATE.selected?.id||0)===currentId();
  const selectedIsOwner=()=>Number(STATE.selected?.id||0)===OWNER_ID;
  const HIERARQUIA_PERFIS=["ALMOXARIFE","ADMIN","GESTOR","MASTER"];
  const nivelPerfil=perfil=>HIERARQUIA_PERFIS.indexOf(norm(perfil));
  const podeGerenciarPerfil=perfil=>currentIsOwner() ||
    (nivelPerfil(perfil)>=0 && nivelPerfil(current()?.perfil)>=nivelPerfil(perfil));
  // O botão pode responder imediatamente; os dados completos e a autorização
  // continuam obrigatórios no servidor ANTES de abrir o formulário de edição.
  const podeSolicitarEdicaoSelecionada=()=>!!STATE.selected && !STATE.selected._consulta_negada &&
    (currentIsOwner() || (canEditUsers() && !isOwnSelected() && !selectedIsOwner() && podeGerenciarPerfil(STATE.selected.perfil)));
  const canEditSelected=()=>podeSolicitarEdicaoSelecionada() && !STATE.selected._consulta_resumida;
  const canManageSelectedAccess=()=>!!STATE.selected && !STATE.selected._consulta_resumida &&
    (currentIsOwner() || (canManagePermissions() && !isOwnSelected() && !selectedIsOwner() && podeGerenciarPerfil(STATE.selected.perfil)));
  const canCreateUsers=()=>currentIsOwner() || (nivelPerfil(current()?.perfil)>=0 && hasCurrentPerm("USUARIOS_CRIAR"));
  // Cada perfil gerencia até o seu próprio nível. Obras e permissões não são herdadas por hierarquia.
  const perfisCriaveis=()=>currentIsOwner()?[...HIERARQUIA_PERFIS].reverse():
    HIERARQUIA_PERFIS.filter(p=>nivelPerfil(p)<=nivelPerfil(current()?.perfil)).reverse();
  const podeCriarPerfil=perfil=>canCreateUsers() && perfisCriaveis().includes(norm(perfil));

  // O login visual legado não é uma credencial para operações administrativas.
  // Exigir a identidade confirmada pelo Auth e nunca confiar no id do localStorage
  // como autorização do servidor. O backend repete todas as verificações.
  let reautenticacaoPendente=null;
  let cadastroEmAndamento=false;
  async function sessaoCadastroValida(){
    const cliente=db();
    const usuario=current();
    if(!cliente?.auth || !usuario?.auth_user_id || (usuario.auth_status && norm(usuario.auth_status)!=="ATIVO")) return false;
    try{
      const {data,error}=await cliente.auth.getSession();
      const token=data?.session?.access_token;
      if(error || !token) return false;
      const {data:identidade,error:erroIdentidade}=await cliente.auth.getUser(token);
      return !erroIdentidade &&
        String(identidade?.user?.id||"").toLowerCase() === String(usuario.auth_user_id).toLowerCase();
    }catch(_){return false;}
  }

  function solicitarReautenticacaoCadastro(){
    if(reautenticacaoPendente) return reautenticacaoPendente;
    reautenticacaoPendente=new Promise(resolve=>{
      const usuario=current()||{};
      const email=String(usuario.email||"").trim().toLowerCase();
      const identidadeEsperada=String(usuario.auth_user_id||"").trim().toLowerCase();
      if(!email || !identidadeEsperada || (usuario.auth_status && norm(usuario.auth_status)!=="ATIVO")){
        alert("Sua conta ainda não está vinculada ao Supabase Auth. Entre novamente no Atlas com sua conta segura ou solicite a ativação ao administrador.");
        resolve(false);return;
      }
      const fundo=document.createElement("div");
      fundo.id="atlasReauthModal";
      fundo.className="atlas-reauth-fundo";
      const caixa=document.createElement("form");
      caixa.className="atlas-reauth-caixa";
      caixa.setAttribute("role","dialog");
      caixa.setAttribute("aria-modal","true");
      caixa.setAttribute("aria-labelledby","atlasReauthTitulo");
      caixa.noValidate=true;
      const titulo=document.createElement("h2");
      titulo.id="atlasReauthTitulo";
      titulo.textContent="Confirmar acesso seguro";
      const explicacao=document.createElement("p");
      explicacao.textContent="Para cadastrar funcionários, confirme sua própria senha do Atlas. Isso renova a sessão Supabase Auth sem apagar o formulário. Nenhuma permissão será alterada.";
      const conta=document.createElement("div");
      conta.className="atlas-reauth-conta";
      conta.textContent=email;
      const rotulo=document.createElement("label");
      rotulo.setAttribute("for","atlasReauthSenha");
      rotulo.textContent="Sua senha de acesso";
      const senha=document.createElement("input");
      senha.id="atlasReauthSenha";
      senha.type="password";
      senha.autocomplete="current-password";
      senha.required=true;
      senha.maxLength=128;
      const erro=document.createElement("p");
      erro.className="atlas-reauth-erro";
      erro.setAttribute("role","alert");
      erro.setAttribute("aria-live","polite");
      const acoes=document.createElement("div");
      acoes.className="atlas-reauth-acoes";
      const cancelar=document.createElement("button");
      cancelar.type="button";
      cancelar.className="atlas-btn light";
      cancelar.textContent="Cancelar";
      const confirmar=document.createElement("button");
      confirmar.type="submit";
      confirmar.className="atlas-btn primary";
      confirmar.textContent="Confirmar acesso";
      let emAndamento=false;
      const fechar=(resultado)=>{
        senha.value="";
        fundo.removeEventListener("keydown",aoTeclado);
        fundo.remove();
        resolve(resultado);
      };
      const aoTeclado=event=>{
        if(event.key==="Escape" && !emAndamento){event.preventDefault();fechar(false);}
        if(event.key==="Tab"){
          const botoes=[senha,cancelar,confirmar];
          const atual=botoes.indexOf(document.activeElement);
          if(event.shiftKey && atual===0){event.preventDefault();confirmar.focus();}
          else if(!event.shiftKey && atual===2){event.preventDefault();senha.focus();}
        }
      };
      cancelar.onclick=()=>{if(!emAndamento)fechar(false);};
      caixa.onsubmit=async event=>{
        event.preventDefault();
        if(emAndamento) return;
        if(!senha.value){erro.textContent="Informe sua senha de acesso.";senha.focus();return;}
        emAndamento=true;
        confirmar.disabled=true;cancelar.disabled=true;
        confirmar.textContent="Verificando...";
        erro.textContent="";
        try{
          const cliente=db();
          if(!cliente?.auth) throw new Error("Serviço Supabase Auth indisponível.");
          const resultado=await cliente.auth.signInWithPassword({email,password:senha.value});
          if(resultado.error || !resultado.data?.user) throw new Error("Senha incorreta ou conta indisponível.");
          if(String(resultado.data.user.id).toLowerCase()!==identidadeEsperada){
            await cliente.auth.signOut({scope:"local"});
            throw new Error("A conta autenticada não corresponde ao usuário atual do Atlas. Saia e entre novamente com a conta correta.");
          }
          if(!await sessaoCadastroValida()) throw new Error("A sessão não foi confirmada. Verifique a conexão e tente novamente.");
          fechar(true);
        }catch(falha){erro.textContent=falha?.message||"Falha ao validar o acesso.";}
        finally{senha.value="";emAndamento=false;confirmar.disabled=false;cancelar.disabled=false;confirmar.textContent="Confirmar acesso";}
      };
      acoes.append(cancelar,confirmar);
      caixa.append(titulo,explicacao,conta,rotulo,senha,erro,acoes);
      fundo.appendChild(caixa);
      fundo.addEventListener("keydown",aoTeclado);
      document.body.appendChild(fundo);
      senha.focus();
    }).finally(()=>{reautenticacaoPendente=null;});
    return reautenticacaoPendente;
  }

  async function garantirSessaoCadastro(){
    if(await sessaoCadastroValida()) return true;
    if(!navigator.onLine){
      alert("O cadastro exige conexão com a internet para verificar o Supabase Auth. Reconecte e tente novamente.");
      return false;
    }
    return solicitarReautenticacaoCadastro();
  }

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
    {id:"EXPEDICAO",title:"🚚 Expedição",access:"EXPEDICAO_VER",items:[["SOLICITAR_MATERIAL","Novo pedido"],["APROVAR_PEDIDO_ORIGEM","Aprovar ou recusar"],["SEPARAR_PEDIDO","Separar pedido"],["EXPEDICAO_FISCAL","Fiscal / Romaneio e NF-e"],["EXPEDICAO_TRANSPORTE","Retirada e transporte"],["ENTREGAR_MATERIAL","Entregar/enviar"],["CONFERIR_MERCADORIA","Receber e conferir"],["EXPEDICAO_RECEBER_PROPRIA_REMESSA","Permitir receber a própria remessa"]]},
    {id:"ESTOQUE",title:"📚 Estoque / Entrada",items:[["ESTOQUE_VER","Acessar estoque"],["ESTOQUE_ENTRADA","Entrada"],["ESTOQUE_SAIDA","Saída"],["ESTOQUE_TRANSFERIR","Transferir"],["ENTRADA_VER","Tela de entrada"],["TRIAGEM_VER","Triagem"]]},
    {id:"EMPRESAS",title:"🏢 Empresas / Obras",items:[["EMPRESAS_VER","Visualizar"],["EMPRESAS_CRIAR","Criar"],["EMPRESAS_EDITAR","Editar"],["EMPRESAS_INATIVAR","Inativar/reativar"],["EMPRESAS_EXCLUIR","Excluir"]]},
    {id:"USUARIOS",title:"👥 Usuários / Administração",items:[["USUARIOS_VER","Visualizar usuários"],["USUARIOS_CRIAR","Criar usuários"],["USUARIOS_EDITAR","Editar usuários"],["USUARIOS_BLOQUEAR","Bloquear usuários"],["USUARIOS_PERMISSOES","Gerenciar permissões"],["USUARIOS_OBRAS","Gerenciar vínculos de obras (em preparação)"],["USUARIOS_HISTORICO","Consultar histórico administrativo"],["CONFIGURACOES_VER","Configurações"]]}
  ];

  function aplicarPadraoRelatorios(permissoes){
    const p=permissoes instanceof Set?permissoes:new Set(permissoes||[]);
    // Limitação de obras é SEMPRE validada pelo servidor. Permissões de
    // exportação e de consulta não podem ser impostas contra a decisão
    // explícita de um administrador habilitado.
    if(!p.has("RELATORIOS_VER")){
      p.delete("RELATORIOS_OBRAS_PERMITIDAS");
      p.delete("RELATORIOS_TODAS_OBRAS");
      p.delete("RELATORIOS_EXPORTAR");
      return p;
    }
    // Não apagar tokens históricos sem o usuário desmarcá-los.
    // Concessões globais continuam proibidas para não-owner no formulário
    // e, principalmente, na Edge Function.
    if(p.has("RELATORIOS_TODAS_OBRAS"))p.delete("RELATORIOS_OBRAS_PERMITIDAS");
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
    const sessao=await cliente?.auth?.getSession();
    const token=sessao?.data?.session?.access_token;
    if(sessao?.error || !token){
      throw new Error("Sua sessão segura expirou. Entre novamente no Atlas para consultar funcionários.");
    }
    // A listagem é autorizada pelo próprio servidor a partir de auth.uid().
    // Nunca fazer fallback para SELECT direto, nem usar localStorage como prova de acesso.
    const identidade=await cliente.auth.getUser(token);
    if(identidade.error || String(identidade.data?.user?.id||"").toLowerCase()!==String(current()?.auth_user_id||"").toLowerCase()){
      throw new Error("A sessão não corresponde à conta atual do Atlas. Saia e faça login novamente.");
    }
    const resultado=await cliente.rpc("atlas_usuarios_listar_autorizados");
    if(resultado.error) throw resultado.error;
    return (resultado.data||[]).map(u=>({
      ...u,
      _consulta_resumida:true,
      _obras_vinculadas:Array.isArray(u.obras_compartilhadas)?u.obras_compartilhadas:[]
    }));
  }

  async function load(){
    if(!db())throw new Error("Supabase não carregado.");
    // Não aceitar uma sessão visual antiga como credencial para listar funcionários.
    STATE.users=[];
    STATE.selected=null;
    STATE.draft=null;
    if(!await sessaoCadastroValida()){
      // A sessão local do Atlas pode existir sem uma sessão Supabase Auth válida.
      // Solicita a confirmação segura já implementada, sem liberar consultas anônimas.
      const autenticado=await garantirSessaoCadastro();
      if(!autenticado || !await sessaoCadastroValida()){
        throw new Error("Consulta de funcionários cancelada: confirme sua conta Supabase Auth para continuar.");
      }
    }
    const ids=idsObrasPermitidasAtual();
    // Redes independentes em paralelo: obras, modelos e listagem segura.
    // Apenas a listagem usa a RPC autorizada pelo Supabase Auth.
    const obterObras=async()=>{
      if(currentIsOwner())return await loadSafe("obras","nome");
      const obraIds=[...ids].map(Number).filter(Number.isFinite);
      if(!obraIds.length)return [];
      const r=await db().from("obras").select("*").in("id",obraIds).order("nome");
      if(r.error)throw r.error;
      return r.data||[];
    };
    const [obras,aux,usuarios]=await Promise.all([
      obterObras(),
      db().rpc("atlas_usuarios_carregar_auxiliares",{p_executor_id:currentId()}),
      loadUsersScoped()
    ]);
    if(aux.error)throw aux.error;
    STATE.works=obras;
    const auxData=Array.isArray(aux.data)?(aux.data[0]||{}):(aux.data||{});
    const empresasAux=Array.isArray(auxData.empresas)?auxData.empresas:[];
    const perfisAux=Array.isArray(auxData.perfis_rapidos)?auxData.perfis_rapidos:[];
    const empresasPermitidas=new Set(STATE.works.map(w=>String(w.empresa_id||"")).filter(Boolean));
    if(current()?.empresa_id)empresasPermitidas.add(String(current().empresa_id));
    STATE.companies=currentIsOwner()
      ? empresasAux
      : empresasAux.filter(e=>empresasPermitidas.has(String(e.id)));
    STATE.table="usuarios_sistema";
    STATE.users=usuarios;
    STATE.profiles=perfisAux;
    STATE.profiles=STATE.profiles
      .filter(p=>p.ativo!==false && podeGerenciarPerfil(p.nome))
      .map(p=>currentIsOwner()?p:{...p,permissoes:normalizarPermissoesPerfilRapido(p.permissoes).filter(permissaoConcedivelAtual).join(",")});
    fillFilters();renderUsers();renderProfiles();
    if($("#btnNovoUsuario")) $("#btnNovoUsuario").hidden=!canCreateUsers();
    document.documentElement.classList.remove("atlas-users-loading");
  }

  function visibleUsers(){return STATE.users.filter(u=>usuarioDentroDoEscopo(u) && podeGerenciarPerfil(u.perfil))}
  function filteredUsers(){const term=norm($("#filtroBusca").value);const pf=norm($("#filtroPerfil").value);const work=$("#filtroObraUsuario").value;const st=$("#filtroStatusUsuario").value;return visibleUsers().filter(u=>(!term||norm(`${u.nome} ${u.usuario} ${u.email}`).includes(term))&&(!pf||norm(u.perfil)===pf)&&(!work||obrasDoUsuario(u).has(String(work)))&&(!st||(st==="ATIVO")===(u.ativo!==false)))}
  function fillFilters(){
    const perf=[...new Set([...visibleUsers().map(u=>String(u.perfil||"").trim()),...perfisCriaveis()].filter(Boolean))].sort();
    $("#filtroPerfil").innerHTML='<option value="">Todos os perfis</option>'+perf.map(p=>`<option>${esc(p)}</option>`).join("");
    $("#formPerfil").innerHTML=perfisCriaveis().map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join("");
    const opts=STATE.works.map(w=>`<option value="${w.id}">${esc(workText(w.id))}</option>`).join("");
    $("#filtroObraUsuario").innerHTML='<option value="">Todas as obras</option>'+opts;
    $("#formEmpresa").innerHTML='<option value="">Selecione</option>'+STATE.companies.map(e=>`<option value="${e.id}">${esc(e.nome||e.razao_social||e.id)}</option>`).join("");
    const base=$("#formObraOperacional");
    if(base)base.innerHTML='<option value="">Sem base operacional</option>'+STATE.works.map(w=>`<option value="${w.id}">${esc(workText(w.id))}</option>`).join("");
  }

  // O banco mantém os modelos oficiais em perfis_rapidos. Exibição não concede acesso.
  function modeloPermissoesCadastro(perfil){
    const modelo=STATE.profiles.find(p=>norm(p.nome)===norm(perfil));
    return modelo?normalizarPermissoesPerfilRapido(modelo.permissoes).filter(permissaoConcedivelAtual):[];
  }
  function atualizarResumoPerfilCadastro(){
    const campo=$("#formPerfil");
    if(!campo)return;
    let resumo=$("#atlasPerfilPadraoResumo");
    if(!resumo){
      resumo=document.createElement("small");
      resumo.id="atlasPerfilPadraoResumo";
      resumo.style.cssText="display:block;font-size:11px;line-height:1.45;color:#53657b;margin-top:4px";
      campo.insertAdjacentElement("afterend",resumo);
    }
    const editando=!!$("#formId")?.value;
    if(editando){resumo.textContent="Ao mudar o perfil, as permissões padrão serão sugeridas. Você pode personalizá-las sem ultrapassar seu próprio acesso.";return;}
    const quantidade=modeloPermissoesCadastro(campo.value).length;
    resumo.textContent=quantidade
      ?`${quantidade} permissões padrão do perfil ${campo.value}. Limitadas às suas permissões e obras.`
      :`Não foi possível encontrar o modelo de ${campo.value}. Atualize a página antes de cadastrar.`;
  }

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
    if(user._base_operacional_carregada) return user._obra_operacional_id||null;
    if(user._base_operacional_pendente) return user._base_operacional_pendente;
    user._base_operacional_pendente=(async()=>{
      const {data,error}=await db().rpc("atlas_obra_operacional_expedicao",{p_usuario_id:Number(user.id)});
      if(error){
        console.warn("Atlas Usuários: não foi possível consultar a base operacional.",error.message);
        return null;
      }
      const linha=Array.isArray(data)?(data[0]||null):data;
      const obraId=linha?.obra_id?Number(linha.obra_id):null;
      user._obra_operacional_id=obraId;
      user._base_operacional_carregada=true;
      return obraId;
    })().finally(()=>{user._base_operacional_pendente=null;});
    return user._base_operacional_pendente;
  }

  async function selectUser(id){
    try{
      const user = STATE.users.find(
        item => String(item.id) === String(id)
      );

      if(!user || !usuarioDentroDoEscopo(user)){
        console.warn("Atlas Usuários: funcionário não encontrado ou fora das obras autorizadas.", id);
        return false;
      }

      if(
        Number(user.id) === OWNER_ID &&
        !currentIsOwner()
      ){
        return false;
      }

      // A ficha resumida é exibida imediatamente. A autorização de detalhes
      // ocorre em segundo plano, sem bloquear a seleção nem repetir um 403.
      if(user._consulta_resumida && !user._consulta_em_andamento && !user._consulta_negada){
        user._consulta_em_andamento=true;
        // A promessa é compartilhada com o botão Editar, evitando uma segunda
        // chamada quando o funcionário clica antes de a ficha terminar de carregar.
        user._consulta_promessa=db().functions.invoke("atlas-admin-usuarios",{
          body:{acao:"consultar",usuario_id:Number(user.id)}
        }).then(async ({data:resposta,error:erroConsulta})=>{
          if(erroConsulta || resposta?.sucesso!==true || !resposta?.funcionario){
            let mensagem=resposta?.erro||"Não foi possível validar o acesso a este funcionário.";
            try{
              const detalhe=await erroConsulta?.context?.json?.();
              mensagem=detalhe?.erro||mensagem;
            }catch(_){ }
            user._consulta_negada=true;
            user._consulta_erro=mensagem;
            return false;
          }
          Object.assign(user,resposta.funcionario,{_consulta_resumida:false});
          if(String(STATE.selected?.id)===String(user.id)) selectUser(user.id);
          return true;
        }).catch(error=>{
          console.warn("Atlas Usuários: consulta de detalhes indisponível.",error?.message||error);
          user._consulta_erro="Falha de conexão ao verificar o acesso. Selecione o funcionário novamente para tentar.";
          // Falha de rede não deve conceder edição; reabrir a ficha permite nova tentativa.
          return false;
        }).finally(()=>{
          user._consulta_em_andamento=false;
          user._consulta_promessa=null;
        });
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

      // As abas pesadas são montadas apenas quando o usuário as abre.
      // activateTab("dados") mostra imediatamente a ficha principal.

      renderUsers();

      if($("#btnEditarUsuario")) $("#btnEditarUsuario").disabled=!podeSolicitarEdicaoSelecionada();
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
    const originais=permsOf(STATE.selected);
    // Um gestor autorizado pode REVOGAR permissões preexistentes de um
    // subordinado, mas somente conceder permissões que ele próprio detém.
    // Uma permissão não concedível, quando retirada, permanece visível
    // e desabilitada para impedir que seja adicionada novamente.
    const podeExibir=p=>permissaoConcedivelAtual(p)||originais.has(p);
    const itensVisiveis=m.items.filter(([p])=>podeExibir(p));
    const acessoVisivel=!m.access||podeExibir(m.access);
    if(!currentIsOwner()&&!acessoVisivel&&!itensVisiveis.length)return "";

    const switchCabecalho=m.access
      ? `<label class="atlas-switch"><input type="checkbox" class="module-access" data-module="${m.id}" value="${m.access}" ${STATE.draft.permissions.has(m.access)?"checked":""} ${(bloqueado||(!permissaoConcedivelAtual(m.access)&&!STATE.draft.permissions.has(m.access)))?"disabled":""}><span></span></label>`
      : `<label class="atlas-switch"><input type="checkbox" class="module-master" data-module="${m.id}" ${bloqueado?"disabled":""}><span></span></label>`;

    const linhas=itensVisiveis.map(([p,l])=>{
      const soRevogacao=!permissaoConcedivelAtual(p);
      const desabilitado=bloqueado||(soRevogacao&&!STATE.draft.permissions.has(p));
      return `
      <div class="atlas-permission-row">
        <label>${esc(l)}${soRevogacao?'<small>Pode remover, mas não conceder</small>':''}</label>
        <label class="atlas-switch">
          <input type="checkbox" class="permission-toggle" value="${p}" ${STATE.draft.permissions.has(p)?"checked":""} ${desabilitado?"disabled":""}>
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
    // Perfil rápido define modelo de permissões, NÃO promove/rebaixa
    // a hierarquia estrutural do funcionário já cadastrado.
    STATE.draft.perfil_rapido=profile.nome;
    $("#selectedProfile").textContent=STATE.draft.perfil||STATE.selected.perfil;
    renderPermissions();
    renderNotifications();
    renderSummary();
    setDirty();
    modal("modalPerfis",false);
    toast(`Perfil ${profile.nome} carregado na tela. Clique em Salvar Permissões.`);
  }


  function activateTab(nome){
    $$('.atlas-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===nome));
    $$('.atlas-tab-content').forEach(x=>x.classList.remove('active'));
    const alvo=$('#tab'+nome.charAt(0).toUpperCase()+nome.slice(1));
    if(alvo)alvo.classList.add('active');
    if(STATE.selected){
      const funcoes={dados:renderData,permissoes:renderPermissions,
        notificacoes:renderNotifications,obras:renderWorksInline,
        historico:renderHistory,resumo:renderSummary};
      // dataset sem acento pode variar entre páginas; preservar também os nomes originais.
      const render=funcoes[norm(nome).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')];
      if(render) try{render();}catch(e){console.error('Falha ao abrir aba de usuários',e);}
    }
    const area=$('.atlas-tab-scroll-area');if(area)area.scrollTop=0;
  }
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
        // Manter tokens preexistentes que não podem ser CONCEDIDOS,
        // sem recolocar aqueles que o gestor removeu voluntariamente.
        .filter(x=>currentIsOwner()||permissaoConcedivelAtual(x)||originais.has(x))
    );

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

  function atlasIconeVisibilidade(visivel){
    // SVG monocromático, sem emoji ou dependências externas.
    return visivel
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9.4 5 10 7-.3 1-1.4 2.8-3.1 4.2M6.2 6.2C3.8 7.8 2.5 10.3 2 12c.6 2 4.5 7 10 7 1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
  function atualizarIconeSenha(botao,visivel){
    if(!botao)return;
    const descricao=visivel?"Ocultar senha":"Mostrar senha";
    botao.innerHTML=atlasIconeVisibilidade(visivel);
    botao.setAttribute("aria-label",descricao);
    botao.setAttribute("aria-pressed",String(visivel));
    botao.title=descricao;
  }

  // Ao selecionar uma pessoa, a lista autorizada fornece o resumo imediatamente.
  // A confirmação de acesso da Edge Function pode demorar: o botão responde ao
  // clique, mas o formulário só abre APÓS a autorização segura terminar.
  async function abrirEdicaoSelecionada(){
    const usuario=STATE.selected;
    if(!usuario || !podeSolicitarEdicaoSelecionada()) return;
    const botao=$("#btnEditarUsuario");
    const htmlOriginal=botao?.innerHTML||"Editar dados";
    try{
      if(usuario._consulta_resumida){
        if(botao){
          botao.disabled=true;
          botao.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Validando acesso...';
        }
        // Normalmente a consulta já foi iniciada ao selecionar o funcionário.
        if(!usuario._consulta_promessa && !usuario._consulta_negada){
          await selectUser(usuario.id);
        }
        if(usuario._consulta_promessa) await usuario._consulta_promessa;
        if(usuario._consulta_resumida){
          alert(usuario._consulta_erro||"Acesso de edição não confirmado. Selecione o funcionário novamente ou verifique sua permissão para a obra.");
          return;
        }
      }
      if(STATE.selected!==usuario || !canEditSelected()){
        alert("Sua sessão não permite editar este funcionário ou a seleção mudou. Selecione-o novamente.");
        return;
      }
      await openUserModal(usuario);
    }catch(erro){
      alert("Não foi possível abrir a edição: "+(erro?.message||"verifique sua conexão e tente novamente."));
    }finally{
      if(botao){
        botao.innerHTML=htmlOriginal;
        botao.disabled=!podeSolicitarEdicaoSelecionada();
      }
    }
  }

  async function openUserModal(user=null,focusPassword=false){
    if(user?(!canEditSelected()):(!canCreateUsers()))return;
    if(user&&Number(user.id)===OWNER_ID&&!currentIsOwner())return;
    // Solicita a reautenticação ANTES do preenchimento para não perder o trabalho.
    if(!user && !await garantirSessaoCadastro()) return;
    fotoArquivoPendente=null; removerFotoPendente=false;
    // Menor privilégio por padrão. MASTER/GESTOR continuam disponíveis somente
    // mediante escolha explícita de administrador autorizado.
    $("#formId").value=user?.id||"";$("#formNome").value=user?.nome||"";$("#formUsuario").value=user?.usuario||"";$("#formEmail").value=user?.email||"";$("#formPerfil").value=user?.perfil||"ALMOXARIFE";$("#formEmpresa").value=user?.empresa_id||"";$("#formAtivo").value=String(user?.ativo!==false);$("#formSenha").value="";
    // Qualquer administrador autorizado edita perfis até seu nível; o backend confirma.
    $("#formPerfil").disabled=!!user && !canManageSelectedAccess();
    atualizarResumoPerfilCadastro();
    STATE.formWorksDraft=obrasDoUsuario(user||{});
    const obraOperacional=user?user._obra_operacional_id:null;
    const baseOperacional=$("#formObraOperacional");
    sincronizarBaseOperacional();
    if(baseOperacional&&obraOperacional)baseOperacional.value=String(obraOperacional);
    // Abrir o formulário sem aguardar uma chamada de rede; atualizar a base depois.
    if(user&&!user._base_operacional_carregada){
      carregarObraOperacionalUsuario(user).then(id=>{
        if($("#modalUsuario")?.hidden || String($("#formId")?.value)!==String(user.id))return;
        const seletor=$("#formObraOperacional");
        if(seletor && !seletor.value && id)seletor.value=String(id);
      });
    }
    atualizarResumoFormObras();
    if($("#formFotoArquivo")) $("#formFotoArquivo").value="";
    $("#modalUsuarioTitulo").textContent=user?"Editar usuário":"Novo usuário";
    const senhaLabel=$("#formSenha")?.closest("label");
    if(senhaLabel){
      // A senha provisória é exibida apenas durante esta edição.
      senhaLabel.classList.add("atlas-senha-label");
      let campoSenha=senhaLabel.querySelector("#formSenha");
      let envoltorio=senhaLabel.querySelector(".atlas-senha-campo");
      if(campoSenha && !envoltorio){
        envoltorio=document.createElement("span");
        envoltorio.className="atlas-senha-campo";
        campoSenha.parentNode.insertBefore(envoltorio,campoSenha);
        envoltorio.appendChild(campoSenha);
      }
      let controles=senhaLabel.querySelector("#atlasSenhaControles");
      if(!controles){
        controles=document.createElement("div");
        controles.id="atlasSenhaControles";
        controles.className="atlas-senha-acoes";
        const olho=document.createElement("button");
        olho.type="button";olho.id="atlasMostrarSenha";
        olho.className="atlas-senha-olho";
        olho.setAttribute("aria-label","Mostrar senha");
        olho.title="Mostrar senha";
        olho.innerHTML=atlasIconeVisibilidade(false);
        olho.onclick=()=>{
          const campo=$("#formSenha");
          const mostrar=campo.type==="password";
          campo.type=mostrar?"text":"password";
          atualizarIconeSenha(olho,mostrar);
        };
        const copiar=document.createElement("button");
        copiar.type="button";copiar.id="atlasCopiarSenha";
        copiar.className="atlas-senha-botao";
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
        const gerar=document.createElement("button");
        gerar.type="button";gerar.id="atlasGerarSenha";
        gerar.textContent="Gerar senha";
        gerar.className="atlas-senha-botao";
        gerar.onclick=()=>{
          const alfabeto="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
          const aleatorios=new Uint32Array(16);
          crypto.getRandomValues(aleatorios);
          $("#formSenha").value=Array.from(aleatorios,n=>alfabeto[n%alfabeto.length]).join("");
          $("#formSenha").type="text";
          atualizarIconeSenha(olho,true);
        };
        envoltorio.appendChild(olho);
        controles.append(gerar,copiar);
        senhaLabel.appendChild(controles);
      }
      $("#formSenha").type="password";
      const olho=senhaLabel.querySelector("#atlasMostrarSenha");
      if(olho)atualizarIconeSenha(olho,false);
      const copiar=senhaLabel.querySelector("#atlasCopiarSenha");
      if(copiar)copiar.textContent="Copiar senha";
      senhaLabel.hidden=false;
      let botao=senhaLabel.querySelector("#btnRedefinirSenhaSeparada");
      if(!botao){
        botao=document.createElement("button");
        botao.type="button";
        botao.id="btnRedefinirSenhaSeparada";
        botao.className="btn btn-secondary";
        botao.classList.add("atlas-senha-definir");
        senhaLabel.appendChild(botao);
        botao.onclick=redefinirSenhaSeparada;
      }
      const info=authStatusInfo(user);
      botao.textContent=info.status==='ATIVO'?"Definir senha provisória (Supabase Auth)":info.status==='LEGADO'?"Definir senha provisória (legado)":"Ativação pendente — redefinição indisponível";
      // A Edge Function atlas-senhas autoriza redefinicao de legado somente ao OWNER.
      const podeRedefinir=info.status==='LEGADO'?currentIsOwner():podeRedefinirSenhaAuth();
      botao.disabled=!user || info.status==='AGUARDANDO' || !podeRedefinir;
      botao.hidden=!user; // Cadastro novo usa somente senha Supabase Auth ao salvar.
      botao.title="A redefinição é autorizada no servidor conforme o perfil e as obras.";
      const aviso=senhaLabel.querySelector("#avisoSenhaSeparada")||document.createElement("small");
      aviso.id="avisoSenhaSeparada";
      aviso.textContent=!user?"Informe uma senha de 8 a 128 caracteres ou deixe em branco para o servidor gerar uma. A senha será aplicada ao salvar o cadastro.":"Digite uma nova senha de 8 a 128 caracteres e clique em Definir senha provisória. Salvar usuário não redefine a senha.";
      aviso.className="atlas-senha-aviso";
      if(!aviso.parentNode)senhaLabel.appendChild(aviso);
    }
    atualizarPermissoesFormulario(true);
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
    if(!podeRedefinirSenhaAuth()||!Number.isSafeInteger(id)||id<=0){alert("Você não possui autorização para redefinir senhas.");return;}
    if(!atlasSenhaValida(senha)){alert("Use 8 a 128 caracteres e combine pelo menos 2 tipos: maiúsculas, minúsculas, números ou símbolos.");return;}
    if(!confirm("Redefinir SOMENTE a senha deste funcionário? Outras alterações do formulário não serão salvas."))return;
    const botao=$("#btnRedefinirSenhaSeparada");
    if(botao)botao.disabled=true;
    try{
      const {data:{session},error:erroSessao}=await db().auth.getSession();
      if(erroSessao||!session?.access_token)throw new Error("Sessão Supabase Auth inválida. Entre novamente.");
      const alvo=STATE.selected;
      if(!alvo || Number(alvo.id)!==id)throw new Error("Selecione novamente o funcionário antes de redefinir a senha.");
      const status=authStatusInfo(alvo).status;
      if(status==='AGUARDANDO')throw new Error("Conclua a ativação pendente antes de redefinir a senha.");
      if(status==='LEGADO' && !currentIsOwner())throw new Error("Somente o OWNER pode redefinir senhas legadas.");
      const funcaoSenha=status==='LEGADO'?"atlas-senhas":"atlas-admin-usuarios";
      const acaoSenha=status==='LEGADO'?"redefinir":"redefinir_senha";
      const {data:retorno,error:erroFuncao}=await db().functions.invoke(funcaoSenha,{
        body:{acao:acaoSenha,usuario_id:id,senha}
      });
      if(erroFuncao){
        let detalhe="Não foi possível contatar o serviço de senhas.";
        try{const resposta=await erroFuncao.context?.json?.();detalhe=resposta?.erro||resposta?.error||detalhe;}catch(_e){}
        throw new Error(detalhe);
      }
      if(!(retorno?.ok===true||retorno?.sucesso===true))throw new Error(retorno?.error||retorno?.erro||"Redefinição não confirmada.");
      // Não apagar a senha antes de o administrador poder conferi-la e copiá-la.
      // openUserModal limpa o campo ao reabrir o formulário.
      const campoSenha=$("#formSenha");
      if(campoSenha)campoSenha.type="password";
      const botaoOlho=$("#atlasMostrarSenha");
      if(botaoOlho)atualizarIconeSenha(botaoOlho,false);
      toast("Senha provisória definida. Confira e copie antes de fechar este formulário.");
      await load();
    }catch(erro){alert("Senha não redefinida: "+erro.message);}
    finally{if(botao)botao.disabled=false;}
  }

  // O formulário apresenta os modelos que já existem em perfis_rapidos.
  // Sem personalização, salvar usa o modelo selecionado. Na edição sem mudança,
  // preserva as permissões atuais do usuário; não reescreve tudo silenciosamente.
  let formularioPermissoes=new Set();
  function atualizarPermissoesFormulario(recarregar=false){
    const perfil=$("#formPerfil")?.value||"";
    const id=$("#formId")?.value||"";
    const mudou=!!id && norm(perfil)!==norm(STATE.selected?.perfil);
    if(recarregar){
      formularioPermissoes=new Set(id&&!mudou?permsOf(STATE.selected):modeloPermissoesCadastro(perfil));
      const detalhe=$("#atlasPersonalizarPermissoes");
      if(detalhe)detalhe.open=false;
    }
    const painel=$("#atlasPermissoesCadastro");
    const legenda=$("#atlasLegendaPermissoesCadastro");
    if(!painel)return;
    const edicaoPermitida=!id || canManageSelectedAccess();
    const catalogo=new Map();
    PERMISSION_MODULES.forEach(modulo=>{
      if(modulo.access)catalogo.set(modulo.access,`${modulo.title} — Acesso`);
      modulo.items.forEach(([p,descricao])=>catalogo.set(p,`${modulo.title} — ${descricao}`));
    });
    const originais=id?permsOf(STATE.selected):new Set();
    const opcoes=[...new Set([...catalogo.keys(),...formularioPermissoes,...originais])]
      .filter(p=>permissaoConcedivelAtual(p) || originais.has(p))
      .sort((a,b)=>a.localeCompare(b,'pt-BR'));
    painel.innerHTML=opcoes.map(p=>{
      const podeLigar=permissaoConcedivelAtual(p)||formularioPermissoes.has(p);
      const marcado=formularioPermissoes.has(p);
      return `<label style="display:flex;gap:8px;align-items:flex-start;margin:5px 0"><input type="checkbox" class="atlas-form-perm" value="${esc(p)}" ${marcado?'checked':''} ${!edicaoPermitida||(!marcado&&!podeLigar)?'disabled':''}><span>${esc(catalogo.get(p)||p)}</span></label>`;
    }).join('');
    if(legenda)legenda.textContent=`${formularioPermissoes.size} permissões selecionadas. ${id&&!mudou?'Mantidas do cadastro atual.':'Carregadas do perfil '+perfil+'.'} Ajustes são limitados ao seu acesso.`;
  }
  function permissoesFormularioCadastro(){return [...formularioPermissoes].filter(p=>
    currentIsOwner() || permissaoConcedivelAtual(p) || (!!$("#formId")?.value && permsOf(STATE.selected).has(p)));
  }

  // Conferência rápida dos registros que o administrador está autorizado a visualizar.
  // A trava definitiva contra duplicações permanece no servidor/banco.
  function detectarDuplicidadeVisivel(cadastro){
    const chave=valor=>String(valor??"").trim().replace(/\s+/g," ").toUpperCase();
    const email=chave(cadastro.email);
    const login=chave(cadastro.usuario);
    const nome=chave(cadastro.nome);
    const empresa=String(cadastro.empresa_id??"");
    for(const existente of STATE.users){
      if(!usuarioDentroDoEscopo(existente))continue;
      const identificacao=String(existente.nome||"funcionário já cadastrado");
      if(email && chave(existente.email)===email){
        return `O e-mail já pertence a ${identificacao}. Abra o cadastro existente em vez de criar outro.`;
      }
      if(login && chave(existente.usuario)===login){
        return `O nome de usuário já pertence a ${identificacao}. Escolha o cadastro existente ou outro login.`;
      }
      if(nome && empresa && String(existente.empresa_id??"")===empresa && chave(existente.nome)===nome){
        return `${identificacao} já está cadastrado nesta empresa. Confira antes de continuar.`;
      }
    }
    return null;
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
      if(!id && !podeCriarPerfil(payload.perfil)){
        alert("Você não pode cadastrar um perfil superior ao seu. Solicite a um administrador de nível adequado.");return;
      }
      if(id && !podeGerenciarPerfil(payload.perfil)){
        alert("Você não pode promover este funcionário para um nível superior ao seu.");return;
      }
    }
    if(!payload.nome||!payload.usuario){alert("Informe nome e usuário.");return}
    if(!payload.empresa_id){alert("Selecione a empresa do funcionário.");return}
    const obrasSelecionadas=[...STATE.formWorksDraft].map(id=>STATE.works.find(w=>String(w.id)===String(id)));
    // O OWNER pode autorizar obras de outras empresas sem mudar a empresa principal.
    if(obrasSelecionadas.some(w=>!w)){
      alert("Uma das obras selecionadas não foi encontrada. Atualize a lista e tente novamente.");return;
    }
    if(!currentIsOwner() && obrasSelecionadas.some(w=>String(w.empresa_id)!==String(payload.empresa_id))){
      alert("As obras de atuação precisam pertencer à empresa selecionada. Ajuste as obras ou a empresa.");return;
    }
    if(!id && !payload.obra_operacional_id){alert("Selecione a base operacional da Expedição.");return}
    if(payload.obra_operacional_id && !STATE.formWorksDraft.has(String(payload.obra_operacional_id))){
      alert("A base operacional da Expedição também precisa estar marcada nas Obras de atuação.");
      return;
    }
    // Edição: senha é operação separada, autorizada pelo backend e não pelo RPC de cadastro.
    // Novos usuários nunca recebem senha legada.
    
    if(senha && !atlasSenhaValida(senha)) { alert("A senha provisória precisa ter de 8 a 128 caracteres."); return; }

    if(!id){
      if(!payload.email){alert("Informe o e-mail do funcionário para enviar a ativação segura.");return}
      payload.email=String(payload.email).toLowerCase();
      const duplicado=detectarDuplicidadeVisivel(payload);
      if(duplicado){alert(duplicado);return;}
      const prof=STATE.profiles.find(p=>norm(p.nome)===norm(payload.perfil));
      const perfilPerms=permissoesFormularioCadastro();
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

    // Credencial exibida somente após confirmação do cadastro pelo servidor.
    // Não armazenar a senha em localStorage, sessão ou logs.
    async function mostrarCredenciaisCadastro(usuario, senha){
      return new Promise(resolve=>{
        const fundo=document.createElement("div");
        fundo.style.cssText="position:fixed;inset:0;z-index:2147483647;background:rgba(10,24,46,.72);display:flex;align-items:center;justify-content:center;padding:20px";
        const caixa=document.createElement("section");
        caixa.setAttribute("role","dialog");caixa.setAttribute("aria-modal","true");
        caixa.setAttribute("aria-label","Credenciais provisórias do funcionário");
        caixa.style.cssText="width:min(480px,100%);background:white;border-radius:18px;padding:26px;box-shadow:0 20px 65px #0004;font-family:inherit;color:#172b4d";
        const titulo=document.createElement("h2");titulo.textContent="Funcionário cadastrado!";titulo.style.cssText="margin:0 0 12px;color:#a80013;font-size:23px";
        const aviso=document.createElement("p");aviso.textContent="Copie as credenciais agora. A senha provisória será exibida somente nesta janela. A exigência de troca no primeiro acesso depende do fluxo de autenticação do Atlas e ainda não está garantida.";aviso.style.cssText="font-size:14px;line-height:1.5";
        const rotulo=document.createElement("div");rotulo.textContent="Usuário";rotulo.style.cssText="font-size:12px;font-weight:700;margin-top:18px";
        const nome=document.createElement("div");nome.textContent=usuario;nome.style.cssText="padding:10px;background:#f5f7fb;border-radius:8px;overflow-wrap:anywhere";
        const rotuloSenha=document.createElement("div");rotuloSenha.textContent="Senha provisória";rotuloSenha.style.cssText=rotulo.style.cssText;
        const campo=document.createElement("input");campo.type="password";campo.value=senha;campo.readOnly=true;campo.autocomplete="off";campo.setAttribute("aria-label","Senha provisória");campo.style.cssText="box-sizing:border-box;width:100%;padding:11px;border:1px solid #d5dce6;border-radius:8px";
        const acoes=document.createElement("div");acoes.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin-top:20px";
        const mostrar=document.createElement("button");mostrar.type="button";mostrar.textContent="Mostrar senha";
        const copiar=document.createElement("button");copiar.type="button";copiar.textContent="Copiar credenciais";
        const fechar=document.createElement("button");fechar.type="button";fechar.textContent="Fechar";
        for(const b of [mostrar,copiar,fechar])b.style.cssText="padding:11px 14px;border:1px solid #d5dce6;border-radius:9px;background:#fff;cursor:pointer;font-weight:600";
        fechar.style.cssText+=";background:#b60018;color:white;border-color:#b60018";
        mostrar.onclick=()=>{campo.type=campo.type==="password"?"text":"password";mostrar.textContent=campo.type==="password"?"Mostrar senha":"Ocultar senha"};
        copiar.onclick=async()=>{try{await navigator.clipboard.writeText("Usuário: "+usuario+"\nSenha provisória: "+senha);copiar.textContent="Copiado ✓";}catch(_){campo.type="text";campo.focus();campo.select();alert("Não foi possível copiar automaticamente. Selecione a senha e copie manualmente.");}};
        const encerrar=()=>{campo.value="";fundo.remove();resolve();};
        fechar.onclick=encerrar;
        acoes.append(mostrar,copiar,fechar);caixa.append(titulo,aviso,rotulo,nome,rotuloSenha,campo,acoes);fundo.append(caixa);document.body.append(fundo);fechar.focus();
      });
    }

    if(!id){
      if(cadastroEmAndamento) return;
      cadastroEmAndamento=true;
      const botaoCadastro=$("#btnSalvarUsuario");
      if(botaoCadastro) botaoCadastro.disabled=true;
      try{
        // Reconfere o token e a identidade mesmo se a sessão expirou com o formulário aberto.
        if(!await garantirSessaoCadastro()) return;
        const permissoesCadastro=String(payload.permissoes||"").split(",").map(p=>p.trim().toUpperCase()).filter(Boolean);
        if(!STATE.formWorksDraft.size) throw new Error("Selecione pelo menos uma obra de atuação.");
        if(!permissoesCadastro.length) throw new Error("O perfil escolhido não possui permissões definidas. Configure um perfil rápido antes de cadastrar.");
        if(!["ADMIN","ALMOXARIFE","MASTER","GESTOR"].includes(norm(payload.perfil))) throw new Error("Perfil incompatível com o cadastro seguro.");
        if(!podeCriarPerfil(payload.perfil)) throw new Error("Seu perfil não pode cadastrar esse nível de usuário.");
        if(payload.ativo!==true) throw new Error("Cadastro inicial de usuário inativo ainda não está disponível no fluxo seguro.");
        if(fotoArquivoPendente) throw new Error("Cadastre primeiro o funcionário; o envio da foto será feito após a criação.");
        const {data:retorno,error:erroFuncao}=await db().functions.invoke("atlas-admin-usuarios",{
          method:"POST",
          body:{
            nome:payload.nome,usuario:payload.usuario,email:payload.email,perfil:payload.perfil,
            empresa_id:payload.empresa_id,permissoes:permissoesCadastro,
            obra_operacional_id:payload.obra_operacional_id,
            obras:[...STATE.formWorksDraft].map(Number),
            ...(senha?{senha_provisoria:senha}:{})
          }
        });
        if(erroFuncao){
          let detalhe=erroFuncao.message||"Falha na Edge Function de cadastro.";
          try{const corpoErro=await erroFuncao.context?.json?.();detalhe=corpoErro?.erro||corpoErro?.error||detalhe;}catch(_){ }
          throw new Error(detalhe);
        }
        if(retorno?.sucesso!==true||!retorno?.funcionario?.id) throw new Error(retorno?.erro||"A Edge Function não confirmou o cadastro.");
        modal("modalUsuario",false);
        if(retorno.senha_provisoria){
          await mostrarCredenciaisCadastro(String(retorno.funcionario.usuario||payload.usuario),String(retorno.senha_provisoria));
        }else{
          alert("Funcionário cadastrado, mas o servidor não retornou uma senha provisória. Verifique o acesso antes de entregar as credenciais.");
        }
        await load();
        await selectUser(retorno.funcionario.id);
        toast(retorno.mensagem||"Usuário criado no Supabase Auth.");
      }catch(erro){
        const mensagem=erro?.message||"Falha desconhecida no cadastro.";
        alert("Cadastro seguro não concluído: "+mensagem);
      }finally{
        cadastroEmAndamento=false;
        if(botaoCadastro) botaoCadastro.disabled=false;
      }
      return;
    }

    if(id && !currentIsOwner()){
      try{
        const alteracoes={nome:payload.nome,usuario:payload.usuario,email:payload.email};
        const mudouPerfil=norm(payload.perfil)!==norm(STATE.selected.perfil);
        const originais=permsOf(STATE.selected);
        const escolhidas=permissoesFormularioCadastro();
        const mudouPermissoes=escolhidas.length!==originais.size || escolhidas.some(p=>!originais.has(p));
        if(mudouPerfil || mudouPermissoes){
          if(!canManageSelectedAccess()) throw new Error("Você não possui permissão para alterar perfil ou acessos deste funcionário.");
          alteracoes.perfil=payload.perfil;
          alteracoes.perfil_rapido=payload.perfil;
          alteracoes.permissoes=escolhidas;
        }
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
    // Edição OWNER também passa pela Edge Function para aplicar a mesma hierarquia
    // e evitar caminhos de salvamento diferentes para o mesmo formulário.
    let r;
    if(id){
      try{
        const alteracoes={nome:payload.nome,usuario:payload.usuario,email:payload.email};
        if(payload.ativo!==STATE.selected.ativo)alteracoes.ativo=payload.ativo;
        const mudouPerfil=norm(payload.perfil)!==norm(STATE.selected.perfil);
        const originais=permsOf(STATE.selected);
        const escolhidas=permissoesFormularioCadastro();
        if(mudouPerfil || escolhidas.length!==originais.size || escolhidas.some(p=>!originais.has(p))){
          alteracoes.perfil=payload.perfil;
          alteracoes.perfil_rapido=payload.perfil;
          alteracoes.permissoes=escolhidas;
        }
        if([...STATE.formWorksDraft].sort().join(",")!==[...obrasDoUsuario(STATE.selected)].sort().join(","))
          throw new Error("Alterar as obras de atuação exige o fluxo específico de obras. Nenhuma mudança foi gravada.");
        const resposta=await adminSupabase({acao:"editar",usuario_id:Number(id),alteracoes});
        r={data:resposta.funcionario,error:null};
      }catch(error){r={error};}
    }else{
      r={error:new Error("Cadastro seguro obrigatório: use a Edge Function.")};
    }
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
      if(String(STATE.selected?.id)!==String(row.dataset.userId)) selectUser(row.dataset.userId);
    });

    userList?.addEventListener("keydown", event => {
      if(!["Enter"," "].includes(event.key)) return;

      const row =
        event.target.closest("[data-user-id]");

      if(!row) return;

      event.preventDefault();
      if(String(STATE.selected?.id)!==String(row.dataset.userId)) selectUser(row.dataset.userId);
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
    if($("#btnEditarUsuario"))$("#btnEditarUsuario").onclick=abrirEdicaoSelecionada;
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
    $("#formPerfil")?.addEventListener("change",()=>{atualizarResumoPerfilCadastro();atualizarPermissoesFormulario(true);});
    // O modelo já é carregado ao escolher o perfil. Este controle apenas permite
    // restaurá-lo depois de personalizações, sem gravar nada no banco.
    $("#btnRestaurarPermissoesPerfil")?.addEventListener("click",()=>{
      formularioPermissoes=new Set(modeloPermissoesCadastro($("#formPerfil")?.value||"ALMOXARIFE"));
      atualizarPermissoesFormulario(false);
      atualizarResumoPerfilCadastro();
      toast("Permissões padrão restauradas. Elas serão gravadas somente ao salvar o funcionário.");
    });
    $("#atlasPermissoesCadastro")?.addEventListener("change",event=>{
      if(!event.target.classList.contains("atlas-form-perm"))return;
      if(event.target.checked&&!permissaoConcedivelAtual(event.target.value)){
        event.target.checked=false;
        alert("Você não pode conceder uma permissão que não possui.");return;
      }
      event.target.checked?formularioPermissoes.add(event.target.value):formularioPermissoes.delete(event.target.value);
      atualizarPermissoesFormulario(false);
    });
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

        if(event.target.checked&&!permissaoConcedivelAtual(valor)){
          renderPermissions();return;
        }
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
        if(event.target.checked&&!permissaoConcedivelAtual(valor)){
          renderPermissions();return;
        }
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
          if(event.target.checked){
            if(permissaoConcedivelAtual(permission))STATE.draft.permissions.add(permission);
          }else{
            STATE.draft.permissions.delete(permission);
          }
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
    try{await load()}catch(e){
      STATE.users=[];
      STATE.selected=null;
      STATE.draft=null;
      const vazio=$("#semUsuario");
      const conteudo=$("#conteudoUsuario");
      if(vazio){vazio.hidden=false;vazio.style.display="flex";}
      if(conteudo){conteudo.hidden=true;conteudo.style.display="none";}
      renderUsers();
      document.documentElement.classList.remove("atlas-users-loading");
      alert(e.message||"Não foi possível carregar usuários.");
    }
  }

  global.AtlasUsuarios = {loaded:true,state:STATE,selectUser,load,iniciar:init};

  if(document.body?.classList.contains('atlas-shell-page')){
    window.addEventListener('atlas:module-loaded',event=>{
      if(event.detail?.module==='usuarios') init();
    });
  }else if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();

})(window);