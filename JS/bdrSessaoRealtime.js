/* =========================================================
   BDR SESSÃO REALTIME - SAFE OFFLINE V2
   Não abre WebSocket quando sem internet.
========================================================= */
(function(){
  if(window.__BDR_SESSAO_REALTIME__) return;
  window.__BDR_SESSAO_REALTIME__ = true;

  let canalSessao = null;

  function db(){ return window.client || window.supabaseClient || null; }
  function online(){ return navigator.onLine === true; }

  function usuarioAtual(){
    try{
      const u = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
      return u ? JSON.parse(u) : null;
    }catch(e){ return null; }
  }

  function sairBloqueado(){
    localStorage.removeItem("usuario_logado");
    localStorage.removeItem("usuarioLogado");
    localStorage.removeItem("perfil_usuario");
    alert("Seu acesso foi bloqueado ou alterado. Faça login novamente.");
    window.location.href = "login.html";
  }

  function atualizarTopo(usuario){
    const nome = document.getElementById("usuarioNome");
    const perfil = document.getElementById("usuarioPerfil");
    if(nome) nome.innerText = "Olá, " + (usuario?.nome || "usuário");
    if(perfil) perfil.innerText = usuario?.perfil || "-";
  }

  async function sincronizarUsuario(){
    if(!online()) return;
    const banco = db();
    const atual = usuarioAtual();
    if(!banco || !atual?.id) return;

    try{
      const { data, error } = await banco
        .from("usuarios_sistema")
        .select("*")
        .eq("id", atual.id)
        .maybeSingle();

      if(error || !data) return;
      if(data.ativo !== true){ sairBloqueado(); return; }

      localStorage.setItem("usuario_logado", JSON.stringify(data));
      localStorage.setItem("usuarioLogado", JSON.stringify(data));
      localStorage.setItem("perfil_usuario", data.perfil || "");
      atualizarTopo(data);
      window.dispatchEvent(new CustomEvent("bdrUsuarioAtualizado", { detail:data }));
    }catch(e){}
  }

  async function pararRealtimeSessao(){
    const banco = db();
    if(canalSessao && banco && typeof banco.removeChannel === "function"){
      try{ await banco.removeChannel(canalSessao); }catch(e){}
    }
    canalSessao = null;
  }

  function iniciarRealtimeSessao(){
    if(!online()) return;
    const banco = db();
    const atual = usuarioAtual();
    if(!banco || !atual?.id || !banco.channel || canalSessao) return;

    try{
      canalSessao = banco
        .channel("bdr_sessao_usuario_" + atual.id)
        .on("postgres_changes", {
          event:"UPDATE",
          schema:"public",
          table:"usuarios_sistema",
          filter:"id=eq." + atual.id
        }, payload => {
          const novo = payload.new;
          if(!novo || novo.ativo !== true){ sairBloqueado(); return; }
          localStorage.setItem("usuario_logado", JSON.stringify(novo));
          localStorage.setItem("usuarioLogado", JSON.stringify(novo));
          localStorage.setItem("perfil_usuario", novo.perfil || "");
          atualizarTopo(novo);
          window.dispatchEvent(new CustomEvent("bdrUsuarioAtualizado", { detail:novo }));
        })
        .subscribe();
    }catch(e){
      canalSessao = null;
    }
  }

  function iniciar(){
    sincronizarUsuario();
    iniciarRealtimeSessao();

    document.addEventListener("visibilitychange", () => {
      if(!document.hidden && online()) sincronizarUsuario();
    });

    window.addEventListener("offline", pararRealtimeSessao);
    window.addEventListener("online", () => {
      sincronizarUsuario();
      iniciarRealtimeSessao();
    });

    setInterval(() => {
      if(online()) sincronizarUsuario();
    }, 30000);
  }

  window.bdrSincronizarUsuario = sincronizarUsuario;
  window.bdrPararRealtimeSessao = pararRealtimeSessao;

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
