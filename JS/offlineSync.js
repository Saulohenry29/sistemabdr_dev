/* =========================================================
   BDR OFFLINE SYNC - AUTO OFFLINE / ONLINE V4 TOP
   Plano A: Supabase rápido
   Plano B: IndexedDB imediato
   Extra: reconstrói cache quando o navegador foi limpo
========================================================= */
(function(){
  "use strict";

  const SUPABASE_TEST_URL = "https://ytalegphxrntlomkltbc.supabase.co/rest/v1/usuarios_sistema?select=id&limit=1";
  const SUPABASE_KEY = "sb_publishable_VXvPi5TQMiPyOxknM5Fw_g_0NHwZYss";
  const MODO_OFFLINE_KEY = "BDR_MODO_OFFLINE";
  const MODO_OFFLINE_ORIGEM_KEY = "BDR_MODO_OFFLINE_ORIGEM";

  let ultimaChecagem = 0;
  let ultimoOnlineReal = false;
  let reconstruindoCache = false;

  function banco(){
    return window.client || window.supabaseClient || window.clientSupabase || globalThis.client;
  }

  function offlineDB(){
    if(!window.BDROfflineDB){
      throw new Error("BDROfflineDB não carregado. Confira a ordem dos scripts.");
    }
    return window.BDROfflineDB;
  }

  function modoOfflineForcado(){
    return localStorage.getItem(MODO_OFFLINE_KEY) === "SIM";
  }

  function origemOffline(){
    return localStorage.getItem(MODO_OFFLINE_ORIGEM_KEY) || "AUTO";
  }

  function ativarOfflineAuto(motivo="falha_conexao"){
    if(localStorage.getItem(MODO_OFFLINE_KEY) !== "SIM"){
      console.warn("BDR: ativando modo offline automático:", motivo);
    }
    localStorage.setItem(MODO_OFFLINE_KEY, "SIM");
    localStorage.setItem(MODO_OFFLINE_ORIGEM_KEY, "AUTO");
  }

  function ativarOfflineManual(){
    localStorage.setItem(MODO_OFFLINE_KEY, "SIM");
    localStorage.setItem(MODO_OFFLINE_ORIGEM_KEY, "MANUAL");
    atualizarStatusTela();
  }

  function desativarOfflineAuto(){
    if(localStorage.getItem(MODO_OFFLINE_KEY) === "SIM"){
      console.log("BDR: internet real disponível. Saindo do modo offline.");
      localStorage.removeItem(MODO_OFFLINE_KEY);
      localStorage.removeItem(MODO_OFFLINE_ORIGEM_KEY);
    }
  }

  function comTimeout(promise, ms = 1200){
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Tempo esgotado ao buscar no servidor.")), ms);
      Promise.resolve(promise)
        .then(v => { clearTimeout(timer); resolve(v); })
        .catch(e => { clearTimeout(timer); reject(e); });
    });
  }

  async function testarSupabaseRapido(ms=1200){
    if(navigator.onLine === false) return false;

    try{
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);

      const resp = await fetch(SUPABASE_TEST_URL, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + SUPABASE_KEY
        }
      });

      clearTimeout(timer);

      // Qualquer resposta menor que 500 prova que há conexão real com o Supabase.
      return resp && resp.status > 0 && resp.status < 500;
    }catch(e){
      return false;
    }
  }

  async function estaOnlineReal({forcar=false} = {}){
    const agora = Date.now();

    // Offline manual/aut automático: só ignora quando não for uma checagem forçada.
    if(modoOfflineForcado() && !forcar){
      return false;
    }

    if(!forcar && (agora - ultimaChecagem) < 3000){
      return ultimoOnlineReal;
    }

    ultimaChecagem = agora;
    ultimoOnlineReal = await testarSupabaseRapido(1200);

    if(!ultimoOnlineReal){
      ativarOfflineAuto("teste_supabase_falhou");
      return false;
    }

    // Se voltou internet real, limpa o offline automático/manual.
    desativarOfflineAuto();
    return true;
  }

  async function lerLocal(tabela){
    const local = await offlineDB().lerTabela(tabela);
    return Array.isArray(local) ? local : [];
  }

  async function carregarTabela(tabela, buscarOnline, opcoes = {}){
    const dbLocal = offlineDB();
    const timeout = opcoes.timeout || 1200;

    // Se estiver em modo offline, usa IndexedDB sem tentar Supabase.
    if(modoOfflineForcado()){
      const local = await lerLocal(tabela);

      // Se o cache foi apagado, tenta reconstruir automaticamente se houver internet real.
      if(local.length === 0){
        const voltou = await estaOnlineReal({forcar:true});
        if(voltou){
          console.warn(`BDR: cache vazio para ${tabela}. Tentando baixar do Supabase.`);
        }else{
          console.log(`BDR offline: ${tabela} carregado do IndexedDB (${local.length})`);
          return local;
        }
      }else{
        console.log(`BDR offline: ${tabela} carregado do IndexedDB (${local.length})`);
        return local;
      }
    }

    try{
      const onlineReal = await estaOnlineReal();
      if(!onlineReal) throw new Error("Offline real detectado");

      const resp = await comTimeout(buscarOnline(), timeout);
      if(resp?.error) throw resp.error;

      const dados = resp?.data || [];
      await dbLocal.salvarTabela(tabela, dados);
      console.log(`BDR online: ${tabela} atualizado no cache (${dados.length})`);
      return dados;

    }catch(e){
      ativarOfflineAuto(e?.message || "falha_carregar_tabela");
      const local = await lerLocal(tabela);
      console.warn(`BDR: ${tabela} usando IndexedDB (${local.length}). Motivo:`, e?.message || e);
      return local;
    }
  }

  async function salvarInsert(tabela, payload){
    const client = banco();
    const onlineReal = await estaOnlineReal();

    if(onlineReal && client){
      try{
        const { data, error } = await client.from(tabela).insert(payload).select();
        if(error) throw error;
        return { online:true, data };
      }catch(e){
        ativarOfflineAuto(e?.message || "insert_falhou");
        console.warn("BDR: insert online falhou. Salvando na fila.", e?.message || e);
      }
    }

    const pendente = await offlineDB().adicionarPendente({ tabela, acao:"insert", payload });
    atualizarStatusTela();
    return { online:false, pendente };
  }

  async function salvarUpdate(tabela, match, payload){
    const client = banco();
    const onlineReal = await estaOnlineReal();

    if(onlineReal && client){
      try{
        let query = client.from(tabela).update(payload);
        Object.entries(match || {}).forEach(([campo, valor]) => {
          query = query.eq(campo, valor);
        });

        const { data, error } = await query.select();
        if(error) throw error;
        return { online:true, data };
      }catch(e){
        ativarOfflineAuto(e?.message || "update_falhou");
        console.warn("BDR: update online falhou. Salvando na fila.", e?.message || e);
      }
    }

    const pendente = await offlineDB().adicionarPendente({ tabela, acao:"update", match, payload });
    atualizarStatusTela();
    return { online:false, pendente };
  }


  function normalizarTexto(txt){
    return String(txt || "").trim().toUpperCase();
  }

  function agoraLocalBDR(){
    return new Date(Date.now() - 4 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
  }

  async function buscarObraPorId(client, obraId){
    if(!obraId) return null;
    const { data, error } = await client
      .from("obras")
      .select("*")
      .eq("id", obraId)
      .maybeSingle();

    if(error) throw error;
    return data || null;
  }

  async function gerarCodigoPatrimonioOfflineSync(client, obra){
    const codigoObra = obra?.codigo_obra || obra?.codigo || "";
    const prefixo = "PAT-" + codigoObra;

    const { data, error } = await client
      .from("patrimonio")
      .select("codigo_qr")
      .like("codigo_qr", prefixo + "%")
      .order("codigo_qr", { ascending:false })
      .limit(1);

    if(error) throw error;

    let sequencial = 1;
    if(data && data.length && data[0]?.codigo_qr){
      const ultimo = String(data[0].codigo_qr || "");
      const numeroFinal = ultimo.replace(prefixo, "").replace(/\D/g, "");
      sequencial = (Number(numeroFinal) || 0) + 1;
    }

    return {
      sequencial,
      codigo_qr: prefixo + String(sequencial).padStart(4, "0")
    };
  }

  async function criarPatrimonioOfflineSync(client, payload){
    const item = payload.item || {};
    const obra = await buscarObraPorId(client, payload.obraDestino);

    if(!obra){
      throw new Error("Não foi possível localizar a obra para criar patrimônio offline.");
    }

    const gerado = await gerarCodigoPatrimonioOfflineSync(client, obra);
    const usuarioNome = payload.usuario || "Usuário não identificado";
    const obs = payload.obs || "Criado pela sincronização offline da triagem";

    const { data, error } = await client
      .from("patrimonio")
      .insert([{
        nome_bem: item.descricao_xml || item.descricao || "Item triado como patrimônio",
        tipo_item: "EQUIPAMENTO",
        empresa_id: obra.empresa_id ? Number(obra.empresa_id) : null,
        obra_id: obra.id ? Number(obra.id) : null,
        localizacao: obra.nome || payload.obraNome || null,
        sequencial: Number(gerado.sequencial),
        codigo_qr: gerado.codigo_qr,
        status: "ESTOQUE",
        valor_bem: Number(item.valor_unitario || item.valor_total || 0),
        estado_conservacao: item.estado_material || "NOVO",
        observacao: obs,
        origem_cadastro: "TRIAGEM_OFFLINE",
        usuario_cadastro: usuarioNome
      }])
      .select()
      .single();

    if(error) throw error;

    try{
      await client.from("movimentacoes").insert([{
        patrimonio_id: data.id,
        empresa_id: data.empresa_id || null,
        obra_origem_id: data.obra_id || null,
        obra_destino_id: data.obra_id || null,
        tipo: "CADASTRO_TRIAGEM_OFFLINE",
        status_anterior: null,
        status_novo: "ESTOQUE",
        observacao: obs,
        usuario: usuarioNome,
        data_movimentacao: agoraLocalBDR()
      }]);
    }catch(e){
      console.warn("BDR offline sync: patrimônio criado, mas movimentação falhou:", e?.message || e);
    }

    return data;
  }

  async function verificarEntradaFinalizadaOfflineSync(client, entradaId){
    if(!entradaId) return;

    const { data, error } = await client
      .from("entradas_materiais_itens")
      .select("id")
      .eq("entrada_id", entradaId)
      .eq("status_triagem", "PENDENTE");

    if(error) throw error;

    if(!data || data.length === 0){
      const { error:updateError } = await client
        .from("entradas_materiais")
        .update({ status:"TRIADO" })
        .eq("id", entradaId);

      if(updateError) throw updateError;
    }
  }

  async function sincronizarTriagemConfirmarItem(client, pendente){
    const payload = pendente.payload || pendente.dados || {};
    const item = payload.item || {};

    if(!item?.id){
      throw new Error("Pendente de triagem sem item.id.");
    }

    const destino = payload.destino || "ESTOQUE";
    const obraDestino = payload.obraDestino || null;
    const endereco = payload.endereco || null;
    const obs = payload.obs || null;
    const usuarioNome = payload.usuario || "Usuário não identificado";

    let patrimonio = null;
    let codigo = "EST-" + Date.now() + "-" + item.id;
    let tipoControle = destino === "PATRIMONIO" ? "PATRIMONIO" : "CONSUMO";
    let empresaId = payload.empresa_id || null;
    let obraIdFinal = obraDestino || null;

    if(destino === "PATRIMONIO"){
      patrimonio = await criarPatrimonioOfflineSync(client, payload);
      codigo = patrimonio.codigo_qr || codigo;
      empresaId = patrimonio.empresa_id || empresaId;
      obraIdFinal = patrimonio.obra_id || obraIdFinal;
    }

    if(destino === "ESTOQUE" || destino === "OBRA" || destino === "PATRIMONIO"){
      const { data: produto, error: produtoError } = await client
        .from("estoque_produtos")
        .insert([{
          codigo,
          descricao: item.descricao_xml || item.descricao || "Item sem descrição",
          unidade: "UN",
          tipo_controle: tipoControle,
          estado_material: item.estado_material || "NOVO",
          quantidade: Number(item.quantidade || 0),
          valor_unitario: Number(item.valor_unitario || 0),
          patrimonio_id: patrimonio?.id || null,
          empresa_id: empresaId || null,
          obra_id: obraIdFinal || null,
          status: destino === "OBRA" ? "EM_USO" : "DISPONIVEL",
          usuario_cadastro: usuarioNome,
          rua: endereco?.rua || null,
          prateleira: endereco?.prateleira || null,
          coluna: endereco?.coluna || null,
          nivel: endereco?.nivel || null,
          caixa: endereco?.caixa || null,
          localizacao_fisica: endereco?.codigo_curto || null,
          observacao: destino === "PATRIMONIO"
            ? `Patrimônio ${codigo} criado/vinculado pela triagem offline. ${obs || ""}`
            : (obs || null)
        }])
        .select()
        .single();

      if(produtoError) throw produtoError;

      const { error: movError } = await client
        .from("estoque_movimentacoes")
        .insert([{
          produto_id: produto.id,
          tipo_movimentacao: destino === "OBRA" ? "SAIDA_DIRETA_OBRA" : "ENTRADA",
          quantidade: Number(item.quantidade || 0),
          origem: "TRIAGEM_OFFLINE",
          destino: destino === "OBRA" ? "OBRA " + obraDestino : (endereco?.codigo_curto || "CD"),
          usuario: usuarioNome,
          observacao: obs
        }]);

      if(movError) throw movError;
    }

    const sugestaoPat = destino === "PATRIMONIO";

    const { error: triagemError } = await client
      .from("triagem_materiais")
      .insert([{
        descricao: item.descricao_xml || item.descricao || "Item sem descrição",
        quantidade: Number(item.quantidade || 0),
        valor_unitario: Number(item.valor_unitario || 0),
        categoria: null,
        bem_duravel: sugestaoPat,
        sugestao_patrimonio: sugestaoPat,
        destino,
        obra_destino_id: obraDestino || null,
        status: "CONCLUIDO",
        usuario_triagem: usuarioNome,
        observacao: obs || (endereco ? "Endereço: " + endereco.codigo_curto : "Sincronizado offline")
      }]);

    if(triagemError) throw triagemError;

    const { error: itemError } = await client
      .from("entradas_materiais_itens")
      .update({ status_triagem:"TRIADO" })
      .eq("id", item.id);

    if(itemError) throw itemError;

    await verificarEntradaFinalizadaOfflineSync(client, item.entrada_id);

    if(endereco?.id && destino !== "OBRA"){
      const { error:endError } = await client
        .from("enderecamento_estoque")
        .update({ status:"OCUPADO" })
        .eq("id", endereco.id);

      if(endError) throw endError;
    }

    try{
      const statusKey = "bdr_triagem_status_offline_v1";
      const raw = localStorage.getItem(statusKey);
      const status = raw ? JSON.parse(raw) : {};
      delete status[String(item.id)];
      localStorage.setItem(statusKey, JSON.stringify(status));
    }catch(e){}

    window.dispatchEvent(new CustomEvent("bdrOfflineSincronizado", {
      detail:{
        tipo:"triagem_confirmar_item",
        tabela:pendente.tabela,
        dados:payload,
        pendente_id:pendente.id
      }
    }));

    return true;
  }

  async function sincronizarCustom(client, item){
    const tipo = item.tipo || item.payload?.tipo || item.tabela;

    // Compatibilidade com pendências antigas:
    // o offlineDB antigo não salvava o campo "tipo", então a triagem ficou apenas como tabela="triagem_materiais".
    if(
      tipo === "triagem_confirmar_item" ||
      item.tabela === "triagem_materiais" ||
      item.payload?.item ||
      item.payload?.destino
    ){
      return await sincronizarTriagemConfirmarItem(client, item);
    }

    throw new Error("Pendente custom sem rotina específica: " + (tipo || item.tabela || "desconhecido"));
  }


  async function sincronizarPendentes(){
    const onlineReal = await estaOnlineReal({forcar:true});
    if(!onlineReal) return { ok:false, motivo:"offline_real" };

    const client = banco();
    if(!client) return { ok:false, motivo:"supabase_indisponivel" };

    const pendentes = await offlineDB().listarPendentes();
    let enviados = 0;
    let falhas = 0;

    for(const item of pendentes){
      try{
        await offlineDB().atualizarPendente(item.id, {
          tentativas: Number(item.tentativas || 0) + 1,
          erro: null
        });

        if(item.acao === "custom"){
          await sincronizarCustom(client, item);
          await offlineDB().removerPendente(item.id);
          enviados++;
          continue;
        }

        if(item.acao === "insert"){
          const { error } = await client.from(item.tabela).insert(item.payload);
          if(error) throw error;
        }else if(item.acao === "update"){
          let query = client.from(item.tabela).update(item.payload);
          Object.entries(item.match || {}).forEach(([campo, valor]) => {
            query = query.eq(campo, valor);
          });

          const { error } = await query;
          if(error) throw error;
        }else{
          throw new Error("Ação offline não suportada: " + item.acao);
        }

        await offlineDB().removerPendente(item.id);
        enviados++;
      }catch(e){
        falhas++;
        await offlineDB().atualizarPendente(item.id, { erro:e?.message || String(e) });
        console.warn("BDR: falha ao sincronizar pendente", item, e);
      }
    }

    atualizarStatusTela();
    return { ok: falhas === 0, enviados, falhas };
  }

  async function contarPendentes(){
    const pendentes = await offlineDB().listarPendentes();
    return pendentes.length;
  }

  async function reconstruirCache(){
    if(reconstruindoCache) return { ok:false, motivo:"ja_em_andamento" };
    reconstruindoCache = true;

    try{
      const client = banco();
      if(!client) throw new Error("Supabase indisponível");

      const ok = await estaOnlineReal({forcar:true});
      if(!ok) throw new Error("Sem internet real para reconstruir cache");

      const tarefas = [
        ["obras", () => client.from("obras").select("*").eq("ativa", true).order("nome")],
        ["estoque_produtos", () => client.from("estoque_produtos").select("*").order("id", { ascending:false })],
        ["patrimonio", () => client.from("patrimonio").select("*").order("id", { ascending:false })],
        ["estoque_movimentacoes", () => client.from("estoque_movimentacoes").select("*").order("id", { ascending:false }).limit(300)],
        ["movimentacoes", () => client.from("movimentacoes").select("*").order("id", { ascending:false }).limit(300)],
        ["entradas_materiais", () => client.from("entradas_materiais").select("*").eq("status", "ENVIADO_TRIAGEM").order("id", { ascending:false })],
        ["entradas_materiais_itens", () => client.from("entradas_materiais_itens").select("*").eq("status_triagem", "PENDENTE").order("id", { ascending:false })],
        ["enderecamento_estoque", () => client.from("enderecamento_estoque").select("*").eq("status", "LIVRE").order("codigo_curto")]
      ];

      const resultado = [];

      for(const [tabela, fn] of tarefas){
        try{
          const resp = await comTimeout(fn(), 5000);
          if(resp?.error) throw resp.error;
          const dados = resp?.data || [];
          await offlineDB().salvarTabela(tabela, dados);
          resultado.push({ tabela, ok:true, total:dados.length });
          console.log(`BDR cache reconstruído: ${tabela} (${dados.length})`);
        }catch(e){
          resultado.push({ tabela, ok:false, erro:e?.message || String(e) });
          console.warn(`BDR: falha ao reconstruir cache de ${tabela}:`, e?.message || e);
        }
      }

      await atualizarStatusTela();
      window.dispatchEvent(new CustomEvent("bdrCacheReconstruido", { detail:resultado }));
      return { ok:true, resultado };
    }finally{
      reconstruindoCache = false;
    }
  }

  async function cacheEssencialVazio(){
    try{
      const produtos = await lerLocal("estoque_produtos");
      const patrimonio = await lerLocal("patrimonio");
      return produtos.length === 0 && patrimonio.length === 0;
    }catch(e){
      return true;
    }
  }

  async function atualizarStatusTela(){
    let el = document.getElementById("bdrOfflineStatus");

    if(!el){
      el = document.createElement("div");
      el.id = "bdrOfflineStatus";
      el.style.cssText = `
        position:fixed;
        left:14px;
        bottom:18px;
        z-index:999999;
        padding:6px 10px;
        border-radius:999px;
        font:700 11px Arial;
        background:#b45309;
        color:#fff;
        box-shadow:0 4px 10px rgba(0,0,0,.15);
        display:none;
        opacity:.92;
      `;
      document.body.appendChild(el);
    }

    let pendentes = 0;
    try{ pendentes = await contarPendentes(); }catch(e){}

    if(modoOfflineForcado()){
      el.style.display = "block";
      el.style.background = "#7c2d12";
      el.textContent = pendentes > 0
        ? `Offline • ${pendentes} pendência(s)`
        : "Offline • usando dados salvos";
      return;
    }

    if(pendentes > 0){
      el.style.display = "block";
      el.style.background = "#1d4ed8";
      el.textContent = `${pendentes} pendência(s) aguardando sincronização`;
      return;
    }

    el.style.display = "none";
  }

  async function tentarVoltarOnline(){
    const ok = await estaOnlineReal({forcar:true});
    if(ok){
      await sincronizarPendentes();

      if(await cacheEssencialVazio()){
        await reconstruirCache();
      }

      await atualizarStatusTela();
      window.dispatchEvent(new CustomEvent("bdrOnlineRealVoltou"));
    }else{
      await atualizarStatusTela();
    }
  }

  window.addEventListener("online", tentarVoltarOnline);
  window.addEventListener("offline", () => {
    ativarOfflineAuto("evento_offline_navegador");
    atualizarStatusTela();
  });

  document.addEventListener("DOMContentLoaded", async () => {
    await atualizarStatusTela();

    // Se o usuário limpou o navegador e está online, reconstrói o cache em segundo plano.
    try{
      if(await estaOnlineReal({forcar:true}) && await cacheEssencialVazio()){
        await reconstruirCache();
      }
    }catch(e){}
  });

  setInterval(() => {
    if(modoOfflineForcado()){
      tentarVoltarOnline();
    }
  }, 15000);

  window.BDROfflineSync = {
    carregarTabela,
    salvarInsert,
    salvarUpdate,
    sincronizarPendentes,
    contarPendentes,
    atualizarStatusTela,
    comTimeout,
    estaOnlineReal,
    tentarVoltarOnline,
    ativarOfflineAuto,
    ativarOfflineManual,
    desativarOfflineAuto,
    reconstruirCache,
    cacheEssencialVazio
  };

  window.bdrSalvarInsert = salvarInsert;
  window.bdrSalvarUpdate = salvarUpdate;
  window.estaOnlineReal = estaOnlineReal;
  window.bdrAtivarOffline = ativarOfflineManual;
  window.bdrVoltarOnline = tentarVoltarOnline;
  window.bdrReconstruirCache = reconstruirCache;

  console.log("✔ BDR OFFLINE SYNC AUTO V5.1 TRIAGEM carregado");
})();
