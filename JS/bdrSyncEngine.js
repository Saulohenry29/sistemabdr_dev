/* =========================================================
   BDR SYNC ENGINE V1 - OFFLINE FIRST PROFISSIONAL
   Salva primeiro no tablet e sincroniza automaticamente.
   Requer: JS/bdrOfflineDB.js e JS/supabaseClient.js
========================================================= */
(function(){
  "use strict";

  const TENTATIVAS_MAX = 5;
  const INTERVALO_SYNC_MS = 30000;

  function db(){
    return window.client || window.supabaseClient || window.clientSupabase || null;
  }

  function online(){
    if(window.BDR_PATRIMONIO_ONLINE_REAL === false) return false;
    return navigator.onLine === true && !!db();
  }

  function agora(){
    return new Date().toISOString();
  }

  function emitirStatus(){
    window.dispatchEvent(new CustomEvent("bdr-sync-status"));
  }

  async function salvarLocal(tabela, acao, payload, match=null, meta={}){
    if(!window.BDROfflineDB){
      throw new Error("BDROfflineDB não carregado. Inclua JS/bdrOfflineDB.js antes do bdrSyncEngine.js");
    }

    const item = await window.BDROfflineDB.adicionarPendente({
      tabela,
      acao,
      payload,
      match,
      meta,
      status:"pendente"
    });

    emitirStatus();

    if(online()){
      sincronizarPendentes({silencioso:true});
    }

    return item;
  }

  async function criar(tabela, payload, meta={}){
    return await salvarLocal(tabela, "insert", payload, null, meta);
  }

  async function atualizar(tabela, match, payload, meta={}){
    return await salvarLocal(tabela, "update", payload, match, meta);
  }

  async function excluir(tabela, match, meta={}){
    return await salvarLocal(tabela, "delete", {}, match, meta);
  }

  async function buscarOnlineECriarCache(tabela, queryBuilder){
    if(!window.BDROfflineDB) return [];

    if(online() && typeof queryBuilder === "function"){
      try{
        const resp = await queryBuilder(db().from(tabela));
        if(resp.error) throw resp.error;
        await window.BDROfflineDB.salvarTabela(tabela, resp.data || []);
        return resp.data || [];
      }catch(e){
        console.warn("BDR Sync: falha online, usando cache:", tabela, e.message);
      }
    }

    return await window.BDROfflineDB.lerTabela(tabela);
  }

  async function aplicarItem(item){
    const banco = db();
    if(!banco) throw new Error("Supabase indisponível.");

    let resp;

    if(item.acao === "insert"){
      resp = await banco.from(item.tabela).insert([item.payload]).select();
    }

    if(item.acao === "update"){
      if(!item.match) throw new Error("Update sem match/filtro.");
      let q = banco.from(item.tabela).update(item.payload);
      Object.entries(item.match).forEach(([campo, valor]) => {
        q = q.eq(campo, valor);
      });
      resp = await q.select();
    }

    if(item.acao === "delete"){
      if(!item.match) throw new Error("Delete sem match/filtro.");
      let q = banco.from(item.tabela).delete();
      Object.entries(item.match).forEach(([campo, valor]) => {
        q = q.eq(campo, valor);
      });
      resp = await q.select();
    }

    if(resp?.error) throw resp.error;
    return resp?.data || null;
  }

  async function sincronizarPendentes(opcoes={}){
    if(!window.BDROfflineDB || !online()) return {ok:false, motivo:"offline"};

    const pendentes = await window.BDROfflineDB.listarPendentes();
    let ok = 0, erro = 0;

    for(const item of pendentes){
      try{
        await window.BDROfflineDB.atualizarPendente(item.id, {
          status:"sincronizando",
          atualizado_em:agora()
        });

        await aplicarItem(item);

        await window.BDROfflineDB.atualizarPendente(item.id, {
          status:"sincronizado",
          erro:null,
          atualizado_em:agora()
        });

        ok++;
      }catch(e){
        const tentativas = Number(item.tentativas || 0) + 1;
        const status = tentativas >= TENTATIVAS_MAX ? "erro" : "pendente";

        await window.BDROfflineDB.atualizarPendente(item.id, {
          status,
          tentativas,
          erro:e.message || String(e),
          atualizado_em:agora()
        });

        erro++;
      }

      emitirStatus();
    }

    if(!opcoes.silencioso && (ok || erro)){
      console.log(`BDR Sync: ${ok} sincronizado(s), ${erro} erro(s).`);
    }

    return {ok:true, sincronizados:ok, erros:erro};
  }

  async function listarTudo(){
    if(!window.BDROfflineDB) return [];
    const indexed = await window.BDROfflineDB.abrirDB();
    return new Promise((resolve, reject) => {
      const tx = indexed.transaction("fila_sincronizacao", "readonly");
      const store = tx.objectStore("fila_sincronizacao");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function contadores(){
    const todos = await listarTudo();
    return {
      pendentes: todos.filter(x => x.status === "pendente" || x.status === "sincronizando").length,
      sincronizados: todos.filter(x => x.status === "sincronizado").length,
      erros: todos.filter(x => x.status === "erro").length,
      conflitos: todos.filter(x => x.status === "conflito").length,
      total: todos.length
    };
  }

  window.addEventListener("online", () => sincronizarPendentes({silencioso:true}));
  setInterval(() => {
    if(online()) sincronizarPendentes({silencioso:true});
  }, INTERVALO_SYNC_MS);

  window.BDRSync = {
    online,
    criar,
    atualizar,
    excluir,
    salvarLocal,
    buscarOnlineECriarCache,
    sincronizarPendentes,
    listarTudo,
    contadores
  };

  console.log("✅ BDR Sync Engine V1 carregado - offline-first ativo");
})();