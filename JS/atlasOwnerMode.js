(function(global){
"use strict";

/* =========================================================
   ATLAS OWNER MODE V1
   - Entrada secreta por 5 cliques
   - Identidade obrigatória: id=1 + nome Saulo Henrique
   - Senha criada no primeiro uso, armazenada como SHA-256
   - Sessão temporária (sessionStorage)
   - Mensagens próprias Atlas: azul, verde, amarelo e vermelho
========================================================= */

const SESSION_KEY="atlas_owner_mode_ativo";
const PASSWORD_HASH_KEY="atlas_owner_password_sha256_v1";
const OWNER_ID=1;
const OWNER_NAME="saulo henrique";
const CLICK_LIMIT=5;
const CLICK_WINDOW=2600;
const VERSION="2.0.0";
void 0;

let clicks=0;
let clickTimer=null;

function normalizar(v){
  return String(v??"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .trim()
    .toLowerCase();
}

function usuarioAtual(){
  const globais=[
    global.usuarioAtual,
    global.usuarioLogado,
    global.bdrUsuarioAtual,
    global.ATLAS_USUARIO,
    global.usuario
  ];

  for(const item of globais){
    try{
      const u=typeof item==="function"?item():item;
      if(u&&typeof u==="object"){
        // Alguns registros possuem "usuario" como login em texto (ex.: "saulo").
        // Só desempacota usuario/user quando o valor interno também for um objeto.
        if(u.usuario&&typeof u.usuario==="object")return u.usuario;
        if(u.user&&typeof u.user==="object")return u.user;
        return u;
      }
    }catch{}
  }

  const chaves=[
    "usuario_logado","usuarioLogado","bdr_usuario","bdrUsuario",
    "atlas_usuario","atlasUsuario","usuarioAtual","sessao_usuario",
    "user","currentUser"
  ];

  for(const chave of chaves){
    try{
      const raw=localStorage.getItem(chave)||sessionStorage.getItem(chave);
      if(!raw)continue;
      const parsed=JSON.parse(raw);
      let u=parsed;
      if(parsed&&typeof parsed==="object"){
        if(parsed.usuario&&typeof parsed.usuario==="object")u=parsed.usuario;
        else if(parsed.user&&typeof parsed.user==="object")u=parsed.user;
      }
      if(u&&typeof u==="object")return u;
    }catch{}
  }
  return null;
}

function identidadeOwnerValida(){
  const u=usuarioAtual()||{};
  return Number(u.id)===OWNER_ID && normalizar(u.nome||u.name)===OWNER_NAME;
}

function ativo(){
  return identidadeOwnerValida() && sessionStorage.getItem(SESSION_KEY)==="1";
}

async function sha256(texto){
  if(!global.crypto?.subtle){
    throw new Error("Este navegador não oferece o recurso seguro necessário para a senha.");
  }
  const bytes=new TextEncoder().encode(String(texto));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

function instalarEstilos(){
  if(document.getElementById("atlasOwnerModeStyles"))return;
  const style=document.createElement("style");
  style.id="atlasOwnerModeStyles";
  style.textContent=`
  [data-owner-only]{display:none!important}

  body.atlas-owner-mode [data-owner-only]{display:revert!important}
  body.atlas-owner-mode .atlas-owner-inline{display:inline-flex!important}
  body.atlas-owner-mode .atlas-owner-block{display:block!important}

  .atlas-owner-banner{
    position:sticky;top:0;z-index:2147483000;
    display:none;align-items:center;justify-content:space-between;gap:14px;
    min-height:42px;padding:8px 16px;
    background:linear-gradient(90deg,#111827,#172554);
    color:#fff;border-bottom:3px solid #f59e0b;
    box-shadow:0 8px 24px rgba(15,23,42,.24);
    font-family:Arial,sans-serif;
  }
  body.atlas-owner-mode .atlas-owner-banner{display:flex}
  .atlas-owner-banner strong{font-size:13px;letter-spacing:.03em}
  .atlas-owner-banner span{font-size:11px;color:#dbeafe;margin-left:8px}
  .atlas-owner-exit{
    border:1px solid rgba(255,255,255,.34);background:rgba(255,255,255,.10);
    color:#fff;border-radius:9px;padding:7px 11px;font-size:11px;font-weight:900;
    cursor:pointer
  }
  .atlas-owner-exit:hover{background:#fff;color:#111827}

  .atlas-owner-modal-bg{
    position:fixed;inset:0;z-index:2147483646;
    display:none;align-items:center;justify-content:center;padding:18px;
    background:rgba(15,23,42,.68);backdrop-filter:blur(2px)
  }
  .atlas-owner-modal-bg.ativo{display:flex}
  .atlas-owner-modal{
    width:min(430px,100%);background:#fff;border-radius:18px;overflow:hidden;
    box-shadow:0 28px 80px rgba(15,23,42,.38);border-top:5px solid #172554;
    font-family:Arial,sans-serif
  }
  .atlas-owner-modal-head{padding:17px 19px;border-bottom:1px solid #e5e7eb}
  .atlas-owner-modal-head h3{margin:0;color:#111827;font-size:18px}
  .atlas-owner-modal-head p{margin:5px 0 0;color:#64748b;font-size:12px}
  .atlas-owner-modal-body{padding:18px 19px}
  .atlas-owner-field{margin-bottom:12px}
  .atlas-owner-field label{display:block;margin-bottom:6px;font-size:12px;font-weight:900;color:#334155}
  .atlas-owner-password-wrap{position:relative}
  .atlas-owner-field input{
    width:100%;height:43px;border:1px solid #cbd5e1;border-radius:10px;
    padding:0 43px 0 11px;font-size:14px;outline:none
  }
  .atlas-owner-field input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
  .atlas-owner-eye{
    position:absolute;right:6px;top:50%;transform:translateY(-50%);
    width:34px;height:34px;border:0;background:transparent;color:#475569;
    border-radius:8px;cursor:pointer;padding:0;
    display:grid;place-items:center;line-height:0;overflow:hidden
  }
  .atlas-owner-eye svg{width:20px;height:20px;display:block}
  .atlas-owner-eye:hover{background:#f1f5f9;color:#172554}

  .atlas-core-splash{
    position:fixed;inset:0;z-index:2147483647;display:none;
    align-items:center;justify-content:center;padding:22px;
    background:rgba(3,10,22,.94);backdrop-filter:blur(5px);
    font-family:Arial,sans-serif;color:#fff
  }
  .atlas-core-splash.ativo{display:flex;animation:atlasCoreFade .18s ease}
  .atlas-core-box{width:min(520px,100%);text-align:center}
  .atlas-core-logo{font-size:14px;font-weight:1000;letter-spacing:.34em;color:#93c5fd}
  .atlas-core-title{font-size:31px;font-weight:1000;margin:12px 0 5px;letter-spacing:.05em}
  .atlas-core-user{font-size:13px;color:#cbd5e1;margin-bottom:22px}
  .atlas-core-progress{height:5px;background:rgba(255,255,255,.14);border-radius:999px;overflow:hidden}
  .atlas-core-progress span{display:block;width:0;height:100%;background:#f59e0b;border-radius:999px}
  .atlas-core-splash.ativo .atlas-core-progress span{animation:atlasCoreLoad 1.05s ease forwards}
  .atlas-core-step{margin-top:10px;font-size:11px;letter-spacing:.05em;color:#94a3b8}
  .atlas-core-mark{
    position:fixed;right:12px;bottom:10px;z-index:2147482000;
    display:none;padding:7px 9px;border-radius:9px;
    background:rgba(15,23,42,.88);color:#e2e8f0;
    border:1px solid rgba(148,163,184,.22);
    font:800 9px/1.35 Arial,sans-serif;letter-spacing:.08em;
    pointer-events:none
  }
  body.atlas-owner-mode .atlas-core-mark{display:block}
  .atlas-core-mark b{display:block;color:#fbbf24;font-size:10px}
  @keyframes atlasCoreLoad{0%{width:0}45%{width:48%}75%{width:82%}100%{width:100%}}
  @keyframes atlasCoreFade{from{opacity:0}to{opacity:1}}
  .atlas-owner-modal-actions{
    display:flex;justify-content:flex-end;gap:8px;padding:0 19px 18px
  }
  .atlas-owner-btn{
    border:0;border-radius:9px;padding:9px 13px;font-size:12px;font-weight:900;cursor:pointer
  }
  .atlas-owner-btn.secundario{background:#e5e7eb;color:#334155}
  .atlas-owner-btn.primario{background:#172554;color:#fff}

  .atlas-msg-stack{
    position:fixed;right:16px;top:16px;z-index:2147483647;
    display:grid;gap:9px;width:min(390px,calc(100vw - 32px));
    pointer-events:none;font-family:Arial,sans-serif
  }
  .atlas-msg{
    display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:start;
    padding:12px 12px;border-radius:13px;color:#172033;background:#fff;
    border:1px solid #dbe3ee;border-left:5px solid #2563eb;
    box-shadow:0 18px 45px rgba(15,23,42,.20);
    opacity:0;transform:translateX(16px);transition:.2s ease;
    pointer-events:auto
  }
  .atlas-msg.ativo{opacity:1;transform:none}
  .atlas-msg.verde{border-left-color:#16a34a;background:#f0fdf4}
  .atlas-msg.azul{border-left-color:#2563eb;background:#eff6ff}
  .atlas-msg.amarelo{border-left-color:#f59e0b;background:#fffbeb}
  .atlas-msg.vermelho{border-left-color:#dc2626;background:#fef2f2}
  .atlas-msg-icone{
    width:31px;height:31px;border-radius:50%;display:grid;place-items:center;
    background:rgba(255,255,255,.75);font-weight:900
  }
  .atlas-msg strong{display:block;font-size:13px;margin-bottom:2px}
  .atlas-msg p{margin:0;font-size:12px;line-height:1.35;color:#475569}
  .atlas-msg-close{border:0;background:transparent;color:#64748b;cursor:pointer;font-size:16px}

  @media(max-width:650px){
    .atlas-owner-banner{align-items:flex-start}
    .atlas-owner-banner span{display:block;margin:3px 0 0}
  }`;
  document.head.appendChild(style);
}

function criarEstrutura(){
  instalarEstilos();

  if(!document.getElementById("atlasOwnerBanner")){
    const banner=document.createElement("div");
    banner.id="atlasOwnerBanner";
    banner.className="atlas-owner-banner";
    banner.innerHTML=`
      <div>
        <strong>⚡ MODO OWNER ATIVO</strong>
        <span>Acesso temporário de manutenção — Saulo Henrique</span>
      </div>
      <button type="button" class="atlas-owner-exit" id="atlasOwnerExit">Sair do modo OWNER</button>`;
    document.body.prepend(banner);
    document.getElementById("atlasOwnerExit").addEventListener("click",desativar);
  }

  if(!document.getElementById("atlasOwnerModal")){
    const bg=document.createElement("div");
    bg.id="atlasOwnerModal";
    bg.className="atlas-owner-modal-bg";
    bg.innerHTML=`
      <div class="atlas-owner-modal" role="dialog" aria-modal="true">
        <div class="atlas-owner-modal-head">
          <h3 id="atlasOwnerModalTitle">Ativar modo OWNER</h3>
          <p id="atlasOwnerModalSub">Acesso temporário de manutenção.</p>
        </div>
        <div class="atlas-owner-modal-body" id="atlasOwnerModalBody"></div>
        <div class="atlas-owner-modal-actions">
          <button type="button" class="atlas-owner-btn secundario" id="atlasOwnerCancel">Cancelar</button>
          <button type="button" class="atlas-owner-btn primario" id="atlasOwnerConfirm">Continuar</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click",e=>{if(e.target===bg)fecharModal(null)});
  }

  if(!document.getElementById("atlasMsgStack")){
    const stack=document.createElement("div");
    stack.id="atlasMsgStack";
    stack.className="atlas-msg-stack";
    document.body.appendChild(stack);
  }

  if(!document.getElementById("atlasCoreSplash")){
    const splash=document.createElement("div");
    splash.id="atlasCoreSplash";
    splash.className="atlas-core-splash";
    splash.innerHTML=`
      <div class="atlas-core-box">
        <div class="atlas-core-logo">ATLAS CORE</div>
        <div class="atlas-core-title">OWNER MODE</div>
        <div class="atlas-core-user">Bem-vindo, Saulo Henrique</div>
        <div class="atlas-core-progress"><span></span></div>
        <div class="atlas-core-step" id="atlasCoreStep">Inicializando ambiente de manutenção...</div>
      </div>`;
    document.body.appendChild(splash);
  }

  if(!document.getElementById("atlasCoreMark")){
    const mark=document.createElement("div");
    mark.id="atlasCoreMark";
    mark.className="atlas-core-mark";
    mark.innerHTML=`<b>ATLAS CORE</b>OWNER • ONLINE`;
    document.body.appendChild(mark);
  }
}

function mensagem(tipo,titulo,texto,duracao=4200){
  criarEstrutura();
  const mapa={
    verde:{icone:"✓",classe:"verde"},
    azul:{icone:"i",classe:"azul"},
    amarelo:{icone:"!",classe:"amarelo"},
    vermelho:{icone:"×",classe:"vermelho"}
  };
  const cfg=mapa[tipo]||mapa.azul;
  const el=document.createElement("div");
  el.className=`atlas-msg ${cfg.classe}`;
  el.innerHTML=`
    <div class="atlas-msg-icone">${cfg.icone}</div>
    <div><strong></strong><p></p></div>
    <button type="button" class="atlas-msg-close" aria-label="Fechar">×</button>`;
  el.querySelector("strong").textContent=titulo;
  el.querySelector("p").textContent=texto;
  el.querySelector(".atlas-msg-close").onclick=()=>removerMensagem(el);
  document.getElementById("atlasMsgStack").appendChild(el);
  requestAnimationFrame(()=>el.classList.add("ativo"));
  if(duracao>0)setTimeout(()=>removerMensagem(el),duracao);
  return el;
}

function removerMensagem(el){
  if(!el?.isConnected)return;
  el.classList.remove("ativo");
  setTimeout(()=>el.remove(),220);
}

let modalResolver=null;
function fecharModal(valor){
  document.getElementById("atlasOwnerModal")?.classList.remove("ativo");
  const resolver=modalResolver;
  modalResolver=null;
  if(resolver)resolver(valor);
}

function campoSenha(id,label){
  return `
    <div class="atlas-owner-field">
      <label for="${id}">${label}</label>
      <div class="atlas-owner-password-wrap">
        <input id="${id}" type="password" autocomplete="off">
        <button type="button" class="atlas-owner-eye" data-eye="${id}" title="Mostrar senha" aria-label="Mostrar senha"></button>
      </div>
    </div>`;
}

function iconeOlho(senhaVisivel){
  const risco=senhaVisivel
    ? '<path d="M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    : '';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M2.4 12s3.5-6 9.6-6 9.6 6 9.6 6-3.5 6-9.6 6-9.6-6-9.6-6Z"
      fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/>
    ${risco}
  </svg>`;
}

function abrirModalSenha(primeiroUso){
  criarEstrutura();
  const bg=document.getElementById("atlasOwnerModal");
  const body=document.getElementById("atlasOwnerModalBody");
  document.getElementById("atlasOwnerModalTitle").textContent=primeiroUso?"Criar senha OWNER":"Ativar modo OWNER";
  document.getElementById("atlasOwnerModalSub").textContent=primeiroUso
    ?"Primeiro acesso neste navegador. Crie sua senha particular."
    :"Digite sua senha para liberar as ferramentas ocultas.";

  body.innerHTML=primeiroUso
    ? campoSenha("atlasOwnerPass1","Nova senha")+campoSenha("atlasOwnerPass2","Confirmar senha")
    : campoSenha("atlasOwnerPass1","Senha OWNER");

  body.querySelectorAll("[data-eye]").forEach(btn=>{
    btn.innerHTML=iconeOlho(false);
    btn.addEventListener("click",()=>{
      const input=document.getElementById(btn.dataset.eye);
      const mostrar=input.type==="password";
      input.type=mostrar?"text":"password";
      btn.innerHTML=iconeOlho(mostrar);
      btn.setAttribute("aria-label",mostrar?"Ocultar senha":"Mostrar senha");
      btn.title=mostrar?"Ocultar senha":"Mostrar senha";
    });
  });

  document.getElementById("atlasOwnerCancel").onclick=()=>fecharModal(null);
  document.getElementById("atlasOwnerConfirm").onclick=()=>{
    const p1=document.getElementById("atlasOwnerPass1")?.value||"";
    const p2=document.getElementById("atlasOwnerPass2")?.value||"";
    fecharModal({p1,p2});
  };

  bg.classList.add("ativo");
  setTimeout(()=>document.getElementById("atlasOwnerPass1")?.focus(),40);
  return new Promise(resolve=>{modalResolver=resolve});
}

async function exibirEntradaAtlasCore(){
  criarEstrutura();
  const splash=document.getElementById("atlasCoreSplash");
  const etapa=document.getElementById("atlasCoreStep");
  if(!splash)return;

  splash.classList.add("ativo");
  [[0,"Inicializando ambiente de manutenção..."],
   [310,"Verificando permissões OWNER..."],
   [650,"Liberando ferramentas internas..."],
   [930,"Sessão OWNER iniciada."]].forEach(([tempo,texto])=>{
     setTimeout(()=>{if(etapa)etapa.textContent=texto},tempo);
   });

  await new Promise(resolve=>setTimeout(resolve,1220));
  splash.classList.remove("ativo");
}

function sincronizarTela(){
  criarEstrutura();
  const on=ativo();
  document.body.classList.toggle("atlas-owner-mode",on);
  document.documentElement.classList.toggle("atlas-owner-mode",on);
  document.querySelectorAll("[data-owner-only]").forEach(el=>{
    if(on){
      el.hidden=false;
      el.style.removeProperty("display");
    }else{
      el.hidden=true;
      el.style.setProperty("display","none","important");
    }
  });
  global.dispatchEvent(new CustomEvent("atlas:owner-mode-changed",{detail:{ativo:on}}));
}

async function solicitarAtivacao(){
  if(!identidadeOwnerValida())return false;
  if(ativo()){
    mensagem("azul","Modo OWNER já está ativo","As ferramentas ocultas já estão liberadas nesta sessão.");
    return true;
  }

  const hashSalvo=localStorage.getItem(PASSWORD_HASH_KEY);
  const primeiroUso=!hashSalvo;
  const dados=await abrirModalSenha(primeiroUso);
  if(!dados)return false;

  if(!dados.p1 || dados.p1.length<6){
    mensagem("amarelo","Senha muito curta","Use pelo menos 6 caracteres.");
    return false;
  }

  if(primeiroUso){
    if(dados.p1!==dados.p2){
      mensagem("vermelho","As senhas não conferem","Digite a mesma senha nos dois campos.");
      return false;
    }
    localStorage.setItem(PASSWORD_HASH_KEY,await sha256(dados.p1));
  }else{
    const informado=await sha256(dados.p1);
    if(informado!==hashSalvo){
      mensagem("vermelho","Senha incorreta","O modo OWNER não foi ativado.");
      return false;
    }
  }

  sessionStorage.setItem(SESSION_KEY,"1");
  sincronizarTela();
  await exibirEntradaAtlasCore();
  mensagem("verde","ATLAS CORE liberado","Modo OWNER ativo. As ferramentas ocultas foram liberadas.",5200);
  return true;
}

function desativar(){
  sessionStorage.removeItem(SESSION_KEY);
  sincronizarTela();
  mensagem("azul","Modo OWNER encerrado","O Atlas voltou ao modo normal.");
}

function cliqueSecreto(event){
  if(event){
    event.stopPropagation();
    event.preventDefault();
  }
  if(!identidadeOwnerValida())return;

  clicks++;
  clearTimeout(clickTimer);
  clickTimer=setTimeout(()=>{clicks=0},CLICK_WINDOW);

  if(clicks>=CLICK_LIMIT){
    clicks=0;
    solicitarAtivacao();
  }
}

function protegerPaginaOwner({redirecionar="patrimonio.html"}={}){
  if(ativo())return true;
  mensagem("amarelo","Área protegida","Ative o modo OWNER antes de abrir esta configuração.");
  setTimeout(()=>{location.href=redirecionar},900);
  return false;
}

function resetarSenha(){
  if(!identidadeOwnerValida())return false;
  localStorage.removeItem(PASSWORD_HASH_KEY);
  desativar();
  mensagem("amarelo","Senha OWNER removida","Uma nova senha será solicitada no próximo acesso.");
  return true;
}

document.addEventListener("DOMContentLoaded",sincronizarTela);
global.addEventListener("pageshow",sincronizarTela);
global.addEventListener("storage",sincronizarTela);

global.AtlasOwnerMode={VERSION,
  SESSION_KEY,PASSWORD_HASH_KEY,
  usuarioAtual,identidadeOwnerValida,ativo,
  solicitarAtivacao,desativar,cliqueSecreto,
  sincronizarTela,mensagem,protegerPaginaOwner,resetarSenha
};

/* Compatibilidade com o nome já usado em usuários.html */
global.bdrOwnerClickUsuarios=cliqueSecreto;
global.bdrOwnerEhOwner=identidadeOwnerValida;
global.bdrOwnerModoAtivo=ativo;

})(window);
