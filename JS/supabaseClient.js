const supabaseUrl = "https://ytalegphxrntlomkltbc.supabase.co";
const supabaseKey = "sb_publishable_VXvPi5TQMiPyOxknM5Fw_g_0NHwZYss";

if(window.supabase && typeof window.supabase.createClient === "function"){
  const client = window.supabase.createClient(supabaseUrl, supabaseKey, {
    realtime: {
      params: { eventsPerSecond: 2 }
    }
  });
  window.client = client;
  window.supabaseClient = client;
  console.log("SUPABASE OK");
}else{
  window.client = window.client || null;
  window.supabaseClient = window.supabaseClient || null;
  console.warn("SUPABASE SDK indisponível. Rodando com cache/offline quando possível.");
}
