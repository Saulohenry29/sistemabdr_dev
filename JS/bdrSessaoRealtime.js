/* =========================================================
   BDR SESSÃO REALTIME
   Atualiza usuário/permissões em tempo real
========================================================= */
(function(){
  if(window.__BDR_SESSAO_REALTIME__) return;
  window.__BDR_SESSAO_REALTIME__ = true;

  let canalSessao = null;

  function db(){
    return window.client || window.supabaseClient || null;
  }

  function usuarioAtual(){
    try{
      const u = localStorage.getItem("usuario_logado");
      return u ? JSON.parse(u) : null;
    }catch(e){
      return null;
    }
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
    const banco = db();
    const atual = usuarioAtual();

    if(!banco || !atual?.id) return;

    const { data, error } = await banco
      .from("usuarios_sistema")
      .select("*")
      .eq("id", atual.id)
      .maybeSingle();

    if(error || !data){
      console.warn("Sessão: não foi possível atualizar usuário.", error?.message);
      return;
    }

    if(data.ativo !== true){
      sairBloqueado();
      return;
    }

    localStorage.setItem("usuario_logado", JSON.stringify(data));
    localStorage.setItem("usuarioLogado", JSON.stringify(data));
    localStorage.setItem("perfil_usuario", data.perfil || "");

    atualizarTopo(data);

    window.dispatchEvent(new CustomEvent("bdrUsuarioAtualizado", { detail:data }));
  }

  function iniciarRealtimeSessao(){
    const banco = db();
    const atual = usuarioAtual();

    if(!banco || !atual?.id || !banco.channel) return;
    if(canalSessao) return;

    canalSessao = banco
      .channel("bdr_sessao_usuario_" + atual.id)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "usuarios_sistema",
          filter: "id=eq." + atual.id
        },
        payload => {
          const novo = payload.new;

          if(!novo || novo.ativo !== true){
            sairBloqueado();
            return;
          }

          localStorage.setItem("usuario_logado", JSON.stringify(novo));
          localStorage.setItem("usuarioLogado", JSON.stringify(novo));
          localStorage.setItem("perfil_usuario", novo.perfil || "");

          atualizarTopo(novo);

          window.dispatchEvent(new CustomEvent("bdrUsuarioAtualizado", { detail:novo }));

          console.log("✅ Sessão atualizada em tempo real:", novo.nome);
        }
      )
      .subscribe();
  }

  function iniciar(){
    sincronizarUsuario();
    iniciarRealtimeSessao();

    document.addEventListener("visibilitychange", () => {
      if(!document.hidden) sincronizarUsuario();
    });

    setInterval(sincronizarUsuario, 30000);
  }

  window.bdrSincronizarUsuario = sincronizarUsuario;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", iniciar);
  }else{
    iniciar();
  }

})();