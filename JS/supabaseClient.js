const supabaseUrl = "https://ytalegphxrntlomkltbc.supabase.co";

const supabaseKey = "sb_publishable_VXvPi5TQMiPyOxknM5Fw_g_0NHwZYss";

const client = supabase.createClient(
  supabaseUrl,
  supabaseKey
);

window.client = client;
window.supabaseClient = client;

console.log("SUPABASE OK");