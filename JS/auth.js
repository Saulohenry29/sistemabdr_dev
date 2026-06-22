/* =========================================================
   BDR AUTH - SAFE OFFLINE
   - Login precisa de internet na primeira vez.
   - Depois de logado, páginas abrem offline usando localStorage.
========================================================= */
function getClient(){
  return window.client || window.supabaseClient || null;
}

function bdrEstaOnline(){
  return navigator.onLine === true;
}

async function fazerLogin(){
  const usuarioDigitado = document.getElementById("usuario")?.value.trim();
  const senhaDigitada = document.getElementById("senha")?.value.trim();
  const msg = document.getElementById("mensagem");

  if(msg) msg.textContent = "";

  if(!usuarioDigitado || !senhaDigitada){
    if(msg) msg.textContent = "Informe usuário e senha.";
    return;
  }

  if(!bdrEstaOnline()){
    if(msg) msg.textContent = "Sem internet. Para entrar pela primeira vez, conecte na internet. Se já estava logado, abra o app sem sair da conta.";
    return;
  }

  const db = getClient();

  if(!db){
    if(msg) msg.textContent = "Erro: Supabase não carregado.";
    return;
  }

  try{
    const { data, error } = await db
      .from("usuarios_sistema")
      .select("*");

    if(error){
      console.error(error);
      if(msg) msg.textContent = "Erro ao consultar usuários.";
      return;
    }

    const usuario = (data || []).find(u =>
      String(u.usuario) === String(usuarioDigitado) &&
      String(u.senha) === String(senhaDigitada) &&
      u.ativo === true
    );

    if(!usuario){
      if(msg) msg.textContent = "Usuário ou senha inválidos";
      return;
    }

    localStorage.setItem("usuario_logado", JSON.stringify(usuario));
    localStorage.setItem("usuarioLogado", JSON.stringify(usuario));
    localStorage.setItem("perfil_usuario", usuario.perfil || "");
    localStorage.setItem("bdr_login_cache_em", new Date().toISOString());

    window.location.href = "dashboard.html";
  }catch(e){
    console.error("Erro login:", e);
    if(msg) msg.textContent = "Erro de conexão. Verifique a internet e tente novamente.";
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
  }catch(e){
    return null;
  }
}

function logout(){
  localStorage.removeItem("usuario_logado");
  localStorage.removeItem("usuarioLogado");
  localStorage.removeItem("perfil_usuario");
  window.location.href = "login.html";
}
