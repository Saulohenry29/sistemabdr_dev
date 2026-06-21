/* =========================================================
   BDR ERP - CACHE LOCAL GLOBAL
   Guarda dados principais no aparelho para leitura offline.

   Tabelas:
   - estoque_produtos
   - patrimonio
   - empresas
   - obras
   - enderecamento_estoque
   - usuarios_sistema
========================================================= */

const BDR_LOCAL_CACHE_KEY = "bdr_cache_global_v1";

const BDR_TABELAS_CACHE = [
  { nome:"estoque_produtos", chave:"produtos" },
  { nome:"patrimonio", chave:"patrimonios" },
  { nome:"empresas", chave:"empresas" },
  { nome:"obras", chave:"obras" },
  { nome:"enderecamento_estoque", chave:"enderecos" },
  { nome:"usuarios_sistema", chave:"usuarios" }
];

function bdrCacheBanco(){
  return window.client || window.supabaseClient || window.clientSupabase || null;
}

function bdrCacheOnline(){
  return navigator.onLine === true;
}

function bdrLerCacheGlobal(){
  try{
    return JSON.parse(localStorage.getItem(BDR_LOCAL_CACHE_KEY) || "{}");
  }catch(e){
    return {};
  }
}

function bdrSalvarCacheGlobal(cache){
  try{
    cache.salvo_em = new Date().toISOString();
    localStorage.setItem(BDR_LOCAL_CACHE_KEY, JSON.stringify(cache));
  }catch(e){
    console.warn("BDR cache: não foi possível salvar cache local.", e);
  }
}

async function bdrAtualizarCacheGlobal(){
  if(!bdrCacheOnline()) return bdrLerCacheGlobal();

  const banco = bdrCacheBanco();
  if(!banco) return bdrLerCacheGlobal();

  const cache = bdrLerCacheGlobal();

  for(const tabela of BDR_TABELAS_CACHE){
    try{
      const { data, error } = await banco
        .from(tabela.nome)
        .select("*")
        .limit(3000);

      if(!error){
        cache[tabela.chave] = data || [];
        cache[tabela.chave + "_atualizado_em"] = new Date().toISOString();
      }
    }catch(e){
      console.warn("BDR cache: falha ao atualizar", tabela.nome, e.message || e);
    }
  }

  bdrSalvarCacheGlobal(cache);
  return cache;
}

function bdrCacheLista(chave){
  const cache = bdrLerCacheGlobal();
  return cache[chave] || [];
}

function bdrCacheBuscar(chave, campo, valor){
  return bdrCacheLista(chave).find(item => String(item?.[campo]) === String(valor)) || null;
}

async function bdrCacheAuto(){
  if(bdrCacheOnline()){
    await bdrAtualizarCacheGlobal();
  }
}

window.bdrAtualizarCacheGlobal = bdrAtualizarCacheGlobal;
window.bdrLerCacheGlobal = bdrLerCacheGlobal;
window.bdrCacheLista = bdrCacheLista;
window.bdrCacheBuscar = bdrCacheBuscar;

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(bdrCacheAuto, 1500);
});

window.addEventListener("online", () => {
  setTimeout(bdrAtualizarCacheGlobal, 1200);
});