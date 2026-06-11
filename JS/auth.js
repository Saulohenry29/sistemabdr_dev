function getClient(){
  return window.client || window.supabaseClient || null;
}

async function fazerLogin(){

  const usuarioDigitado = document.getElementById("usuario").value.trim();
  const senhaDigitada = document.getElementById("senha").value.trim();
  const msg = document.getElementById("mensagem");

  if(msg) msg.textContent = "";

  if(!usuarioDigitado || !senhaDigitada){
    if(msg) msg.textContent = "Informe usuário e senha.";
    return;
  }

  const db = getClient();

  if(!db){
    if(msg) msg.textContent = "Erro: Supabase não carregado.";
    return;
  }

  const { data, error } = await db
    .from("usuarios_sistema")
    .select("*");

  if(error){
    console.error(error);
    if(msg) msg.textContent = "Erro ao consultar usuários.";
    return;
  }

  const usuario = (data || []).find(u =>
String(u.usuario) === usuarioDigitado &&
    String(u.senha) === String(senhaDigitada) &&
    u.ativo === true
  );

  if(!usuario){
    if(msg) msg.textContent = "Usuário ou senha inválidos";
    return;
  }

  localStorage.setItem("usuario_logado", JSON.stringify(usuario));
  localStorage.setItem("perfil_usuario", usuario.perfil || "");

  window.location.href = "dashboard.html";
}

function verificarLogin(){

  const usuario = localStorage.getItem("usuario_logado");

  if(!usuario){
    window.location.href = "login.html";
    return;
  }
}

function usuarioLogado(){
  const usuario = localStorage.getItem("usuario_logado");
  return usuario ? JSON.parse(usuario) : null;
}

function logout(){
  localStorage.removeItem("usuario_logado");
  localStorage.removeItem("perfil_usuario");
  window.location.href = "login.html";
}