// ===============================
// BDR CORE - CONEXÃO SUPABASE
// ===============================

const SUPABASE_URL = "https://ytalegphxrntlomkltbc.supabase.co";
const SUPABASE_KEY = "sb_publishable_VXvPi5TQMiPyOxknM5Fw_g_0NHwZYss";

// validação do SDK
if (!window.supabase) {
  console.error("❌ Supabase SDK não carregado");
}

// cliente global único (ERP SAFE)
window.client = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

console.log("✔ Supabase conectado (BDR CORE 9.0)");