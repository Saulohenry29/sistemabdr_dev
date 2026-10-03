/* =========================================================
   BDR AUTH - TRANSIÇÃO SEGURA PARA SUPABASE AUTH
   - Usuários migrados: senha validada exclusivamente pelo Supabase Auth.
   - Usuários ainda não migrados: login legado temporário até migração.
   - Nunca grava senha no localStorage.
========================================================= */
function getClient(){
  return window.client || window.supabaseClient || null;
}

function bdrEstaOnline(){
  return navigator.onLine === true;
}

function mostrarMensagemAuth(texto, cor="red"){
  const msg = document.getElementById("mensagem");
  if(!msg) return;
  msg.style.color = cor;
  msg.textContent = texto || "";
}

function senhaEhTemporariaBDR(usuario){
  return usuario?.senha_temporaria === true ||
         usuario?.senha_provisoria === true ||
         usuario?.trocar_senha === true ||
         String(usuario?.senha_temporaria).toLowerCase() === "true" ||
         String(usuario?.senha_provisoria).toLowerCase() === "true" ||
         String(usuario?.trocar_senha).toLowerCase() === "true";
}

function destinoPadraoBDR(usuario){
  const perms = String(usuario?.permissoes || "").toUpperCase();
  if(perms.includes("DASHBOARD_VER")) return "atlas.html#m=dashboard";
  if(perms.includes("PATRIMONIO_VER")) return "atlas.html#m=patrimonio";
  if(perms.includes("ESTOQUE_VER")) return "atlas.html#m=estoque";
  if(perms.includes("EXPEDICAO_VER")) return "atlas.html#m=expedicao";
  if(perms.includes("RELATORIOS_VER")) return "atlas.html#m=relatorios";
  return "atlas.html#m=dashboard";
}

async function buscarUsuarioLoginBDR(db, login){
  const campos = "id,nome,usuario,email,senha,perfil,empresa_id,obra_id,ativo,permissoes,obras_liberadas,foto_url,telefone,cargo,senha_provisoria,trocar_senha,senha_temporaria,auth_user_id,auth_status,owner_sistema";

  let resp = await db
    .from("usuarios_sistema")
    .select(campos)
    .eq("usuario", login)
    .limit(1);

  if(resp.error) throw resp.error;
  if(resp.data?.[0]) return resp.data[0];

  resp = await db
    .from("usuarios_sistema")
    .select(campos)
    .eq("email", login)
    .limit(1);

  if(resp.error) throw resp.error;
  return resp.data?.[0] || null;
}

function salvarSessaoAtlas(usuario, login){
  const usuarioSessao = {...usuario};
  delete usuarioSessao.senha;

  localStorage.setItem("usuario_logado", JSON.stringify(usuarioSessao));
  localStorage.setItem("usuarioLogado", JSON.stringify(usuarioSessao));
  localStorage.setItem("perfil_usuario", usuarioSessao.perfil || "");
  localStorage.setItem("bdr_login_cache_em", new Date().toISOString());

  if(document.getElementById("lembrar")?.checked){
    localStorage.setItem("bdr_login_lembrado", login);
  }else{
    localStorage.removeItem("bdr_login_lembrado");
  }

  return usuarioSessao;
}

async function fazerLogin(){
  const login = document.getElementById("usuario")?.value.trim();
  const senha = document.getElementById("senha")?.value;

  mostrarMensagemAuth("");

  if(!login || !senha){
    mostrarMensagemAuth("Informe usuário e senha.");
    return;
  }

  if(!bdrEstaOnline()){
    mostrarMensagemAuth("Sem internet. Conecte-se para fazer login.");
    return;
  }

  const db = getClient();
  if(!db){
    mostrarMensagemAuth("Erro: serviço de autenticação indisponível.");
    return;
  }

  try{
    const usuario = await buscarUsuarioLoginBDR(db, login);

    if(!usuario || usuario.ativo === false || String(usuario.ativo).toLowerCase() === "false"){
      mostrarMensagemAuth("Usuário ou senha inválidos.");
      return;
    }

    const migrado = String(usuario.auth_status || "LEGADO").toUpperCase() === "ATIVO" && Boolean(usuario.auth_user_id);

    if(migrado){
      // O login visível pode ser "saulo"; o Auth usa o e-mail vinculado internamente.
      if(!usuario.email){
        mostrarMensagemAuth("Cadastro de autenticação incompleto. Procure o administrador.");
        return;
      }

      // Garante que não exista sessão Auth anterior influenciando a validação.
      try { await db.auth.signOut({ scope: "local" }); } catch(_e) {}

      const { data: authData, error: authError } = await db.auth.signInWithPassword({
        email: String(usuario.email).trim(),
        password: senha
      });

      if(authError || !authData?.user){
        mostrarMensagemAuth("Usuário ou senha inválidos.");
        return;
      }

      // Segurança crítica: o UUID autenticado deve ser exatamente o vinculado ao cadastro Atlas.
      if(String(authData.user.id).toLowerCase() !== String(usuario.auth_user_id).toLowerCase()){
        await db.auth.signOut();
        mostrarMensagemAuth("Identidade de autenticação inválida.");
        return;
      }
    }else{
      // TRANSIÇÃO: somente usuários ainda não migrados podem usar a senha legada.
      if(String(usuario.senha || "") !== String(senha)){
        mostrarMensagemAuth("Usuário ou senha inválidos.");
        return;
      }
    }

    const usuarioSessao = salvarSessaoAtlas(usuario, login);

    try{
      await db
        .from("usuarios_sistema")
        .update({ ultimo_login: new Date().toISOString() })
        .eq("id", usuario.id);
    }catch(_e){}

    const migracaoSeguraPendente =
      String(usuarioSessao.auth_status || "").toUpperCase() === "AGUARDANDO_ATIVACAO" &&
      Boolean(usuarioSessao.auth_user_id);

    if(migracaoSeguraPendente){
      window.location.href = "alterar-senha.html";
      return;
    }

    if(!migrado && senhaEhTemporariaBDR(usuarioSessao)){
      window.location.href = "alterar-senha.html";
      return;
    }

    window.location.href = destinoPadraoBDR(usuarioSessao);
  }catch(e){
    console.error("Erro login:", e);
    mostrarMensagemAuth("Não foi possível autenticar. Tente novamente.");
  }
}

function verificarLogin(){
  const usuario = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
  if(!usuario){
    window.location.href = "login.html";
    return false;
  }
  return true;
}

function usuarioLogado(){
  try{
    const usuario = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
    return usuario ? JSON.parse(usuario) : null;
  }catch(_e){
    return null;
  }
}

async function logout(){
  try{
    const db = getClient();
    if(db?.auth) await db.auth.signOut();
  }catch(_e){}

  localStorage.removeItem("usuario_logado");
  localStorage.removeItem("usuarioLogado");
  localStorage.removeItem("perfil_usuario");
  localStorage.removeItem("bdr_login_cache_em");
  window.location.href = "login.html";
}
