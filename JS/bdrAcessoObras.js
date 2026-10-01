/* =========================================================
   BDR ACESSO A OBRAS
   Fonte única de verdade no frontend para o escopo de obras.
   - Atualiza a sessão a partir de usuarios_sistema antes de usar o escopo.
   - OWNER absoluto: id = 1.
   - Demais usuários: obra principal + obras_liberadas.
========================================================= */
(function(){
  "use strict";

  function db(){
    return window.client || window.supabaseClient || null;
  }

  function usuarioAtual(){
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        "{}"
      );
    }catch(_){
      return {};
    }
  }

  function salvarUsuarioAtual(usuario){
    if(!usuario || !usuario.id) return usuario || {};
    const seguro = {...usuario};
    delete seguro.senha;
    localStorage.setItem("usuario_logado", JSON.stringify(seguro));
    localStorage.setItem("usuarioLogado", JSON.stringify(seguro));
    localStorage.setItem("perfil_usuario", seguro.perfil || "");
    return seguro;
  }

  function permissoesUsuario(usuario = usuarioAtual()){
    const valor = usuario?.permissoes;
    const lista = Array.isArray(valor) ? valor : String(valor || "").split(",");
    return lista.map(p => String(p).trim().toUpperCase()).filter(Boolean);
  }

  function isOwner(usuario = usuarioAtual()){
    return Number(usuario?.id) === 1;
  }

  function podeVerTodasObras(usuario = usuarioAtual()){
    // Somente o OWNER possui escopo global real. Para os demais usuários,
    // inclusive MASTER, a fonte de verdade é obra_id + obras_liberadas.
    return isOwner(usuario);
  }

  function normalizarIdsObras(valor){
    if(valor == null || valor === "") return [];

    if(Array.isArray(valor)){
      return valor.map(v => String(v).trim()).filter(Boolean);
    }

    if(typeof valor === "object"){
      return Object.values(valor).flatMap(normalizarIdsObras);
    }

    const texto = String(valor).trim();
    if(!texto) return [];

    if((texto.startsWith("[") && texto.endsWith("]")) ||
       (texto.startsWith("{") && texto.endsWith("}"))){
      try{
        return normalizarIdsObras(JSON.parse(texto));
      }catch(_){ /* segue para separadores simples */ }
    }

    return texto
      .replace(/[\[\]{}"']/g, "")
      .split(/[;,|]/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  function idsObrasPermitidas(usuario = usuarioAtual()){
    if(!usuario) return [];

    const ids = new Set();
    if(usuario.obra_id != null && String(usuario.obra_id).trim()){
      ids.add(String(usuario.obra_id).trim());
    }

    normalizarIdsObras(usuario.obras_liberadas)
      .forEach(id => ids.add(String(id)));

    return [...ids];
  }

  function obrasPermitidas(usuario = usuarioAtual()){
    return podeVerTodasObras(usuario) ? "TODAS" : idsObrasPermitidas(usuario);
  }

  function podeAcessarObra(obraId, usuario = usuarioAtual()){
    if(obraId == null || String(obraId).trim() === "") return false;
    if(podeVerTodasObras(usuario)) return true;
    return idsObrasPermitidas(usuario).includes(String(obraId).trim());
  }

  function filtrarPorObra(lista, campo = "obra_id", usuario = usuarioAtual()){
    const dados = Array.isArray(lista) ? lista : [];
    if(podeVerTodasObras(usuario)) return dados;
    const permitidas = new Set(idsObrasPermitidas(usuario));
    return dados.filter(item => permitidas.has(String(item?.[campo] ?? "")));
  }

  async function sincronizarUsuarioAtual(){
    const atual = usuarioAtual();
    const cliente = db();
    if(!cliente || !atual?.id) return atual;

    const campos = "id,nome,usuario,email,perfil,empresa_id,obra_id,ativo,permissoes,obras_liberadas,foto_url,telefone,cargo,senha_provisoria,trocar_senha,senha_temporaria,auth_user_id,owner_sistema";

    try{
      let consulta = null;

      // Para contas já migradas, vincula a leitura à identidade autenticada.
      if(cliente.auth?.getUser){
        const {data:authData} = await cliente.auth.getUser();
        const authId = authData?.user?.id;
        if(authId){
          consulta = await cliente
            .from("usuarios_sistema")
            .select(campos)
            .eq("auth_user_id", authId)
            .limit(1);
        }
      }

      // Compatibilidade temporária com usuários legados ainda não migrados.
      if(!consulta?.data?.[0]){
        consulta = await cliente
          .from("usuarios_sistema")
          .select(campos)
          .eq("id", atual.id)
          .limit(1);
      }

      if(consulta?.error) throw consulta.error;
      const fresco = consulta?.data?.[0];
      if(!fresco) return atual;

      return salvarUsuarioAtual(fresco);
    }catch(error){
      // Se a atualização online falhar, mantém a sessão já autenticada.
      // O erro real continua disponível ao navegador para diagnóstico.
      console.error("Falha ao atualizar o escopo de obras do usuário.", error);
      return atual;
    }
  }

  window.BDRAcessoObras = {
    usuarioAtual,
    sincronizarUsuarioAtual,
    permissoesUsuario,
    isOwner,
    podeVerTodasObras,
    idsObrasPermitidas,
    obrasPermitidas,
    podeAcessarObra,
    filtrarPorObra
  };

  // Compatibilidade com chamadas já existentes no Atlas.
  window.bdrUsuarioOwner = isOwner;
  window.bdrPodeVerTodasObras = podeVerTodasObras;
  window.bdrObrasPermitidas = obrasPermitidas;
})();
