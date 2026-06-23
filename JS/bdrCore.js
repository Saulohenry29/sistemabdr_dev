// ===============================
// BDR CORE 9.1 - SAFE OFFLINE
// ===============================

const SUPABASE_URL = "https://ytalegphxrntlomkltbc.supabase.co";
const SUPABASE_KEY = "sb_publishable_VXvPi5TQMiPyOxknM5Fw_g_0NHwZYss";

function bdrOnline(){
  return navigator.onLine === true;
}

if (!window.client && window.supabase && window.supabase.createClient) {
  window.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: {
      params: { eventsPerSecond: 2 }
    }
  });
  window.supabaseClient = window.client;
}

console.log("✔ BDR CORE 9.1 carregado SAFE OFFLINE");

function formatarStatus(status) {
  const map = {
    ESTOQUE: "Estoque",
    OBRA: "Obra",
    MANUTENCAO: "Manutenção",
    EM_USO: "Em Uso",
    BAIXADO: "Baixado"
  };
  return map[status] || status;
}

async function gerarCodigoPatrimonio(empresa_id) {
  if (!bdrOnline() || !window.client) {
    const prefixo = empresa_id ? String(empresa_id) : "OFF";
    const temp = Date.now().toString().slice(-6);
    return `PAT-OFF-${prefixo}-${temp}`;
  }

  const { data: empresa } = await window.client
    .from("empresas")
    .select("codigo_empresa")
    .eq("id", empresa_id)
    .single();

  if (!empresa) throw new Error("Empresa não encontrada");

  const codigoEmpresa = empresa.codigo_empresa;

  const { data: ultimo } = await window.client
    .from("patrimonio")
    .select("codigo_qr")
    .eq("empresa_id", empresa_id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sequencial = 1;

  if (ultimo?.codigo_qr) {
    const numero = ultimo.codigo_qr.replace(/\D/g, "");
    const ultimoSeq = parseInt(numero.slice(-4)) || 0;
    sequencial = ultimoSeq + 1;
  }

  return `PAT${codigoEmpresa}${String(sequencial).padStart(4, "0")}`;
}

async function bdrSalvarOfflineOuOnline(tabela, payload){
  if(bdrOnline() && window.client){
    return await window.client.from(tabela).insert(Array.isArray(payload) ? payload : [payload]);
  }

  if(window.BDROfflineSync?.adicionarPendente){
    await window.BDROfflineSync.adicionarPendente({
      tipo:"insert",
      tabela,
      dados:payload,
      criado_em:new Date().toISOString()
    });
    return { data:null, error:null, offline:true };
  }

  const key = "bdr_fila_offline_simples";
  const fila = JSON.parse(localStorage.getItem(key) || "[]");
  fila.push({ tipo:"insert", tabela, dados:payload, criado_em:new Date().toISOString() });
  localStorage.setItem(key, JSON.stringify(fila));
  return { data:null, error:null, offline:true };
}

async function salvarPatrimonio(dados) {
  try {
    const codigo = await gerarCodigoPatrimonio(dados.empresa_id);

    const payload = {
      nome_bem: dados.nome_bem,
      empresa_id: dados.empresa_id,
      setor_obra: dados.setor_obra,
      codigo_qr: codigo,
      status: "ESTOQUE",
      created_at: new Date().toISOString()
    };

    const { error, offline } = await bdrSalvarOfflineOuOnline("patrimonio", payload);

    if (error) {
      console.error(error);
      alert("Erro ao salvar patrimônio");
      return;
    }

    alert(offline ? "📦 Patrimônio salvo offline. Será sincronizado quando a internet voltar." : "✔ Patrimônio criado: " + codigo);

  } catch (err) {
    console.error(err);
    alert("Erro inesperado ao gerar patrimônio: " + err.message);
  }
}

async function registrarMovimentacao({
  codigo_qr,
  novoStatus,
  novaLocalizacao = "CD",
  tipoEvento = "MOVIMENTACAO",
  observacao = ""
}) {
  try {
    if (!codigo_qr) {
      alert("Código QR inválido");
      return;
    }

    if(!bdrOnline() || !window.client){
      await bdrSalvarOfflineOuOnline("movimentacoes", {
        codigo_qr,
        status_novo: novoStatus,
        local_novo: novaLocalizacao,
        tipo: tipoEvento,
        observacao,
        criado_em:new Date().toISOString()
      });
      alert("📦 Movimentação salva offline. Será sincronizada quando a internet voltar.");
      return;
    }

    const { data: atual, error } = await window.client
      .from("patrimonio")
      .select("*")
      .eq("codigo_qr", codigo_qr)
      .single();

    if (error || !atual) {
      alert("Patrimônio não encontrado");
      return;
    }

    let criticidade = 1;
    if (novoStatus === "MANUTENCAO") criticidade = 3;
    if (novoStatus === "OBRA") criticidade = 2;
    if (novoStatus === "BAIXADO") criticidade = 3;

    await window.client.from("analytics_patrimonio").insert([{
      patrimonio_id: atual.id,
      empresa_id: atual.empresa_id,
      tipo_evento: tipoEvento,
      status_anterior: atual.status,
      status_novo: novoStatus,
      local_anterior: atual.localizacao,
      local_novo: novaLocalizacao,
      criticidade,
      observacao,
      created_at: new Date().toISOString()
    }]);

    await window.client
      .from("patrimonio")
      .update({ status: novoStatus, localizacao: novaLocalizacao })
      .eq("codigo_qr", codigo_qr);

    alert("✔ Movimentação registrada");
    setTimeout(() => location.reload(), 400);

  } catch (err) {
    console.error(err);
    alert("Erro inesperado: " + err.message);
  }
}
document.addEventListener("input", function(e){
  if(
    (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") &&
    !e.target.matches(
      "#usuario, #login, #senha, #formUsuario, #formEmail, #formSenha, [type='email'], [type='password'], [type='number']"
    )
  ){
    e.target.value = e.target.value.toUpperCase();
  }
});