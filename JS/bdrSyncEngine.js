/* =========================================================
   BDR SYNC ENGINE V2 - OFFLINE FIRST PROFISSIONAL
   Salva primeiro no tablet e sincroniza automaticamente.

   Melhorias:
   - Evento bdr-sync-finalizado após sincronizar
   - Evento bdr-sync-item-sincronizado por item
   - Evita sync duplicado
   - Testa internet real antes de enviar
========================================================= */
(function(){
  "use strict";

  const TENTATIVAS_MAX = 5;
  const INTERVALO_SYNC_MS = 30000;
  const PING_TIMEOUT_MS = 1800;

  let sincronizandoAgora = false;
  let ultimaChecagemOnline = 0;
  let ultimoOnlineReal = null;

  function db(){
    return window.client || window.supabaseClient || window.clientSupabase || null;
  }

  function agora(){
    return new Date().toISOString();
  }

  function emitirStatus(extra={}){
    window.dispatchEvent(new CustomEvent("bdr-sync-status", {
      detail:{ em:agora(), ...extra }
    }));
  }

  function emitirFinalizado(resultado){
    window.dispatchEvent(new CustomEvent("bdr-sync-finalizado", {
      detail:{ em:agora(), ...resultado }
    }));
  }

  function emitirItemSincronizado(item, data){
    window.dispatchEvent(new CustomEvent("bdr-sync-item-sincronizado", {
      detail:{ em:agora(), item, data }
    }));
  }

  async function onlineReal(){
    if(window.BDR_PATRIMONIO_ONLINE_REAL === false) return false;
    if(navigator.onLine === false) return false;
    if(!db()) return false;

    const agoraMs = Date.now();

    if(ultimoOnlineReal !== null && (agoraMs - ultimaChecagemOnline) < 8000){
      return ultimoOnlineReal;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

    try{
      const { error } = await db()
        .from("obras")
        .select("id")
        .limit(1)
        .abortSignal(controller.signal);

      clearTimeout(timer);

      ultimoOnlineReal = !error;
      ultimaChecagemOnline = Date.now();

      return ultimoOnlineReal;
    }catch(e){
      clearTimeout(timer);

      ultimoOnlineReal = false;
      ultimaChecagemOnline = Date.now();

      return false;
    }
  }

  function online(){
    if(window.BDR_PATRIMONIO_ONLINE_REAL === false) return false;
    return navigator.onLine === true && !!db();
  }

  async function salvarLocal(tabela, acao, payload, match=null, meta={}){
    if(!window.BDROfflineDB){
      throw new Error("BDROfflineDB não carregado. Inclua JS/offlineDB.js antes do bdrSyncEngine.js");
    }

    const item = await window.BDROfflineDB.adicionarPendente({
      tabela,
      acao,
      payload,
      match,
      meta,
      status:"pendente"
    });

    emitirStatus({motivo:"novo_pendente", item});

    if(await onlineReal()){
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

    if(await onlineReal() && typeof queryBuilder === "function"){
      try{
        const resp = await queryBuilder(db().from(tabela));
        if(resp.error) throw resp.error;

        await window.BDROfflineDB.salvarTabela(tabela, resp.data || []);
        return resp.data || [];
      }catch(e){
        console.warn("BDR Sync: falha online, usando cache:", tabela, e.message || e);
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
    if(sincronizandoAgora){
      return {ok:false, motivo:"sync_em_andamento"};
    }

    if(!window.BDROfflineDB){
      return {ok:false, motivo:"offlineDB_indisponivel"};
    }

    if(!(await onlineReal())){
      emitirStatus({motivo:"offline"});
      return {ok:false, motivo:"offline"};
    }

    sincronizandoAgora = true;

    const pendentes = await window.BDROfflineDB.listarPendentes();

    let ok = 0;
    let erro = 0;
    let pulados = 0;

    emitirStatus({motivo:"inicio_sync", total:pendentes.length});

    for(const item of pendentes){
      try{
        if(!(await onlineReal())){
          pulados++;
          break;
        }

        await window.BDROfflineDB.atualizarPendente(item.id, {
          status:"sincronizando",
          atualizado_em:agora()
        });

        const data = await aplicarItem(item);

        await window.BDROfflineDB.atualizarPendente(item.id, {
          status:"sincronizado",
          erro:null,
          atualizado_em:agora()
        });

        ok++;
        emitirItemSincronizado(item, data);

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

      emitirStatus({motivo:"item_processado"});
    }

    sincronizandoAgora = false;

    const resultado = {
      ok:true,
      sincronizados:ok,
      erros:erro,
      pulados
    };

    if(!opcoes.silencioso && (ok || erro || pulados)){
      console.log(`BDR Sync: ${ok} sincronizado(s), ${erro} erro(s), ${pulados} pulado(s).`);
    }

    emitirStatus({motivo:"fim_sync", ...resultado});

    if(ok > 0 || erro > 0){
      emitirFinalizado(resultado);
    }

    return resultado;
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

  window.addEventListener("online", () => {
    setTimeout(() => sincronizarPendentes({silencioso:true}), 1500);
  });

  setInterval(() => {
    sincronizarPendentes({silencioso:true});
  }, INTERVALO_SYNC_MS);

  window.BDRSync = {
    online,
    onlineReal,
    criar,
    atualizar,
    excluir,
    salvarLocal,
    buscarOnlineECriarCache,
    sincronizarPendentes,
    listarTudo,
    contadores
  };

  console.log("✅ BDR Sync Engine V2 carregado - offline-first ativo");
})();
