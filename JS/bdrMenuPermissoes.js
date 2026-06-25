/* =========================================================
   BDR MENU PERMISSÕES V8 - OWNER FIX + MENU ESTÁVEL
   Arquivo: JS/bdrMenuPermissoes.js

   PADRÃO NOVO:
   - MODULO_VER abre tela/menu
   - MODULO_CRIAR cria registros
   - MODULO_EDITAR edita registros
   - MODULO_EXCLUIR apaga registros
   - MODULO_EXPORTAR exporta
   - MODULO_MOVIMENTAR movimenta

   OBS:
   - Owner id=1 vê tudo.
   - MASTER/ADMIN sem permissoes preenchidas vê tudo.
   - Se permissoes estiver preenchido, vale somente o que estiver marcado.
========================================================= */

(function(){

  const PAGINAS = {
    DASHBOARD: "dashboard.html",
    ENTRADA: "entrada.html",
    TRIAGEM: "triagem.html",
    ESTOQUE: "estoque.html",
    PATRIMONIO: "patrimonio.html",
    EXPEDICAO: "expedicao.html",
    RELATORIOS: "relatorios.html",
    EMPRESAS: "empresa.html",
    USUARIOS: "usuarios.html",
    CONFIGURACOES: "configuracoes.html"
  };

  const PERM_PAGINA = {
    "dashboard.html": "DASHBOARD_VER",
    "entrada.html": "ENTRADA_VER",
    "triagem.html": "TRIAGEM_VER",
    "estoque.html": "ESTOQUE_VER",
    "patrimonio.html": "PATRIMONIO_VER",
    "expedicao.html": "EXPEDICAO_VER",
    "relatorios.html": "RELATORIOS_VER",
    "movimentacoes.html": "RELATORIOS_VER",
    "empresa.html": "EMPRESAS_VER",
    "usuarios.html": "USUARIOS_VER",
    "configuracoes.html": "CONFIGURACOES_VER",
    "pedidos.html": "EXPEDICAO_VER",
    "prateleiras-3d.html": "ESTOQUE_VER"
  };

  const MENU_PARA_NOVO = {
    DASHBOARD: "DASHBOARD_VER",
    ENTRADA: "ENTRADA_VER",
    TRIAGEM: "TRIAGEM_VER",
    ESTOQUE: "ESTOQUE_VER",
    PATRIMONIO: "PATRIMONIO_VER",
    EXPEDICAO: "EXPEDICAO_VER",
    RELATORIOS: "RELATORIOS_VER",
    EMPRESAS: "EMPRESAS_VER",
    USUARIOS: "USUARIOS_VER",
    CONFIGURACOES: "CONFIGURACOES_VER"
  };

  const ORDEM = [
    "DASHBOARD_VER",
    "PATRIMONIO_VER",
    "ESTOQUE_VER",
    "ENTRADA_VER",
    "TRIAGEM_VER",
    "EXPEDICAO_VER",
    "RELATORIOS_VER",
    "EMPRESAS_VER",
    "USUARIOS_VER",
    "CONFIGURACOES_VER"
  ];

  const LEGADO_PARA_NOVO = {
    DASHBOARD: "DASHBOARD_VER",
    ENTRADA: "ENTRADA_VER",
    TRIAGEM: "TRIAGEM_VER",
    ESTOQUE: "ESTOQUE_VER",
    PATRIMONIO: "PATRIMONIO_VER",
    EXPEDICAO: "EXPEDICAO_VER",
    RELATORIOS: "RELATORIOS_VER",
    EMPRESAS: "EMPRESAS_VER",
    USUARIOS: "USUARIOS_VER",
    CONFIGURACOES: "CONFIGURACOES_VER",

    VER_VALORES: "VALORES_VER",
    VER_TODAS_OBRAS: "TODAS_OBRAS_VER",
    VER_ESTOQUE_PROPRIA_OBRA: "PROPRIA_OBRA_VER",

    CADASTRAR_PATRIMONIO: "PATRIMONIO_CRIAR",
    EDITAR_PATRIMONIO: "PATRIMONIO_EDITAR",
    ALTERAR_STATUS: "PATRIMONIO_MOVIMENTAR",
    MOVIMENTAR_PATRIMONIO: "PATRIMONIO_MOVIMENTAR"
  };

  function norm(v){
    return String(v || "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function usuarioLocal(){
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        "null"
      );
    }catch(e){
      return null;
    }
  }

  function salvarUsuarioLocal(u){
    if(!u) return;
    localStorage.setItem("usuario_logado", JSON.stringify(u));
    localStorage.setItem("usuarioLogado", JSON.stringify(u));
  }

  function permissoesBrutas(u){
    if(Array.isArray(u?.permissoes)){
      return u.permissoes.map(norm).filter(Boolean);
    }
    return String(u?.permissoes || "")
      .split(",")
      .map(norm)
      .filter(Boolean);
  }

  function permissoes(u = usuarioLocal()){
    const ps = permissoesBrutas(u);
    const set = new Set(ps);

    ps.forEach(p => {
      if(LEGADO_PARA_NOVO[p]) set.add(LEGADO_PARA_NOVO[p]);
    });

    return [...set];
  }

  function perfil(u){
    return norm(u?.perfil);
  }

  function owner(u = usuarioLocal()){
    /*
      OWNER ABSOLUTO:
      - id=1 sempre vê tudo
      - independente de permissoes preenchidas
      - independente de perfil
      - usado para evitar menu sumindo no PWA/cache/offline
    */
    return Number(u?.id) === 1 || norm(u?.perfil) === "OWNER";
  }

  function masterLivre(u = usuarioLocal()){
    const p = perfil(u);
    const ps = permissoesBrutas(u);
    return owner(u) || ((p === "MASTER" || p === "ADMIN") && ps.length === 0);
  }

  function mostrarElemento(el){
    if(!el) return;
    el.hidden = false;
    el.dataset.bloqueado = "NAO";

    /*
      Menu lateral/dock precisa voltar como flex.
      Outros elementos voltam para o CSS original.
    */
    if(
      el.classList?.contains("bdr-menu-btn") ||
      el.classList?.contains("side-btn") ||
      el.closest?.(".bdr-menu")
    ){
      el.style.display = "flex";
    }else{
      el.style.display = "";
    }

    if("disabled" in el) el.disabled = false;
  }

  function ocultarElemento(el){
    if(!el) return;
    el.hidden = true;
    el.style.display = "none";
    el.dataset.bloqueado = "SIM";
    if("disabled" in el) el.disabled = true;
  }

  function paginaAtual(){
    return String(location.pathname.split("/").pop() || "dashboard.html").toLowerCase();
  }

  function permissaoDaPagina(){
    return PERM_PAGINA[paginaAtual()] || "";
  }

  function temPermissao(perm, u = usuarioLocal()){
    if(!u) return false;
    if(owner(u)) return true;
    if(masterLivre(u)) return true;

    const p = norm(perm);
    const ps = permissoes(u);

    if(ps.includes(p)) return true;

    const novo = LEGADO_PARA_NOVO[p];
    if(novo && ps.includes(novo)) return true;

    const legado = Object.entries(LEGADO_PARA_NOVO).find(([,v]) => v === p)?.[0];
    if(legado && ps.includes(legado)) return true;

    return false;
  }

  function primeiraPaginaPermitida(u){
    if(masterLivre(u)) return "dashboard.html";

    const ps = permissoes(u);
    const achou = ORDEM.find(p => ps.includes(p));

    const modulo = Object.entries(MENU_PARA_NOVO).find(([,novo]) => novo === achou)?.[0];
    return PAGINAS[modulo] || "dashboard.html";
  }

  function temAcessoPagina(u){
    if(!u) return false;
    if(masterLivre(u)) return true;

    const precisa = permissaoDaPagina();
    if(!precisa) return true;

    return temPermissao(precisa, u);
  }

  function esconderTelaSeBloqueada(){
    const u = usuarioLocal();
    if(!u) return;

    if(!temAcessoPagina(u)){
      document.documentElement.style.visibility = "hidden";
    }
  }

  esconderTelaSeBloqueada();

  function inferirPermissaoDoBotao(btn){
    const marcada = btn.getAttribute("data-permissao");
    if(marcada){
      const m = norm(marcada);
      return MENU_PARA_NOVO[m] || LEGADO_PARA_NOVO[m] || m;
    }

    const onclick = String(btn.getAttribute("onclick") || "").toLowerCase();
    const tip = norm(btn.getAttribute("data-tip") || btn.title || btn.innerText || btn.textContent || "");

    const alvos = [
      ["dashboard.html", "DASHBOARD_VER"],
      ["entrada.html", "ENTRADA_VER"],
      ["triagem.html", "TRIAGEM_VER"],
      ["estoque.html", "ESTOQUE_VER"],
      ["patrimonio.html", "PATRIMONIO_VER"],
      ["expedicao.html", "EXPEDICAO_VER"],
      ["relatorios.html", "RELATORIOS_VER"],
      ["movimentacoes.html", "RELATORIOS_VER"],
      ["empresa.html", "EMPRESAS_VER"],
      ["usuarios.html", "USUARIOS_VER"],
      ["configuracoes.html", "CONFIGURACOES_VER"],
      ["pedidos.html", "EXPEDICAO_VER"],
      ["prateleiras-3d.html", "ESTOQUE_VER"]
    ];

    for(const [html, perm] of alvos){
      if(onclick.includes(html)) return perm;
    }

    if(tip.includes("DASHBOARD") || tip.includes("TORRE")) return "DASHBOARD_VER";
    if(tip.includes("ENTRADA")) return "ENTRADA_VER";
    if(tip.includes("TRIAGEM")) return "TRIAGEM_VER";
    if(tip.includes("ESTOQUE")) return "ESTOQUE_VER";
    if(tip.includes("PATRIMONIO")) return "PATRIMONIO_VER";
    if(tip.includes("EXPEDICAO")) return "EXPEDICAO_VER";
    if(tip.includes("RELATORIO")) return "RELATORIOS_VER";
    if(tip.includes("EMPRESA")) return "EMPRESAS_VER";
    if(tip.includes("USUARIO")) return "USUARIOS_VER";
    if(tip.includes("CONFIG")) return "CONFIGURACOES_VER";

    return "";
  }

  function prepararBotoes(){
    document
      .querySelectorAll(".bdr-menu-btn, .side-btn, aside button, nav button, .dropdown-user button, .user-dropdown button, [data-tip]")
      .forEach(btn => {
        const p = inferirPermissaoDoBotao(btn);
        if(p) btn.setAttribute("data-permissao-resolvida", p);
      });
  }

  function aplicarMenu(u){
    u = u || usuarioLocal();
    if(!u) return;

    prepararBotoes();

    const botoes = document.querySelectorAll("[data-permissao], [data-permissao-resolvida]");

    if(owner(u) || masterLivre(u)){
      /*
        Owner/Master livre:
        força todos os botões e ações a reaparecerem.
        Isso corrige menu sumindo quando o PWA/cache ou outro patch deixou display:none inline.
      */
      document
        .querySelectorAll("[data-permissao], [data-permissao-resolvida], [data-acao-permissao], .bdr-menu-btn, .side-btn")
        .forEach(mostrarElemento);

      aplicarAcoes(u);
      return;
    }

    botoes.forEach(btn => {
      const p = norm(btn.getAttribute("data-permissao-resolvida") || btn.getAttribute("data-permissao"));
      const pode = temPermissao(p, u);

      if(pode) mostrarElemento(btn);
      else ocultarElemento(btn);
    });

    aplicarAcoes(u);
  }

  function aplicarAcoes(u){
    u = u || usuarioLocal();

    document.querySelectorAll("[data-acao-permissao]").forEach(el => {
      const p = norm(el.getAttribute("data-acao-permissao"));
      const pode = temPermissao(p, u);

      if(pode) mostrarElemento(el);
      else ocultarElemento(el);
    });
  }

  function exigir(perm, mensagem){
    if(temPermissao(perm)) return true;
    alert(mensagem || "Você não tem permissão para executar esta ação.");
    return false;
  }

  function redirecionarSeBloqueado(u){
    if(!u) return false;
    if(owner(u)) return false;
    if(temAcessoPagina(u)) return false;

    const destino = primeiraPaginaPermitida(u);

    if(paginaAtual() !== destino.toLowerCase()){
      location.replace(destino);
      return true;
    }

    return false;
  }

  async function buscarUsuarioBanco(){
    const local = usuarioLocal();
    const supa = window.client || window.supabaseClient;

    if(!local || !supa) return local;

    let q = supa.from("usuarios_sistema").select("*").limit(1);

    if(local.id) q = q.eq("id", local.id);
    else if(local.usuario) q = q.eq("usuario", local.usuario);
    else if(local.email) q = q.eq("email", local.email);
    else return local;

    const { data, error } = await q;

    if(error || !data || !data[0]) return local;

    const novo = { ...local, ...data[0] };
    salvarUsuarioLocal(novo);
    return novo;
  }

  async function iniciar(){
    let u = usuarioLocal();

    prepararBotoes();
    aplicarMenu(u);

    if(redirecionarSeBloqueado(u)) return;

    try{
      u = await buscarUsuarioBanco();
      aplicarMenu(u);

      if(redirecionarSeBloqueado(u)) return;
    }catch(e){
      console.warn("BDR permissões: usando dados locais.", e);
    }

    document.documentElement.style.visibility = "visible";

    setTimeout(() => aplicarMenu(usuarioLocal()), 300);
    setTimeout(() => aplicarMenu(usuarioLocal()), 900);
    setTimeout(() => {
      const atual = usuarioLocal();
      aplicarMenu(atual);
      redirecionarSeBloqueado(atual);
      document.documentElement.style.visibility = "visible";
    }, 1500);
  }


  function recuperarMenuOwner(){
    const u = usuarioLocal();
    if(!owner(u)) return;

    document
      .querySelectorAll("[data-permissao], [data-permissao-resolvida], [data-acao-permissao], .bdr-menu-btn, .side-btn")
      .forEach(mostrarElemento);

    document.documentElement.style.visibility = "visible";
  }

  // Segurança extra: se algum outro JS esconder o menu depois, Owner volta automaticamente.
  setInterval(recuperarMenuOwner, 2000);

  window.BDRMenuPermissoes = {
    iniciar,
    aplicarMenu,
    aplicarAcoes,
    buscarUsuarioBanco,
    redirecionarSeBloqueado,
    prepararBotoes,
    temPermissao,
    exigir,
    permissoes,
    masterLivre,
    owner,
    mostrarElemento,
    ocultarElemento,
    recuperarMenuOwner
  };

  window.usuarioTemPermissaoBDR = temPermissao;
  window.bdrExigirPermissao = exigir;
  window.bdrAplicarPermissoesTela = aplicarAcoes;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", iniciar);
  }else{
    iniciar();
  }

  console.log("✅ BDR MENU PERMISSÕES V8 carregado - Owner fix ativo");
})();
