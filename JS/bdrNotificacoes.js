/* =========================================================
   BDR NOTIFICAÇÕES V14.0 - CORES POR INTENÇÃO
   - Sintaxe validada
   - Pendentes separadas de atualizações
   - X fecha sem navegar
   - Botão de ação apenas quando necessário
   - Marcar todas como lidas
   - Som forte em 3 toques
   - Vibração quando suportada
   - Realtime + fallback por intervalo
   - Compatível com Atlas Event Bus
   - Som disparado somente quando o sininho recebe um ID novo
========================================================= */
(function(){
  'use strict';

  if(window.BDR_NOTIF && window.BDR_NOTIF.__loaded){
    console.warn('BDR notificações já carregado. Ignorando duplicado.');
    return;
  }

  const BDR_NOTIF = {
    __loaded:true,
    versao:'14.0-cores-por-intencao',
    intervaloMs:10000,
    timer:null,
    carregando:false,
    marcandoLidas:false,
    paradoOffline:false,
    ultimoTotal:0,
    errosSeguidos:0,
    primeiraCargaConcluida:false,
    audioLiberado:false,
    audioCtx:null,
    ultimoAvisoEm:0,

    /*
     * Controle temporário dos sons já executados.
     * A mesma notificação pode chegar pelo Realtime, Event Bus e timer.
     * O ID impede que esses três caminhos reproduzam o áudio repetidamente.
     */
    sonsRecentes:new Map(),
    tempoBloqueioSom:2000,

    /*
     * Bloqueio global curto para o som de notificação.
     * Resolve casos em que a mesma ocorrência chega por caminhos diferentes
     * sem o mesmo ID/assinatura (Realtime, Event Bus ou polling).
     */
    somNotificacaoBloqueadoAte:0,
    janelaGlobalSomMs:3000,

    realtimeChannel:null,
    notificacoesCache:[],

    /*
     * IDs que já foram exibidos pelo sininho nesta sessão.
     * O áudio só é executado quando um ID realmente novo entra na lista.
     */
    notificacoesConhecidas:new Set(),

    quantidadeVisivel:5,
    passoMostrarMais:5
  };

  function temSupabase(){
    return !!(window.client && typeof window.client.from === 'function');
  }

  async function onlineReal(){
    if(navigator.onLine === false) return false;

    if(typeof window.bdrOnlineReal === 'function'){
      try{ return !!(await window.bdrOnlineReal()); }
      catch(e){ return false; }
    }

    if(typeof window.bdrOnline === 'function'){
      try{ return window.bdrOnline() !== false; }
      catch(e){ return navigator.onLine !== false; }
    }

    return navigator.onLine !== false;
  }

  function usuarioAtualSeguro(){
    try{
      if(typeof window.usuarioAtual === 'function') return window.usuarioAtual();

      const raw =
        localStorage.getItem('usuario_logado') ||
        localStorage.getItem('usuarioLogado') ||
        localStorage.getItem('usuarioAtual') ||
        sessionStorage.getItem('usuario_logado') ||
        sessionStorage.getItem('usuarioAtual');

      return raw ? JSON.parse(raw) : null;
    }catch(e){
      return null;
    }
  }

  function badgeEl(){
    return document.getElementById('notifBadge') ||
      document.getElementById('badgeNotificacoes') ||
      document.getElementById('notificacoesBadge') ||
      document.getElementById('sininhoBadge') ||
      document.querySelector('[data-bdr-badge-notificacoes]');
  }

  function listaEl(){
    return document.getElementById('notifLista') ||
      document.getElementById('listaNotificacoes') ||
      document.getElementById('notificacoesLista') ||
      document.querySelector('[data-bdr-lista-notificacoes]');
  }

  function dropdownEl(){
    return document.getElementById('notifDropdown') ||
      document.getElementById('notificacoesDropdown') ||
      document.querySelector('[data-bdr-dropdown-notificacoes]');
  }

  function notifBtnEl(){
    return document.querySelector('.notif-btn') ||
      document.querySelector('[data-bdr-btn-notificacoes]');
  }

  function escapeHtml(v){
    return String(v ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  function aplicarCss(){
    if(document.getElementById('bdrNotifV12Css')) return;

    const css = document.createElement('style');
    css.id = 'bdrNotifV12Css';
    css.textContent = `
      @keyframes bdrBellShake{
        0%{transform:rotate(0deg) scale(1)}
        15%{transform:rotate(-16deg) scale(1.08)}
        30%{transform:rotate(14deg) scale(1.08)}
        45%{transform:rotate(-10deg) scale(1.06)}
        60%{transform:rotate(8deg) scale(1.06)}
        75%{transform:rotate(-4deg) scale(1.03)}
        100%{transform:rotate(0deg) scale(1)}
      }
      @keyframes bdrBadgePulse{
        0%{transform:scale(1)}
        50%{transform:scale(1.28)}
        100%{transform:scale(1)}
      }
      .notif-btn.bdr-notif-animando i{
        animation:bdrBellShake .75s ease-in-out 0s 2;
        transform-origin:50% 0%;
      }
      .notif-badge.bdr-badge-pulse{
        animation:bdrBadgePulse .75s ease-in-out 0s 2;
      }
      .notif-wrap{
        position:relative!important;
        z-index:2147483000!important;
        overflow:visible!important;
      }
      
      .notif-dropdown{
        width:min(430px,calc(100vw - 24px))!important;
         max-height:min(700px,calc(100vh - 110px))!important;

         overflow:hidden!important;
         z-index:2147483001!important;
         isolation:isolate;
      }

       /* tablela.bdr-notif-tabela{width:100%!important;border-collapse:collapse!important} . 
          esse bloco a baixo é para ajustar o tamanho da notificação sininho */

       .notif-list{
        max-height:min(285px,calc(100vh - 205px))!important;
        overflow-y:auto!important;
        overflow-x:hidden!important;

        overscroll-behavior:contain;
        scrollbar-gutter:stable;
        touch-action:pan-y;
         user-select:text!important;
      }
      .notif-list::-webkit-scrollbar{width:10px}
      .notif-list::-webkit-scrollbar-track{background:#f1f5f9}
      .notif-list::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:999px;border:2px solid #f1f5f9}
      .notif-list::-webkit-scrollbar-thumb:hover{background:#94a3b8}
      .notif-head{
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:10px!important;
      }
      .bdr-notif-limpar-todas{
        border:0;background:#fff;color:#2563eb;font-size:11px;font-weight:900;
        border-radius:9px;padding:7px 9px;cursor:pointer;
      }
      .bdr-notif-grupo-titulo{
        padding:9px 12px 6px;color:#64748b;font-size:10px;font-weight:950;
        text-transform:uppercase;letter-spacing:.08em;background:#f8fafc;
        border-bottom:1px solid #eef2f7;
      }
      .notif-item{
        position:relative;padding:11px 42px 11px 13px!important;
        cursor:default!important;border-bottom:1px solid #eef2f7;
      }
      .notif-item.bdr-notif-acao{
        border-left:4px solid #2563eb;
        background:#eff6ff;
        cursor:pointer!important;
        transition:.16s ease;
      }
      .notif-item.bdr-notif-acao:hover{
        background:#dbeafe;
        transform:translateX(2px);
      }
      .notif-item.bdr-notif-acao::after{
        content:"Clique para abrir";
        display:block;
        margin-top:7px;
        color:#1d4ed8;
        font-size:10px;
        font-weight:900;
      }
      .notif-item.bdr-notif-info{
        border-left:4px solid #16a34a;
        background:#fff;
      }

      .notif-item.bdr-notif-erro{
        border-left:4px solid #dc2626;
        background:#fef2f2;
        cursor:default!important;
      }

      .notif-item.bdr-notif-erro strong{
        color:#991b1b;
      }
      .bdr-notif-fechar{
        position:absolute;top:8px;right:8px;width:27px;height:27px;border:0;
        border-radius:9px;background:#f1f5f9;color:#475569;font-size:15px;
        font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;
      }
      .bdr-notif-fechar:hover{background:#e2e8f0;color:#0f172a}
      .notif-item,
      .notif-item *{user-select:text!important}
      .notif-item small{display:block;margin-top:5px;color:#64748b}
      .bdr-notif-mais-wrap{padding:10px 12px;background:#f8fafc;border-top:1px solid #e5e7eb}
      .bdr-notif-mostrar-mais{width:100%;border:1px solid #bfdbfe!important;background:#eff6ff!important;color:#1d4ed8!important;border-radius:10px!important;padding:9px 12px!important;font-size:11px!important;font-weight:900!important;cursor:pointer!important}

      /* ATLAS EM 100% REAL — equivalência visual ao legado em 0,85 */
      body.atlas-shell-page .notif-dropdown{
        width:min(366px,calc(100vw - 24px))!important;
        max-height:min(595px,calc(100vh - 110px))!important;
      }
      body.atlas-shell-page .notif-list{
        max-height:min(242px,calc(100vh - 205px))!important;
      }
      body.atlas-shell-page .notif-head{
        gap:8px!important;
        padding:10px 12px!important;
        font-size:11px!important;
      }
      body.atlas-shell-page .bdr-notif-limpar-todas{
        font-size:9px!important;
        border-radius:8px!important;
        padding:6px 8px!important;
      }
      body.atlas-shell-page .bdr-notif-grupo-titulo{
        padding:8px 10px 5px!important;
        font-size:8.5px!important;
      }
      body.atlas-shell-page .notif-item{
        padding:9px 36px 9px 11px!important;
        font-size:10px!important;
        line-height:1.35!important;
      }
      body.atlas-shell-page .notif-item strong{
        margin-bottom:2px!important;
        font-size:10px!important;
      }
      body.atlas-shell-page .notif-item small{
        margin-top:4px!important;
        font-size:8.5px!important;
      }
      body.atlas-shell-page .notif-item.bdr-notif-acao::after{
        margin-top:6px!important;
        font-size:8.5px!important;
      }
      body.atlas-shell-page .bdr-notif-fechar{
        top:7px!important;
        right:7px!important;
        width:23px!important;
        height:23px!important;
        border-radius:8px!important;
        font-size:13px!important;
      }
      body.atlas-shell-page .bdr-notif-mais-wrap{
        padding:8px 10px!important;
      }
      body.atlas-shell-page .bdr-notif-mostrar-mais{
        border-radius:9px!important;
        padding:8px 10px!important;
        font-size:9px!important;
      }
      .bdr-notif-mostrar-mais:hover{background:#dbeafe!important;transform:none!important}
      .notif-btn.bdr-notif-offline{opacity:.75;filter:grayscale(.25)}
      .bdr-notif-toast-forte{
        position:fixed;top:14px;left:50%;transform:translate(-50%,-18px);
        width:min(520px,calc(100vw - 24px));background:linear-gradient(135deg,#15803d,#16a34a);
        color:#fff;border-radius:16px;padding:13px 16px;z-index:2147483647;
        box-shadow:0 18px 45px rgba(22,163,74,.30);opacity:0;pointer-events:none;
        transition:.22s ease;font-size:13px;font-weight:900;text-align:center;
      }
      .bdr-notif-toast-forte.ativo{opacity:1;transform:translate(-50%,0)}
      @media(max-width:640px){
        .notif-dropdown{
          position:fixed!important;left:10px!important;right:10px!important;top:82px!important;
          width:auto!important;max-height:calc(100dvh - 170px)!important;
        }
        .notif-list{max-height:calc(100dvh - 230px)!important}
      }
    `;
    document.head.appendChild(css);
  }

  function setIconeOffline(offline){
    const btn = notifBtnEl();
    const icon = btn?.querySelector('i');
    if(!btn || !icon) return;

    if(offline){
      btn.classList.add('bdr-notif-offline');
      icon.className = 'fa-regular fa-bell-slash';
      btn.title = 'Notificações pausadas offline';
    }else{
      btn.classList.remove('bdr-notif-offline');
      icon.className = 'fa-regular fa-bell';
      btn.title = 'Notificações';
    }
  }

  function usuarioInteragiu(event){
    if(event && event.isTrusted === false) return false;
    if(navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
    return true;
  }

  async function liberarAudio(event){
    if(BDR_NOTIF.audioLiberado) return true;
    if(!usuarioInteragiu(event)) return false;

    try{
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if(!AudioCtx) return false;

      if(!BDR_NOTIF.audioCtx) BDR_NOTIF.audioCtx = new AudioCtx();
      if(BDR_NOTIF.audioCtx.state === 'suspended') await BDR_NOTIF.audioCtx.resume();

      if(BDR_NOTIF.audioCtx.state === 'running'){
        BDR_NOTIF.audioLiberado = true;
        return true;
      }
    }catch(e){}

    return false;
  }

  function registrarLiberacaoAudio(){
    ['click','pointerdown','touchstart','keydown'].forEach(evt => {
      document.addEventListener(evt, liberarAudio, { passive:true });
    });
  }

  function tocarSom(chaveNotificacao){
    /*
     * Som oficial centralizado no Atlas Audio Engine.
     * Mantém o bip antigo apenas como reserva caso o módulo
     * atlasAudio.js ainda não esteja carregado.
     */
    if(window.AtlasAudio && typeof window.AtlasAudio.notificacao === 'function'){
      /*
       * A proteção contra repetição já acontece neste arquivo pelo ID.
       * Mantemos a chamada sem parâmetros para compatibilidade total
       * com a versão atual do Atlas Audio Engine.
       */
      window.AtlasAudio.notificacao();
      return;
    }

    if(!BDR_NOTIF.audioLiberado) return;
    if(!BDR_NOTIF.audioCtx || BDR_NOTIF.audioCtx.state !== 'running') return;

    try{
      const ctx = BDR_NOTIF.audioCtx;
      const inicio = ctx.currentTime + 0.02;

      [0,0.34,0.68].forEach((deslocamento, indice) => {
        const agora = inicio + deslocamento;
        const ganho = ctx.createGain();
        ganho.gain.setValueAtTime(0.0001, agora);
        ganho.gain.exponentialRampToValueAtTime(0.34, agora + 0.018);
        ganho.gain.exponentialRampToValueAtTime(0.0001, agora + 0.25);
        ganho.connect(ctx.destination);

        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(indice === 2 ? 1320 : 880, agora);
        osc.frequency.exponentialRampToValueAtTime(indice === 2 ? 1760 : 1240, agora + 0.16);
        osc.connect(ganho);
        osc.start(agora);
        osc.stop(agora + 0.26);
      });
    }catch(e){}
  }

  function vibrar(){
    try{
      if(typeof navigator.vibrate === 'function'){
        navigator.vibrate([260,120,260,120,480]);
      }
    }catch(e){}
  }

  function mostrarToast(texto){
    let toast = document.getElementById('bdrNotifToastForte');
    if(!toast){
      toast = document.createElement('div');
      toast.id = 'bdrNotifToastForte';
      toast.className = 'bdr-notif-toast-forte';
      document.body.appendChild(toast);
    }

    toast.textContent = texto || '🔔 Nova movimentação no Atlas';
    toast.classList.add('ativo');
    clearTimeout(window.__bdrNotifToastTimer);
    window.__bdrNotifToastTimer = setTimeout(() => toast.classList.remove('ativo'), 4200);
  }

  function animarSininho(){
    const btn = notifBtnEl();
    const badge = badgeEl();

    if(btn){
      btn.classList.remove('bdr-notif-animando');
      void btn.offsetWidth;
      btn.classList.add('bdr-notif-animando');
      setTimeout(() => btn.classList.remove('bdr-notif-animando'), 1700);
    }

    if(badge){
      badge.classList.remove('bdr-badge-pulse');
      void badge.offsetWidth;
      badge.classList.add('bdr-badge-pulse');
      setTimeout(() => badge.classList.remove('bdr-badge-pulse'), 1700);
    }
  }

  function criarChaveNotificacao(notificacao){
    const n = notificacao && typeof notificacao === 'object'
      ? notificacao
      : {};

    /*
     * O ID do banco é a chave principal.
     * O prefixo evita colisão com a chave alternativa.
     */
    if(n.id !== undefined && n.id !== null && String(n.id).trim()){
      return 'id:' + String(n.id).trim();
    }

    /*
     * Reserva para eventos antigos que ainda não enviem o ID.
     * Usa os principais dados da notificação para reconhecer a repetição.
     */
    const assinatura = [
      n.tipo,
      n.titulo,
      n.mensagem,
      n.created_at
    ]
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .join('|');

    return assinatura ? 'assinatura:' + assinatura : '';
  }

  function bloquearSomDuplicado(chave){
    if(!chave) return false;

    if(BDR_NOTIF.sonsRecentes.has(chave)){
      return true;
    }

    BDR_NOTIF.sonsRecentes.set(chave, Date.now());

    setTimeout(() => {
      BDR_NOTIF.sonsRecentes.delete(chave);
    }, BDR_NOTIF.tempoBloqueioSom);

    return false;
  }

  function modoAvisoUsuario(){
    const u=usuarioAtualSeguro();
    const perms=String(u?.permissoes || '').split(',').map(x=>x.trim().toUpperCase());
    if(perms.includes('NOTIF_MODO_SILENCIOSO')) return 'SILENCIOSO';
    if(perms.includes('NOTIF_MODO_VISUAL')) return 'VISUAL';
    return 'SOM';
  }

  function avisarNovaNotificacao(notificacao){
    /*
     * Mantém compatibilidade com chamadas antigas que enviavam somente texto.
     */
    const n = notificacao && typeof notificacao === 'object'
      ? notificacao
      : { mensagem:String(notificacao || '') };

    const textoAviso = [n.titulo, n.mensagem]
      .filter(Boolean)
      .join(' — ') || 'Nova movimentação no Atlas';

    const textoNormalizado = textoAviso.toUpperCase();
    const chave = criarChaveNotificacao(n);

    /*
     * Proteção 1: bloqueio por ID/assinatura da mesma notificação.
     */
    if(bloquearSomDuplicado(chave)){
      return;
    }

    /*
     * Proteção 2: bloqueio global curto.
     * Mesmo que outra origem entregue o evento sem o mesmo ID,
     * o áudio não será repetido logo em seguida.
     *
     * Em um ERP, várias notificações que chegam juntas produzem apenas
     * um aviso sonoro; todas continuam aparecendo normalmente no sininho.
     */
    const agoraGlobal = Date.now();
    if(agoraGlobal < BDR_NOTIF.somNotificacaoBloqueadoAte){
      return;
    }
    BDR_NOTIF.somNotificacaoBloqueadoAte =
      agoraGlobal + BDR_NOTIF.janelaGlobalSomMs;

    /*
     * Proteção de reserva para eventos muito antigos que não tragam ID
     * nem dados suficientes para formar uma assinatura.
     */
    if(!chave){
      const agora = Date.now();
      if(agora - BDR_NOTIF.ultimoAvisoEm < 850) return;
      BDR_NOTIF.ultimoAvisoEm = agora;
    }

    /*
     * Patrimônio já mostra a confirmação verde local.
     * Mantemos o som, a vibração e a animação do sininho, mas evitamos
     * criar um segundo popup por cima da confirmação da própria tela.
     */
    const ehConfirmacaoPatrimonio =
      textoNormalizado.includes("PATRIMÔNIO EXCLUÍDO") ||
      textoNormalizado.includes("PATRIMONIO EXCLUIDO") ||
      textoNormalizado.includes("PATRIMÔNIO INATIVADO") ||
      textoNormalizado.includes("PATRIMONIO INATIVADO") ||
      textoNormalizado.includes("PATRIMÔNIO REATIVADO") ||
      textoNormalizado.includes("PATRIMONIO REATIVADO");

    const modo = modoAvisoUsuario();

    if(modo === "SOM"){
      tocarSom(chave);
      vibrar();
    }

    animarSininho();

    if(ehConfirmacaoPatrimonio || modo === "SILENCIOSO") return;

    mostrarToast(textoAviso);
  }

  function bdrDataComoUTC(valor){
    if(!valor) return null;
    const txt = String(valor).trim();
    if(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(txt)) return new Date(txt);
    return new Date(txt.replace(' ','T') + 'Z');
  }

  function formatarDataBDR(valor){
    const data = bdrDataComoUTC(valor);
    if(!data || Number.isNaN(data.getTime())) return '';

    return data.toLocaleString('pt-BR', {
      timeZone:'America/Cuiaba',
      day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
    });
  }

  function agoraCuiabaParaSQL(){
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone:'America/Cuiaba',
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
    }).formatToParts(new Date());

    const obj = {};
    partes.forEach(p => { obj[p.type] = p.value; });
    return `${obj.year}-${obj.month}-${obj.day} ${obj.hour}:${obj.minute}:${obj.second}`;
  }

  function atualizarBadge(total){
    const qtd = Number(total || 0);
    BDR_NOTIF.ultimoTotal = qtd;

    const badge = badgeEl();
    if(!badge) return;

    if(qtd > 0){
      badge.textContent = qtd > 99 ? '99+' : String(qtd);
      badge.style.display = 'inline-flex';
      badge.hidden = false;
    }else{
      badge.textContent = '0';
      badge.style.display = 'none';
      badge.hidden = true;
    }
  }

  function renderMensagem(texto){
    const lista = listaEl();
    if(lista) lista.innerHTML = `<div class="notif-item">${escapeHtml(texto)}</div>`;
  }

  function notificacaoNaoLida(n){
    return String(n?.status || '').toUpperCase() !== 'LIDA' && n?.lida !== true;
  }

  function tipoEhAcao(n){
    /*
     * REGRA OFICIAL DO SININHO:
     * - tem link real: ação azul;
     * - sem link: atualização informativa;
     *
     * O tipo da notificação não decide mais sozinho.
     */
    return !!String(n?.link || '').trim();
  }

  function tipoEhErro(n){
    const tipo = String(n?.tipo || '').toUpperCase();

    return [
      'PATRIMONIO_INATIVADO',
      'PATRIMONIO_EXCLUIDO',
      'PEDIDO_RECUSADO',
      'PEDIDO_DIVERGENCIA',
      'PEDIDO_RECEBIDO_DIVERGENCIA',
      'ERRO_SEPARACAO',
      'ESTOQUE_INSUFICIENTE',
      'NFE_REJEITADA'
    ].some(x => tipo.includes(x));
  }

  function rotuloAcao(n){
    const tipo = String(n?.tipo || '').toUpperCase();
    if(tipo.includes('SEPAR')) return 'Abrir separação';
    if(tipo.includes('RETIRADA')) return 'Abrir retirada';
    if(tipo.includes('RECEB')) return 'Confirmar recebimento';
    if(tipo.includes('DIVERGEN')) return 'Analisar divergência';
    if(tipo.includes('APROV') || tipo.includes('CRIADO') || tipo.includes('ANALISE')) return 'Analisar pedido';
    return 'Abrir';
  }

  function linkSeguro(n){
    /*
     * Nunca inventa link.
     * Se o banco/gestor enviou null, a notificação é apenas informativa.
     */
    return String(n?.link || '').trim();
  }

  function renderNotificacoes(rows, manterQuantidade=false){
    const lista = listaEl();
    if(!lista) return;

    const dados = Array.isArray(rows) ? rows : [];
    BDR_NOTIF.notificacoesCache = dados;

    if(!manterQuantidade){
      BDR_NOTIF.quantidadeVisivel = BDR_NOTIF.passoMostrarMais;
    }

    if(!dados.length){
      renderMensagem('Nenhuma notificação no momento.');
      return;
    }

    const pendentes = dados.filter(tipoEhAcao);
    const atualizacoes = dados.filter(n => !tipoEhAcao(n));
    const limite = Math.max(BDR_NOTIF.passoMostrarMais, BDR_NOTIF.quantidadeVisivel);

    let restantes = limite;
    const pendentesVisiveis = pendentes.slice(0, restantes);
    restantes -= pendentesVisiveis.length;
    const atualizacoesVisiveis = atualizacoes.slice(0, Math.max(0, restantes));
    const totalVisivel = pendentesVisiveis.length + atualizacoesVisiveis.length;

    function htmlItem(n){
      const acao = tipoEhAcao(n);
      const erro = !acao && tipoEhErro(n);
      const link = escapeHtml(linkSeguro(n));
      const titulo = escapeHtml(n.titulo || n.tipo || 'Notificação');
      const mensagem = escapeHtml(n.mensagem || '');
      const data = escapeHtml(formatarDataBDR(n.created_at));

      const classeVisual = acao
        ? 'bdr-notif-acao'
        : erro
          ? 'bdr-notif-erro'
          : 'bdr-notif-info';

      return `
        <div class="notif-item ${classeVisual}"
             data-id="${escapeHtml(n.id || '')}"
             data-link="${link}">
          <button type="button" class="bdr-notif-fechar" data-fechar-notif title="Marcar como lida e remover">×</button>
          <strong>${titulo}</strong>
          <div>${mensagem}</div>
          <small>${data}</small>
        </div>`;
    }

    let html = '';
    if(pendentesVisiveis.length){
      html += '<div class="bdr-notif-grupo-titulo">Pendentes</div>';
      html += pendentesVisiveis.map(htmlItem).join('');
    }
    if(atualizacoesVisiveis.length){
      html += '<div class="bdr-notif-grupo-titulo">Atualizações</div>';
      html += atualizacoesVisiveis.map(htmlItem).join('');
    }

    if(totalVisivel < dados.length){
      const faltam = dados.length - totalVisivel;
      html += `
        <div class="bdr-notif-mais-wrap">
          <button type="button" class="bdr-notif-mostrar-mais" data-mostrar-mais>
            Mostrar mais... (${Math.min(BDR_NOTIF.passoMostrarMais, faltam)} de ${faltam})
          </button>
        </div>`;
    }

    lista.innerHTML = html;
  }

  async function carregarNotificacoes(){
    if(BDR_NOTIF.carregando) return;

    if(!(await onlineReal())){
      setIconeOffline(true);
      atualizarBadge(0);
      renderMensagem('📴 Offline. Notificações pausadas.');
      return;
    }

    setIconeOffline(false);
    if(!temSupabase()){
      renderMensagem('Nenhuma notificação no momento.');
      return;
    }

    const usuario = usuarioAtualSeguro();
    const usuarioId = usuario?.id || usuario?.usuario_id;
    const empresaId = usuario?.empresa_id;

    if(!usuarioId){
      renderMensagem('Nenhuma notificação no momento.');
      return;
    }

    BDR_NOTIF.carregando = true;

    try{
      let query = window.client
        .from('notificacoes')
        .select('*')
        .eq('usuario_destino_id', usuarioId)
        .eq('lida', false)
        .order('created_at', { ascending:false })
        .limit(50);

      if(empresaId) query = query.eq('empresa_id', empresaId);

      const { data, error } = await query;
      if(error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const naoLidas = rows.filter(notificacaoNaoLida).length;
      const primeiraCarga = !BDR_NOTIF.primeiraCargaConcluida;

      /*
       * O sininho é a fonte oficial do aviso:
       * primeiro identificamos quais registros realmente são novos,
       * depois renderizamos e somente então tocamos uma única vez.
       */
      const novas = primeiraCarga
        ? []
        : rows.filter(n => {
            const id = String(n?.id ?? '').trim();
            return id && !BDR_NOTIF.notificacoesConhecidas.has(id);
          });

      atualizarBadge(naoLidas);
      renderNotificacoes(rows, true);

      /*
       * Atualiza os IDs conhecidos depois que a lista foi exibida.
       * Mantemos somente os IDs atuais para evitar crescimento indefinido.
       */
      BDR_NOTIF.notificacoesConhecidas = new Set(
        rows
          .map(n => String(n?.id ?? '').trim())
          .filter(Boolean)
      );

      if(novas.length > 0){
        avisarNovaNotificacao(novas[0]);
      }

      BDR_NOTIF.primeiraCargaConcluida = true;
      BDR_NOTIF.errosSeguidos = 0;
    }catch(e){
      BDR_NOTIF.errosSeguidos++;
      console.warn('BDR notificações: erro ao carregar:', e?.message || e);
      renderMensagem('⚠️ Notificações indisponíveis no momento.');
    }finally{
      BDR_NOTIF.carregando = false;
    }
  }

  async function marcarNotificacaoComoLida(id, link){
    if(!id || BDR_NOTIF.marcandoLidas) return;
    if(!(await onlineReal()) || !temSupabase()) return;

    const usuario = usuarioAtualSeguro();
    const usuarioId = usuario?.id || usuario?.usuario_id;
    const empresaId = usuario?.empresa_id;
    if(!usuarioId) return;

    BDR_NOTIF.marcandoLidas = true;
    try{
      let query = window.client
        .from('notificacoes')
        .update({ lida:true, lida_em:agoraCuiabaParaSQL(), status:'LIDA' })
        .eq('id', id)
        .eq('usuario_destino_id', usuarioId);

      if(empresaId) query = query.eq('empresa_id', empresaId);

      const { error } = await query;
      if(error) throw error;

      await carregarNotificacoes();
      if(link) window.location.href = link;
    }catch(e){
      console.warn('BDR notificações: erro ao marcar como lida:', e?.message || e);
      if(link) window.location.href = link;
    }finally{
      BDR_NOTIF.marcandoLidas = false;
    }
  }

  async function marcarTodasComoLidas(){
    if(BDR_NOTIF.marcandoLidas) return;
    if(!(await onlineReal()) || !temSupabase()) return;

    const usuario = usuarioAtualSeguro();
    const usuarioId = usuario?.id || usuario?.usuario_id;
    const empresaId = usuario?.empresa_id;
    if(!usuarioId) return;

    BDR_NOTIF.marcandoLidas = true;
    try{
      let query = window.client
        .from('notificacoes')
        .update({ lida:true, lida_em:agoraCuiabaParaSQL(), status:'LIDA' })
        .eq('usuario_destino_id', usuarioId)
        .eq('lida', false);

      if(empresaId) query = query.eq('empresa_id', empresaId);

      const { error } = await query;
      if(error) throw error;
      await carregarNotificacoes();
    }catch(e){
      console.warn('BDR notificações: erro ao marcar todas:', e?.message || e);
    }finally{
      BDR_NOTIF.marcandoLidas = false;
    }
  }

  function iniciarTimer(){
    if(BDR_NOTIF.timer) return;
    BDR_NOTIF.timer = setInterval(carregarNotificacoes, BDR_NOTIF.intervaloMs);
  }

  function pararTimer(){
    if(BDR_NOTIF.timer){
      clearInterval(BDR_NOTIF.timer);
      BDR_NOTIF.timer = null;
    }
  }

  function pararRealtime(){
    try{
      if(BDR_NOTIF.realtimeChannel && window.client?.removeChannel){
        window.client.removeChannel(BDR_NOTIF.realtimeChannel);
      }
    }catch(e){}
    BDR_NOTIF.realtimeChannel = null;
  }

  function iniciarRealtime(){
    try{
      if(!temSupabase() || typeof window.client.channel !== 'function') return;
      if(BDR_NOTIF.realtimeChannel) return;

      const usuario = usuarioAtualSeguro();
      const usuarioId = usuario?.id || usuario?.usuario_id;
      const empresaId = usuario?.empresa_id;
      if(!usuarioId) return;

      BDR_NOTIF.realtimeChannel = window.client
        .channel('bdr-notif-' + usuarioId + '-' + Date.now())
        .on('postgres_changes', {
          event:'INSERT',schema:'public',table:'notificacoes',
          filter:'usuario_destino_id=eq.' + usuarioId
        }, async payload => {
          const nova = payload?.new || {};
          if(empresaId && nova.empresa_id && String(empresaId) !== String(nova.empresa_id)) return;

          /*
           * O Realtime apenas solicita a atualização.
           * Quem decide se existe algo novo e toca o som é o sininho.
           */
          await carregarNotificacoes();
        })
        .subscribe();
    }catch(e){
      console.warn('BDR notificações: realtime indisponível:', e?.message || e);
    }
  }

  async function iniciarNotificacoes(){
    if(!(await onlineReal())){
      pararTimer();
      pararRealtime();
      setIconeOffline(true);
      renderMensagem('📴 Offline. Notificações pausadas.');
      return;
    }

    await carregarNotificacoes();
    iniciarRealtime();
    iniciarTimer();
  }

  async function toggleNotificacoes(event){
    /*
     * O AtlasTopbar é o único responsável por abrir/fechar dropdowns.
     * Este módulo fica responsável somente pelo conteúdo das notificações.
     */
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const drop = dropdownEl();
    if(!drop) return;

    if(window.AtlasTopbar){
      BDR_NOTIF.quantidadeVisivel = BDR_NOTIF.passoMostrarMais;
      await carregarNotificacoes();
      renderNotificacoes(BDR_NOTIF.notificacoesCache, true);
      listaEl()?.scrollTo({ top:0, behavior:'auto' });
      return;
    }

    /* Fallback temporário para página antiga sem AtlasTopbar. */
    document.getElementById('dropdownUser')?.classList.remove('ativo','show');
    document.getElementById('userDropdown')?.classList.remove('ativo','show');

    const vaiAbrir =
      !drop.classList.contains('ativo') &&
      !drop.classList.contains('show');

    drop.classList.toggle('ativo', vaiAbrir);

    if(vaiAbrir){
      BDR_NOTIF.quantidadeVisivel = BDR_NOTIF.passoMostrarMais;
      await carregarNotificacoes();
      renderNotificacoes(BDR_NOTIF.notificacoesCache, true);
      listaEl()?.scrollTo({ top:0, behavior:'auto' });
    }
  }

  function registrarEventBus(){
    try{
      const tratar = async () => {
        /*
         * O Event Bus não toca áudio diretamente.
         * Ele apenas atualiza o sininho, que é a fonte oficial.
         */
        await carregarNotificacoes();
      };

      if(window.AtlasEvents?.on){
        window.AtlasEvents.on('notificacao.criada', tratar);
      }

      window.addEventListener('atlas:notificacao.criada', e => {
        tratar(e?.detail?.payload || e?.detail || {});
      });
    }catch(e){}
  }

  document.addEventListener('DOMContentLoaded', () => {
    aplicarCss();
    registrarLiberacaoAudio();
    registrarEventBus();

    const drop = dropdownEl();
    if(drop){
      const head = drop.querySelector('.notif-head');
      if(head && !head.querySelector('[data-marcar-todas]')){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bdr-notif-limpar-todas';
        btn.setAttribute('data-marcar-todas','');
        btn.textContent = 'Marcar todas como lidas';
        head.appendChild(btn);
      }

      ['pointerdown','mousedown','mouseup','touchstart','wheel'].forEach(tipo => {
        drop.addEventListener(tipo, e => e.stopPropagation(), { passive: tipo === 'wheel' || tipo === 'touchstart' });
      });

      drop.addEventListener('click', async e => {
        e.stopPropagation();

        if(e.target.closest('[data-mostrar-mais]')){
          BDR_NOTIF.quantidadeVisivel += BDR_NOTIF.passoMostrarMais;
          const rolagemAtual = listaEl()?.scrollTop || 0;
          renderNotificacoes(BDR_NOTIF.notificacoesCache, true);
          if(listaEl()) listaEl().scrollTop = rolagemAtual;
          return;
        }

        if(e.target.closest('[data-marcar-todas]')){
          await marcarTodasComoLidas();
          return;
        }

        const item = e.target.closest('.notif-item[data-id]');
        if(!item) return;

        const id = item.getAttribute('data-id');
        const link = item.getAttribute('data-link') || '';

        if(e.target.closest('[data-fechar-notif]')){
          await marcarNotificacaoComoLida(id, '');
          return;
        }

        const selecao = String(window.getSelection?.()?.toString() || '').trim();
        if(selecao) return;

        if(item.classList.contains('bdr-notif-acao') && link){
          await marcarNotificacaoComoLida(id, link);
        }
      });
    }

    const botaoSininho = notifBtnEl();

    /*
     * Não criamos um segundo controlador visual no mesmo botão.
     * AtlasTopbar abre/fecha; bdrNotificacoes atualiza a lista.
     */
    if(
      botaoSininho &&
      !window.AtlasTopbar &&
      !botaoSininho.dataset.bdrNotifLigado
    ){
      botaoSininho.dataset.bdrNotifLigado = '1';
      botaoSininho.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        toggleNotificacoes(e);
      });
    }

    if(
      botaoSininho &&
      window.AtlasTopbar &&
      !botaoSininho.dataset.bdrNotifConteudo
    ){
      botaoSininho.dataset.bdrNotifConteudo = '1';
      botaoSininho.addEventListener('click', async () => {
        BDR_NOTIF.quantidadeVisivel = BDR_NOTIF.passoMostrarMais;
        await carregarNotificacoes();
        renderNotificacoes(BDR_NOTIF.notificacoesCache, true);
        listaEl()?.scrollTo({ top:0, behavior:'auto' });
      });
    }

    iniciarNotificacoes();
  });

  document.addEventListener('click', e => {
    if(window.AtlasTopbar) return;
    if(!e.target.closest('.notif-wrap')){
      dropdownEl()?.classList.remove('ativo','show');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') iniciarNotificacoes();
  });

  window.addEventListener('online', iniciarNotificacoes);
  window.addEventListener('offline', () => {
    pararTimer();
    pararRealtime();
    setIconeOffline(true);
  });

  window.BDR_NOTIF = BDR_NOTIF;
  window.toggleNotificacoes = toggleNotificacoes;
  window.bdrIniciarNotificacoes = iniciarNotificacoes;
  window.bdrCarregarNotificacoes = carregarNotificacoes;
  window.bdrAvisarNovaNotificacao = avisarNovaNotificacao;
  window.bdrMarcarNotificacaoComoLida = marcarNotificacaoComoLida;
  window.bdrMarcarTodasNotificacoesComoLidas = marcarTodasComoLidas;

  console.log('✅ BDR NOTIFICAÇÕES V14.0 carregado - azul por link, verde informativa e vermelho para erro');
})();