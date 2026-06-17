/*
  BDR Notificações Globais
  Coloque este arquivo em: JS/bdrNotificacoes.js
  E inclua em todas as telas antes de </body>:
  <script src="./JS/bdrNotificacoes.js"></script>
*/

(function(){

  let ultimaQtd = Number(localStorage.getItem("bdr_qtd_notif_retirada") || 0);
  let audioCtx = null;

  function db(){
    return window.client || window.supabaseClient;
  }

  function usuarioAtual(){
    try{
      const u = localStorage.getItem("usuario_logado");
      return u ? JSON.parse(u) : null;
    }catch(e){
      return null;
    }
  }

  function podeReceberNotificacao(){
    const u = usuarioAtual();
    if(!u) return false;

    const perfil = String(u.perfil || "").toUpperCase();
    const permissoes = String(u.permissoes || "").toUpperCase();

    return perfil === "MASTER" ||
           perfil === "ADMIN" ||
           perfil === "ALMOXARIFE" ||
           permissoes.includes("AUTORIZAR_RETIRADA");
  }

  function prepararSom(){
    try{
      const AudioCtx = window.AudioContext || window.webkitAudioContext;

      if(!audioCtx){
        audioCtx = new AudioCtx();
      }

      if(audioCtx.state === "suspended"){
        audioCtx.resume();
      }
    }catch(e){}
  }

  function tocar(freq, inicio, duracao, volume){
    prepararSom();
    if(!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + inicio);

    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + inicio);
    gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + inicio + 0.01);
    gain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + inicio + duracao);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(audioCtx.currentTime + inicio);
    osc.stop(audioCtx.currentTime + inicio + duracao + 0.03);
  }

  function somNotificacao(){
    tocar(850, 0, .12, .22);
    tocar(1050, .16, .12, .22);
  }

  function criarCSS(){
    if(document.getElementById("bdrNotifStyle")) return;

    const style = document.createElement("style");
    style.id = "bdrNotifStyle";
    style.innerHTML = `
      .bdr-global-bell{
        position:fixed;
        right:18px;
        bottom:18px;
        z-index:9998;
        display:none;
        align-items:center;
        gap:8px;
        padding:10px 13px;
        border-radius:999px;
        background:#fff;
        border:1px solid #fecaca;
        color:#a4161a;
        font-size:13px;
        font-weight:900;
        box-shadow:0 12px 32px rgba(0,0,0,.18);
        cursor:pointer;
        animation:bdrNotifPulse 1.1s infinite;
      }

      .bdr-global-bell span{
        min-width:22px;
        height:22px;
        border-radius:999px;
        background:#a4161a;
        color:#fff;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:12px;
      }

      .bdr-global-toast{
        position:fixed;
        right:18px;
        top:18px;
        z-index:9999;
        background:#fff;
        border-left:5px solid #a4161a;
        border-radius:14px;
        box-shadow:0 14px 40px rgba(0,0,0,.22);
        padding:13px 15px;
        min-width:280px;
        max-width:390px;
        display:none;
      }

      .bdr-global-toast strong{
        display:block;
        color:#a4161a;
        margin-bottom:4px;
      }

      .bdr-global-toast small{
        color:#374151;
        font-size:13px;
      }

      @keyframes bdrNotifPulse{
        0%{box-shadow:0 0 0 0 rgba(164,22,26,.35)}
        100%{box-shadow:0 0 0 12px rgba(164,22,26,0)}
      }

      @media(max-width:700px){
        .bdr-global-bell{
          right:12px;
          bottom:12px;
        }

        .bdr-global-toast{
          left:12px;
          right:12px;
          top:12px;
          min-width:auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function criarElementos(){
    criarCSS();

    if(!document.getElementById("bdrGlobalBell")){
      const bell = document.createElement("div");
      bell.id = "bdrGlobalBell";
      bell.className = "bdr-global-bell";
      bell.innerHTML = `🔔 Pedidos <span id="bdrGlobalBellQtd">0</span>`;
      bell.onclick = () => {
        window.location.href = "retirada.html";
      };
      document.body.appendChild(bell);
    }

    if(!document.getElementById("bdrGlobalToast")){
      const toast = document.createElement("div");
      toast.id = "bdrGlobalToast";
      toast.className = "bdr-global-toast";
      toast.innerHTML = `
        <strong>🔔 Novo pedido aguardando autorização</strong>
        <small id="bdrGlobalToastTexto">Existe pedido novo para aprovar.</small>
      `;
      document.body.appendChild(toast);
    }
  }

  function mostrarToast(total){
    const toast = document.getElementById("bdrGlobalToast");
    const texto = document.getElementById("bdrGlobalToastTexto");

    if(!toast || !texto) return;

    texto.innerText = total === 1
      ? "Existe 1 pedido aguardando autorização."
      : `Existem ${total} pedidos aguardando autorização.`;

    toast.style.display = "block";

    setTimeout(() => {
      toast.style.display = "none";
    }, 5500);
  }

  async function verificarPedidos(){
    if(!podeReceberNotificacao()) return;
    if(!db()) return;

    criarElementos();

    const { data, error } = await db()
      .from("pedidos_retirada")
      .select("id")
      .eq("status", "AGUARDANDO_AUTORIZACAO");

    if(error){
      console.warn("BDR notificações:", error.message);
      return;
    }

    const total = (data || []).length;
    const bell = document.getElementById("bdrGlobalBell");
    const qtd = document.getElementById("bdrGlobalBellQtd");

    if(qtd) qtd.innerText = total;

    if(bell){
      bell.style.display = total > 0 ? "inline-flex" : "none";
    }

    if(total > ultimaQtd){
      somNotificacao();
      mostrarToast(total);
    }

    ultimaQtd = total;
    localStorage.setItem("bdr_qtd_notif_retirada", String(total));
  }

  document.addEventListener("click", prepararSom, { once:false });
  document.addEventListener("touchstart", prepararSom, { once:false });

  window.addEventListener("load", () => {
    setTimeout(verificarPedidos, 1200);
    setInterval(verificarPedidos, 15000);
  });

})();
