/* =========================================================
   BDR SYNC ENGINE V10.2 - OFFLINE FIRST
   Objetivo:
   - Patrimônio e outras páginas podem salvar offline em fila
   - Só tenta sincronizar quando houver internet real
   - Evita flood de Supabase offline
   - Compatível com bdrSyncCenter.js antigo
========================================================= */

(function(){
  'use strict';

  const KEY_FILA = 'BDR_SYNC_QUEUE_V1';
  const KEY_FILA_LEGADO = 'BDR_SYNC_QUEUE';

  const SYNC = {
    versao: '10.2-offline-first',
    timer: null,
    sincronizando: false,
    intervaloBaseMs: 15000,
    intervaloAtualMs: 15000,
    intervaloMaxMs: 120000,
    ultimaFalha: null
  };

  function log(...args){
    if(window.BDR_DEBUG_SYNC) void 0;
  }

  function onlineLocalRapido(){
    if(navigator.onLine === false) return false;

    if(typeof window.bdrOnline === 'function'){
      try { return window.bdrOnline() !== false; }
      catch(e){ return navigator.onLine !== false; }
    }

    return navigator.onLine !== false;
  }

  async function onlineRealSeguro(){
    if(!onlineLocalRapido()) return false;

    if(typeof window.bdrOnlineReal === 'function'){
      try{ return await window.bdrOnlineReal(); }
      catch(e){ return false; }
    }

    return onlineLocalRapido();
  }

  function temSupabase(){
    return !!(window.client && typeof window.client.from === 'function');
  }

  function lerJsonArray(chave){
    try{
      const raw = localStorage.getItem(chave);
      const fila = raw ? JSON.parse(raw) : [];
      return Array.isArray(fila) ? fila : [];
    }catch(e){
      return [];
    }
  }

  function lerFila(){
    const principal = lerJsonArray(KEY_FILA);
    const legado = lerJsonArray(KEY_FILA_LEGADO);

    if(!legado.length) return principal;

    const ids = new Set(principal.map(i => i && i.id).filter(Boolean));
    const juntada = principal.slice();

    legado.forEach(item => {
      if(item && item.id && ids.has(item.id)) return;
      juntada.push(item);
    });

    return juntada;
  }

  function salvarFila(fila){
    const segura = Array.isArray(fila) ? fila : [];
    localStorage.setItem(KEY_FILA, JSON.stringify(segura));
    // Mantém a chave antiga zerada para não duplicar item em tela antiga.
    localStorage.setItem(KEY_FILA_LEGADO, JSON.stringify([]));
    atualizarIndicador();
  }

  function criarId(){
    return 'sync_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
  }

  function normalizarOperacao(op){
    op = String(op || 'upsert').toLowerCase();
    if(op === 'criar') return 'insert';
    if(op === 'editar') return 'update';
    if(op === 'remover') return 'delete';
    return op;
  }

  function enfileirar(acao){
    const item = {
      id: acao.id || criarId(),
      criado_em: acao.criado_em || new Date().toISOString(),
      tentativas: Number(acao.tentativas || 0),
      tabela: acao.tabela,
      operacao: normalizarOperacao(acao.operacao || acao.tipo || 'upsert'),
      dados: acao.dados || acao.payload || {},
      match: acao.match || acao.filtro || null,
      meta: acao.meta || {},
      ultimo_erro: acao.ultimo_erro || null,
      ultima_tentativa: acao.ultima_tentativa || null
    };

    if(!item.tabela) throw new Error('BDR Sync: tabela é obrigatória.');

    const fila = lerFila();
    fila.push(item);
    salvarFila(fila);
    iniciar();
    return item;
  }

  async function executarItem(item){
    const tabela = item.tabela;
    const op = normalizarOperacao(item.operacao);
    const dados = item.dados || {};

    if(op === 'insert'){
      const payload = Array.isArray(dados) ? dados : [dados];
      return await window.client.from(tabela).insert(payload).select();
    }

    if(op === 'update'){
      let q = window.client.from(tabela).update(dados);
      const match = item.match || {};
      Object.keys(match).forEach(k => { q = q.eq(k, match[k]); });
      return await q.select();
    }

    if(op === 'delete'){
      let q = window.client.from(tabela).delete();
      const match = item.match || {};
      Object.keys(match).forEach(k => { q = q.eq(k, match[k]); });
      return await q;
    }

    const payload = Array.isArray(dados) ? dados : [dados];
    return await window.client.from(tabela).upsert(payload).select();
  }

  async function sincronizarAgora(){
    if(SYNC.sincronizando) return false;
    if(!temSupabase()) return false;
    if(!onlineLocalRapido()) return false;

    const fila = lerFila();
    if(!fila.length){
      atualizarIndicador();
      return true;
    }

    SYNC.sincronizando = true;

    try{
      const okReal = await onlineRealSeguro();
      if(!okReal) return false;

      const pendentes = lerFila();
      const restantes = [];

      for(const item of pendentes){
        try{
          const { error } = await executarItem(item);
          if(error) throw error;
          log('sincronizado', item.id, item.tabela);
        }catch(err){
          item.tentativas = Number(item.tentativas || 0) + 1;
          item.ultimo_erro = String(err?.message || err);
          item.ultima_tentativa = new Date().toISOString();
          restantes.push(item);
        }
      }

      salvarFila(restantes);

      if(restantes.length){
        falhou('Alguns itens não sincronizaram.');
      }else{
        SYNC.intervaloAtualMs = SYNC.intervaloBaseMs;
        SYNC.ultimaFalha = null;
      }

      return restantes.length === 0;
    }catch(err){
      falhou(err?.message || err);
      return false;
    }finally{
      SYNC.sincronizando = false;
      reagendar();
    }
  }

  function falhou(msg){
    SYNC.ultimaFalha = String(msg || 'Falha ao sincronizar');
    SYNC.intervaloAtualMs = Math.min(SYNC.intervaloAtualMs * 2, SYNC.intervaloMaxMs);
    log('falha:', SYNC.ultimaFalha, 'próxima em', SYNC.intervaloAtualMs);
  }

  function parar(){
    if(SYNC.timer){
      clearTimeout(SYNC.timer);
      SYNC.timer = null;
    }
  }

  function reagendar(){
    parar();
    if(!onlineLocalRapido()) return;
    if(!lerFila().length) return;
    SYNC.timer = setTimeout(() => sincronizarAgora(), SYNC.intervaloAtualMs);
  }

  function iniciar(){
    parar();
    if(!onlineLocalRapido()) return;
    if(!lerFila().length) return;
    SYNC.timer = setTimeout(() => sincronizarAgora(), 1000);
  }

  function atualizarIndicador(){
    const qtd = lerFila().length;
    const el = document.getElementById('bdrSyncStatus') || document.querySelector('[data-bdr-sync-status]');
    if(el){
      el.textContent = qtd ? `🔄 ${qtd} pendente(s) para sincronizar` : '✅ Sincronizado';
      el.style.display = 'inline-flex';
    }
    window.dispatchEvent(new CustomEvent('bdr-sync-queue-change', { detail:{ pendentes:qtd } }));
  }

  function contadores(){
    const fila = lerFila();
    const erros = fila.filter(i => i && i.ultimo_erro).length;
    return {
      total: fila.length,
      pendentes: fila.length,
      sincronizados: 0,
      erros,
      erro: erros,
      ultimaFalha: SYNC.ultimaFalha,
      sincronizando: !!SYNC.sincronizando
    };
  }

  function listarTudo(){
    return lerFila();
  }

  async function limparTudo(){
    salvarFila([]);
    return true;
  }

  async function remover(id){
    const fila = lerFila().filter(i => String(i.id) !== String(id));
    salvarFila(fila);
    return true;
  }

  window.addEventListener('offline', () => {
    parar();
    atualizarIndicador();
  });

  window.addEventListener('online', () => {
    if(typeof window.bdrResetOnlineReal === 'function'){
      try{ window.bdrResetOnlineReal(); }catch(e){}
    }
    SYNC.intervaloAtualMs = SYNC.intervaloBaseMs;
    iniciar();
  });

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') iniciar();
  });

  document.addEventListener('DOMContentLoaded', () => {
    atualizarIndicador();
    iniciar();
  });

  window.BDR_SYNC = SYNC;
  window.bdrSyncEnfileirar = enfileirar;
  window.bdrSyncAgora = sincronizarAgora;
  window.bdrSyncForcarAgora = sincronizarAgora;
  window.bdrSyncFila = lerFila;
  window.bdrSyncPendentes = () => lerFila().length;

  window.BDRSync = window.BDRSync || {};
  window.BDRSync.criar = async function(tabela, dados, meta){
    return enfileirar({
      tabela,
      operacao:'insert',
      dados:Array.isArray(dados) ? dados : [dados],
      meta:meta || {}
    });
  };
  window.BDRSync.atualizar = async function(tabela, match, dados, meta){
    return enfileirar({
      tabela,
      operacao:'update',
      match:match || {},
      dados:dados || {},
      meta:meta || {}
    });
  };
  window.BDRSync.sincronizar = sincronizarAgora;
  window.BDRSync.sincronizarAgora = sincronizarAgora;
  window.BDRSync.processarFila = sincronizarAgora;
  window.BDRSync.pendentes = function(){ return lerFila().length; };
  window.BDRSync.contadores = async function(){ return contadores(); };
  window.BDRSync.listarTudo = async function(){ return listarTudo(); };
  window.BDRSync.limparTudo = limparTudo;
  window.BDRSync.remover = remover;

  void 0;
})();
