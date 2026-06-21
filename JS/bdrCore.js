// ===============================
// BDR CORE 9.0 - ERP COMPLETO SAFE OFFLINE
// ===============================

const SUPABASE_URL = "https://ytalegphxrntlomkltbc.supabase.co";
const SUPABASE_KEY = "sb_publishable_VXvPi5TQMiPyOxknM5Fw_g_0NHwZYss";

if (!window.client && window.supabase && window.supabase.createClient) {
  window.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  window.supabaseClient = window.client;
}

console.log("✔ BDR CORE 9.0 carregado");

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
  if (!window.client) {
    throw new Error("Supabase indisponível. Sem internet ou SDK não carregado.");
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

async function salvarPatrimonio(dados) {
  try {
    if (!window.client) throw new Error("Supabase indisponível. Sem internet ou SDK não carregado.");

    const codigo = await gerarCodigoPatrimonio(dados.empresa_id);

    const { error } = await window.client
      .from("patrimonio")
      .insert([{
        nome_bem: dados.nome_bem,
        empresa_id: dados.empresa_id,
        setor_obra: dados.setor_obra,
        codigo_qr: codigo,
        status: "ESTOQUE",
        created_at: new Date().toISOString()
      }]);

    if (error) {
      console.error(error);
      alert("Erro ao salvar patrimônio");
      return;
    }

    alert("✔ Patrimônio criado: " + codigo);

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
    if (!window.client) throw new Error("Supabase indisponível. Sem internet ou SDK não carregado.");

    if (!codigo_qr) {
      alert("Código QR inválido");
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
