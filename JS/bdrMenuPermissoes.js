/* =========================================================
   BDR MENU PERMISSÕES V6 - OFICIAL
   Arquivo: JS/bdrMenuPermissoes.js

   REGRA:
   - MASTER/ADMIN com permissoes NULL ou vazias = vê tudo.
   - Qualquer usuário com permissoes preenchidas = vê só o que tiver ali.
   - Bloqueia acesso direto por URL.
   - Esconde menu lateral e dropdown do usuário.
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
    "dashboard.html": "DASHBOARD",
    "entrada.html": "ENTRADA",
    "triagem.html": "TRIAGEM",
    "estoque.html": "ESTOQUE",
    "patrimonio.html": "PATRIMONIO",
    "expedicao.html": "EXPEDICAO",
    "relatorios.html": "RELATORIOS",
    "movimentacoes.html": "RELATORIOS",
    "empresa.html": "EMPRESAS",
    "usuarios.html": "USUARIOS",
    "configuracoes.html": "CONFIGURACOES",
    "pedidos.html": "EXPEDICAO",
    "prateleiras-3d.html": "ESTOQUE"
  };

  const ORDEM = [
    "DASHBOARD",
    "PATRIMONIO",
    "ESTOQUE",
    "ENTRADA",
    "TRIAGEM",
    "EXPEDICAO",
    "RELATORIOS",
    "EMPRESAS",
    "USUARIOS",
    "CONFIGURACOES"
  ];

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

  function permissoes(u){
    return String(u?.permissoes || "")
      .split(",")
      .map(norm)
      .filter(Boolean);
  }

  function perfil(u){
    return norm(u?.perfil);
  }

  function masterLivre(u){
    const p = perfil(u);
    const ps = permissoes(u);
    return (p === "MASTER" || p === "ADMIN") && ps.length === 0;
  }

  function paginaAtual(){
    return String(location.pathname.split("/").pop() || "dashboard.html").toLowerCase();
  }

  function permissaoDaPagina(){
    return PERM_PAGINA[paginaAtual()] || "";
  }

  function primeiraPaginaPermitida(u){
    if(masterLivre(u)) return "dashboard.html";

    const ps = permissoes(u);
    const achou = ORDEM.find(p => ps.includes(p));

    return PAGINAS[achou] || "dashboard.html";
  }

  function temAcessoPagina(u){
    if(!u) return false;
    if(masterLivre(u)) return true;

    const precisa = permissaoDaPagina();
    if(!precisa) return true;

    return permissoes(u).includes(precisa);
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
    if(marcada) return norm(marcada);

    const onclick = String(btn.getAttribute("onclick") || "").toLowerCase();
    const tip = norm(btn.getAttribute("data-tip") || btn.title || btn.innerText || btn.textContent || "");

    const alvos = [
      ["dashboard.html", "DASHBOARD"],
      ["entrada.html", "ENTRADA"],
      ["triagem.html", "TRIAGEM"],
      ["estoque.html", "ESTOQUE"],
      ["patrimonio.html", "PATRIMONIO"],
      ["expedicao.html", "EXPEDICAO"],
      ["relatorios.html", "RELATORIOS"],
      ["movimentacoes.html", "RELATORIOS"],
      ["empresa.html", "EMPRESAS"],
      ["usuarios.html", "USUARIOS"],
      ["configuracoes.html", "CONFIGURACOES"],
      ["pedidos.html", "EXPEDICAO"],
      ["prateleiras-3d.html", "ESTOQUE"]
    ];

    for(const [html, perm] of alvos){
      if(onclick.includes(html)) return perm;
    }

    if(tip.includes("DASHBOARD") || tip.includes("TORRE")) return "DASHBOARD";
    if(tip.includes("ENTRADA")) return "ENTRADA";
    if(tip.includes("TRIAGEM")) return "TRIAGEM";
    if(tip.includes("ESTOQUE")) return "ESTOQUE";
    if(tip.includes("PATRIMONIO")) return "PATRIMONIO";
    if(tip.includes("EXPEDICAO")) return "EXPEDICAO";
    if(tip.includes("RELATORIO")) return "RELATORIOS";
    if(tip.includes("EMPRESA")) return "EMPRESAS";
    if(tip.includes("USUARIO")) return "USUARIOS";
    if(tip.includes("CONFIG")) return "CONFIGURACOES";

    return "";
  }

  function prepararBotoes(){
    document
      .querySelectorAll(".bdr-menu-btn, .side-btn, aside button, nav button, .dropdown-user button, .user-dropdown button, [data-tip]")
      .forEach(btn => {
        const p = inferirPermissaoDoBotao(btn);
        if(p) btn.setAttribute("data-permissao", p);
      });
  }

  function aplicarMenu(u){
    u = u || usuarioLocal();
    if(!u) return;

    prepararBotoes();

    const botoes = document.querySelectorAll("[data-permissao]");

    if(masterLivre(u)){
      botoes.forEach(btn => {
        btn.hidden = false;
        btn.style.display = "";
        btn.dataset.bloqueado = "NAO";
      });
      return;
    }

    const ps = permissoes(u);

    botoes.forEach(btn => {
      const p = norm(btn.getAttribute("data-permissao"));
      const pode = ps.includes(p);

      btn.hidden = !pode;
      btn.style.display = pode ? "" : "none";
      btn.dataset.bloqueado = pode ? "NAO" : "SIM";
    });
  }

  function redirecionarSeBloqueado(u){
    if(!u) return false;
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

  window.BDRMenuPermissoes = {
    iniciar,
    aplicarMenu,
    buscarUsuarioBanco,
    redirecionarSeBloqueado,
    prepararBotoes
  };

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", iniciar);
  }else{
    iniciar();
  }

})();
