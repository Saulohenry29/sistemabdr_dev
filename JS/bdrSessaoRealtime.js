/* =========================================================
   BDR SESSÃO REALTIME - SAFE OFFLINE V4
   - Não abre WebSocket offline real.
   - Não consulta usuarios_sistema offline real.
   - Usa window.estaOnlineReal quando existir.
========================================================= */
(function(){
  if(window.__BDR_SESSAO_REALTIME__) return;
  window.__BDR_SESSAO_REALTIME__ = true;

  let canalSessao = null;
  let intervaloSessao = null;

  function db(){
    return window.client || window.supabaseClient || null;
  }

  async function onlineReal(){
    if(window.estaOnlineReal){
      return await window.estaOnlineReal();
    }
    return navigator.onLine === true;
  }

  function usuarioAtual(){
    try{
      const u = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
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
    const online = await onlineReal();

    if(!online){
      atualizarTopo(usuarioAtual());
      return;
    }

    const banco = db();
    const atual = usuarioAtual();

    if(!banco || !atual?.id){
      atualizarTopo(atual);
      return;
    }

    try{
      const { data, error } = await banco
        .from("usuarios_sistema")
        .select("*")
        .eq("id", atual.id)
        .maybeSingle();

      if(error || !data){
        atualizarTopo(atual);
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

    }catch(e){
      atualizarTopo(atual);
    }
  }

  async function pararRealtimeSessao(){
    const banco = db();

    if(canalSessao && banco && typeof banco.removeChannel === "function"){
      try{
        await banco.removeChannel(canalSessao);
      }catch(e){}
    }

    canalSessao = null;
  }

  async function iniciarRealtimeSessao(){
    const online = await onlineReal();

    if(!online){
      await pararRealtimeSessao();
      console.log("BDR sessão realtime desativado offline.");
      return;
    }

    const banco = db();
    const atual = usuarioAtual();

    if(!banco || !atual?.id || typeof banco.channel !== "function" || canalSessao){
      return;
    }

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

          if(!novo || novo.ativo !== true){
            sairBloqueado();
            return;
          }

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

  async function iniciar(){
    atualizarTopo(usuarioAtual());

    const online = await onlineReal();

    if(online){
      await sincronizarUsuario();
      await iniciarRealtimeSessao();
    }else{
      await pararRealtimeSessao();
    }

    document.addEventListener("visibilitychange", async () => {
      if(!document.hidden){
        const ok = await onlineReal();
        if(ok) await sincronizarUsuario();
      }
    });

    window.addEventListener("offline", async () => {
      await pararRealtimeSessao();
      atualizarTopo(usuarioAtual());
    });

    window.addEventListener("online", async () => {
      const ok = await onlineReal();
      if(ok){
        await sincronizarUsuario();
        await iniciarRealtimeSessao();
      }
    });

    if(!intervaloSessao){
      intervaloSessao = setInterval(async () => {
        const ok = await onlineReal();
        if(ok) await sincronizarUsuario();
      }, 30000);
    }
  }

  window.bdrSincronizarUsuario = sincronizarUsuario;
  window.bdrPararRealtimeSessao = pararRealtimeSessao;
  window.bdrIniciarRealtimeSessao = iniciarRealtimeSessao;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", iniciar);
  }else{
    iniciar();
  }
})();