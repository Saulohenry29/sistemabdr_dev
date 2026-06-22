/* =========================================================
   BDR OFFLINE DB - IndexedDB
   Guarda cache das tabelas e uma fila de alterações pendentes.
========================================================= */
(function(){
  "use strict";

  const DB_NAME = "BDR_ERP_OFFLINE_DB";
  const DB_VERSION = 1;
  const STORE_CACHE = "cache_tabelas";
  const STORE_QUEUE = "fila_sincronizacao";

  let dbPromise = null;

  function abrirDB(){
    if(dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if(!("indexedDB" in window)){
        reject(new Error("IndexedDB não está disponível neste navegador."));
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;

        if(!db.objectStoreNames.contains(STORE_CACHE)){
          db.createObjectStore(STORE_CACHE, { keyPath:"tabela" });
        }

        if(!db.objectStoreNames.contains(STORE_QUEUE)){
          const fila = db.createObjectStore(STORE_QUEUE, { keyPath:"id" });
          fila.createIndex("status", "status", { unique:false });
          fila.createIndex("tabela", "tabela", { unique:false });
          fila.createIndex("criado_em", "criado_em", { unique:false });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Erro ao abrir IndexedDB."));
    });

    return dbPromise;
  }

  async function tx(storeName, mode, callback){
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;

      try{
        result = callback(store);
      }catch(e){
        reject(e);
        return;
      }

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Transação cancelada."));
    });
  }

  function requestToPromise(req){
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function salvarTabela(tabela, dados){
    const registro = {
      tabela,
      dados: Array.isArray(dados) ? dados : [],
      atualizado_em: new Date().toISOString()
    };
    await tx(STORE_CACHE, "readwrite", store => store.put(registro));
    return registro;
  }

  async function lerTabela(tabela){
    const db = await abrirDB();
    const transaction = db.transaction(STORE_CACHE, "readonly");
    const store = transaction.objectStore(STORE_CACHE);
    const registro = await requestToPromise(store.get(tabela));
    return registro?.dados || [];
  }

  async function infoTabela(tabela){
    const db = await abrirDB();
    const transaction = db.transaction(STORE_CACHE, "readonly");
    const store = transaction.objectStore(STORE_CACHE);
    return await requestToPromise(store.get(tabela));
  }

  async function adicionarPendente(item){
    const agora = new Date().toISOString();
    const pendente = {
      id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tabela: item.tabela,
      acao: item.acao || "insert",
      payload: item.payload || {},
      match: item.match || null,
      status: "pendente",
      tentativas: 0,
      criado_em: agora,
      atualizado_em: agora,
      erro: null
    };
    await tx(STORE_QUEUE, "readwrite", store => store.put(pendente));
    return pendente;
  }

  async function listarPendentes(){
    const db = await abrirDB();
    const transaction = db.transaction(STORE_QUEUE, "readonly");
    const store = transaction.objectStore(STORE_QUEUE);
    const todos = await requestToPromise(store.getAll());
    return (todos || []).filter(x => x.status === "pendente").sort((a,b) => String(a.criado_em).localeCompare(String(b.criado_em)));
  }

  async function atualizarPendente(id, patch){
    const db = await abrirDB();
    const transaction = db.transaction(STORE_QUEUE, "readwrite");
    const store = transaction.objectStore(STORE_QUEUE);
    const atual = await requestToPromise(store.get(id));
    if(!atual) return null;
    const novo = { ...atual, ...patch, atualizado_em: new Date().toISOString() };
    await requestToPromise(store.put(novo));
    return novo;
  }

  async function removerPendente(id){
    await tx(STORE_QUEUE, "readwrite", store => store.delete(id));
    return true;
  }

  async function limparTudo(){
    await tx(STORE_CACHE, "readwrite", store => store.clear());
    await tx(STORE_QUEUE, "readwrite", store => store.clear());
    return true;
  }

  window.BDROfflineDB = {
    abrirDB,
    salvarTabela,
    lerTabela,
    infoTabela,
    adicionarPendente,
    listarPendentes,
    atualizarPendente,
    removerPendente,
    limparTudo
  };
})();