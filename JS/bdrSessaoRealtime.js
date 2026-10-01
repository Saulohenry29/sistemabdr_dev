/* =========================================================
   BDR SESSÃO REALTIME V10.0 - OFFLINE SAFE
   Objetivo:
   - Nunca abrir websocket offline
   - Remover canal quando cair a internet
   - Reabrir somente online
   ========================================================= */

(function(){
  'use strict';

  const RT = {
    versao: '10.0-offline-safe',
    canal: null,
    ativo: false,
    nomeCanal: 'bdr-sessao-realtime'
  };

  function log(...args){
    if(window.BDR_DEBUG_REALTIME) void 0;
  }

  function onlineLocalRapido(){
    if(navigator.onLine === false) return false;
    if(typeof window.bdrOnline === 'function'){
      try { return window.bdrOnline() !== false; }
      catch(e){ return navigator.onLine !== false; }
    }
    return navigator.onLine !== false;
  }

  function temRealtime(){
    return !!(window.client && typeof window.client.channel === 'function');
  }

  function getUsuarioAtual(){
    try{
      if(typeof window.usuarioAtual === 'function') return window.usuarioAtual();
      const raw = localStorage.getItem('usuarioAtual') || localStorage.getItem('usuarioLogado') || sessionStorage.getItem('usuarioAtual');
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }

  async function pararRealtime(){
    if(RT.canal && window.client){
      try{
        if(typeof window.client.removeChannel === 'function'){
          await window.client.removeChannel(RT.canal);
        }else if(typeof RT.canal.unsubscribe === 'function'){
          await RT.canal.unsubscribe();
        }
      }catch(e){}
    }
    RT.canal = null;
    RT.ativo = false;
    log('parado');
  }

  function iniciarRealtime(){
    if(RT.ativo || RT.canal) return;
    if(!onlineLocalRapido()) return;
    if(!temRealtime()) return;

    const usuario = getUsuarioAtual();
    const usuarioId = usuario?.id || usuario?.usuario_id;
    if(!usuarioId) return;

    try{
      RT.canal = window.client
        .channel(`${RT.nomeCanal}-${usuarioId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'sessoes_ativas'
        }, payload => {
          window.dispatchEvent(new CustomEvent('bdr-sessao-realtime', { detail: payload }));
        })
        .subscribe(status => {
          RT.ativo = status === 'SUBSCRIBED';
          log('status', status);
        });
    }catch(err){
      RT.canal = null;
      RT.ativo = false;
      if(onlineLocalRapido()) console.warn('BDR realtime: erro ao iniciar:', err?.message || err);
    }
  }

  window.addEventListener('offline', () => {
    pararRealtime();
  });

  window.addEventListener('online', () => {
    // Reabre sem chamar bdrOnlineReal. Quem valida internet real é o core/sync.
    setTimeout(iniciarRealtime, 1500);
  });

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden') return;
    if(onlineLocalRapido()) iniciarRealtime();
  });

  document.addEventListener('DOMContentLoaded', () => {
    iniciarRealtime();
  });

  window.BDR_REALTIME = RT;
  window.bdrIniciarSessaoRealtime = iniciarRealtime;
  window.bdrPararSessaoRealtime = pararRealtime;

  void 0;
})();
