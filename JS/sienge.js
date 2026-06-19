/* =========================================================
   BDR ERP - SIENGE
   Arquivo: JS/sienge.js
========================================================= */

let tipoAtual = "COR";
let codigosSienge = [];

const TIPOS_SIENGE = [
  { id:"COR", nome:"🎨 Cor" },
  { id:"MARCA", nome:"🏷️ Marca" },
  { id:"MODELO", nome:"🧩 Modelo" },
  { id:"INSUMO", nome:"📦 Insumo" },
  { id:"ESTADO_CONSERVACAO", nome:"🛠️ Estado" },
  { id:"SETOR_OBRA_SIENGE", nome:"🏗️ Setor/Obra" },
  { id:"COMBUSTIVEL", nome:"⛽ Combustível" }
];

function ir(pagina){ window.location.href = pagina; }
function db(){ return window.client || window.supabaseClient || null; }
function usuarioAtual(){ try{ const u = localStorage.getItem("usuario_logado"); return u ? JSON.parse(u) : null; }catch(e){ return null; } }
function campo(id){
  const el = document.getElementById(id);
  return el ? String(el.value || "").trim() : "";
}

function normalizarTexto(txt){
  return String(txt || "").trim().replace(/\s+/g, " ").toUpperCase();
}
function normalizarTabelaRef(valor){
  const v = String(valor || "").trim().replace(".0", "");
  if(v === "2") return "2";
  if(v === "3") return "3";
  return "3";
}

function pareceCabecalho(codigo, descricao, tabela){
  const c = normalizarTexto(codigo);
  const d = normalizarTexto(descricao);
  const t = normalizarTexto(tabela);

  return (
    c === "CODIGO" ||
    c === "CÓDIGO" ||
    c.includes("CODIGO SIENGE") ||
    c.includes("CÓDIGO SIENGE") ||
    d.includes("DESCRICAO") ||
    d.includes("DESCRIÇÃO") ||
    t === "TABELA"
  );
}
window.onload = async () => {
  const u = usuarioAtual();
  if(document.getElementById("usuarioNome")) document.getElementById("usuarioNome").innerText = u ? "Olá, " + (u.nome || u.usuario || "usuário") : "Olá, usuário";
  if(document.getElementById("usuarioPerfil")) document.getElementById("usuarioPerfil").innerText = u ? (u.perfil || "-") : "-";
  montarAbasTipos();
  selecionarTipoSienge("COR");
};

function montarAbasTipos(){
  const box = document.getElementById("abasTipos");
  if(!box) return;
  box.innerHTML = TIPOS_SIENGE.map(t => `<button class="sienge-tab ${t.id === tipoAtual ? "active" : ""}" onclick="selecionarTipoSienge('${t.id}')">${t.nome}</button>`).join("");
}

async function selecionarTipoSienge(tipo){
  tipoAtual = tipo;
  montarAbasTipos();
  document.getElementById("tipo_atual").value = tipoAtual;
  document.getElementById("tipoImportacao").innerText = tipoAtual;
  const tipoNome = TIPOS_SIENGE.find(t => t.id === tipoAtual)?.nome || tipoAtual;
  document.getElementById("tituloCadastro").innerText = "➕ Cadastrar " + tipoNome;
  document.getElementById("tituloLista").innerText = "Lista de " + tipoNome;
  document.getElementById("tabela_ref").value = tipoAtual === "INSUMO" ? "3" : "PADRAO";
  limparFormularioSienge(false);
  await carregarCodigosSienge();
}

async function carregarCodigosSienge(){
  const banco = db();
  if(!banco){ alert("Supabase não carregado."); return; }

  const { data, error } = await banco
    .from("sienge_codigos")
    .select("*")
    .eq("tipo", tipoAtual)
    .order("descricao", { ascending:true });

  if(error){ console.error(error); alert("Erro ao carregar códigos: " + error.message); return; }

  codigosSienge = data || [];
  renderizarCodigosSienge();
}

function renderizarCodigosSienge(){
  const lista = document.getElementById("listaCodigosSienge");
  const busca = normalizarTexto(campo("buscaSienge"));
  const tabela = campo("filtroTabelaRef");
  if(!lista) return;

  let filtrados = codigosSienge.filter(c => {
    const texto = normalizarTexto(`${c.codigo} ${c.descricao} ${c.tabela_ref}`);
    return (!busca || texto.includes(busca)) && (!tabela || String(c.tabela_ref || "PADRAO") === tabela);
  });

  if(filtrados.length === 0){ lista.innerHTML = `<p>Nenhum código encontrado.</p>`; return; }

  lista.innerHTML = filtrados.map(c => `
    <div class="sienge-row">
      <div><small>Código</small><br><b>${c.codigo || "-"}</b></div>
      <div><small>Tabela</small><br>${c.tabela_ref || "PADRAO"}</div>
      <div><small>Descrição</small><br><strong>${c.descricao || "-"}</strong></div>
      <div><button class="btn-blue btn-small" onclick="editarCodigoSienge(${c.id})">Editar</button></div>
    </div>
  `).join("");
}

async function salvarCodigoSienge(){
  const banco = db();
  const id = campo("codigo_id");
  const tipo = tipoAtual;
  const tabela_ref = campo("tabela_ref") || "PADRAO";
  const codigo = campo("codigo_sienge");
  const descricao = campo("descricao_sienge");

  if(!codigo || !descricao){ alert("Informe código e descrição."); return; }

  const descricaoNormalizada = normalizarTexto(descricao);

  const duplicadoCodigo = codigosSienge.find(c => String(c.id) !== String(id) && String(c.tipo) === tipo && String(c.tabela_ref || "PADRAO") === tabela_ref && String(c.codigo).trim() === codigo);
  if(duplicadoCodigo){ alert("Já existe esse código para este tipo/tabela."); return; }

  const duplicadoDescricao = codigosSienge.find(c => String(c.id) !== String(id) && String(c.tipo) === tipo && String(c.tabela_ref || "PADRAO") === tabela_ref && normalizarTexto(c.descricao) === descricaoNormalizada);
  if(duplicadoDescricao){ alert("Já existe essa descrição para este tipo/tabela."); return; }

  const payload = { tipo, tabela_ref, codigo, descricao:descricao.trim(), ativo:true };

  const resp = id
    ? await banco.from("sienge_codigos").update(payload).eq("id", id)
    : await banco.from("sienge_codigos").insert([payload]);

  if(resp.error){
    console.error(resp.error);
    alert(String(resp.error.message || "").includes("duplicate") ? "Duplicado bloqueado pelo banco. Confira código/descrição." : "Erro ao salvar: " + resp.error.message);
    return;
  }

  alert(id ? "Código atualizado!" : "Código cadastrado!");
  limparFormularioSienge();
  await carregarCodigosSienge();
}

function editarCodigoSienge(id){
  const c = codigosSienge.find(x => Number(x.id) === Number(id));
  if(!c) return;
  document.getElementById("codigo_id").value = c.id;
  document.getElementById("tabela_ref").value = c.tabela_ref || "PADRAO";
  document.getElementById("codigo_sienge").value = c.codigo || "";
  document.getElementById("descricao_sienge").value = c.descricao || "";
  window.scrollTo({ top:0, behavior:"smooth" });
}

function limparFormularioSienge(limparTabela=true){
  document.getElementById("codigo_id").value = "";
  document.getElementById("codigo_sienge").value = "";
  document.getElementById("descricao_sienge").value = "";
  if(limparTabela) document.getElementById("tabela_ref").value = tipoAtual === "INSUMO" ? "3" : "PADRAO";
}

async function importarArquivoSienge(){
  const input = document.getElementById("arquivoImportacao");
  const arquivo = input.files?.[0];

  if(!arquivo){
    alert("Selecione um arquivo.");
    return;
  }

  const nome = arquivo.name.toLowerCase();

  if(nome.endsWith(".csv") || nome.endsWith(".txt")){
    const texto = await arquivo.text();
    const linhas = texto.split(/\r?\n/).filter(l => l.trim());

    const registros = linhas.map(linha => {
      const sep = linha.includes(";") ? ";" : ",";
      const partes = linha.split(sep);

      if(tipoAtual === "INSUMO"){
        return {
          codigo:String(partes[0] || "").trim(),
          descricao:String(partes[1] || "").trim(),
          tabela_ref:String(partes[2] || "3").trim()
        };
      }

      return {
        codigo:String(partes[0] || "").trim(),
        descricao:String(partes[1] || "").trim(),
        tabela_ref:"PADRAO"
      };
    });

    await importarRegistros(registros);
    return;
  }

  if(nome.endsWith(".xlsx") || nome.endsWith(".xls")){
    const buffer = await arquivo.arrayBuffer();
    const workbook = XLSX.read(buffer, { type:"array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(sheet, { header:1, defval:"" });

    const registros = linhas.map(l => {
      if(tipoAtual === "INSUMO"){
        return {
          codigo:String(l[0] || "").trim(),
          descricao:String(l[1] || "").trim(),
          tabela_ref:String(l[2] || "3").trim()
        };
      }

      return {
        codigo:String(l[0] || "").trim(),
        descricao:String(l[1] || "").trim(),
        tabela_ref:"PADRAO"
      };
    });

    await importarRegistros(registros);
    return;
  }

  alert("Formato não suportado. Use CSV, TXT, XLS ou XLSX.");
}

async function importarRegistros(registros){
  const banco = db();

  let validos = registros
    .map(r => ({
      tipo: tipoAtual,
      tabela_ref: tipoAtual === "INSUMO" ? normalizarTabelaRef(r.tabela_ref) : "PADRAO",
      codigo: String(r.codigo || "").trim(),
      descricao: String(r.descricao || "").trim(),
      ativo: true
    }))
    .filter(r => r.codigo && r.descricao)
    .filter(r => !pareceCabecalho(r.codigo, r.descricao, r.tabela_ref));

  if(validos.length === 0){
    alert("Nenhum registro válido encontrado.");
    return;
  }

  const { data: existentes, error } = await banco
    .from("sienge_codigos")
    .select("*")
    .eq("tipo", tipoAtual);

  if(error){
    alert("Erro ao validar duplicados: " + error.message);
    return;
  }

  const chaves = new Set();

  (existentes || []).forEach(x => {
    const tabela = tipoAtual === "INSUMO"
      ? normalizarTabelaRef(x.tabela_ref)
      : "PADRAO";

    chaves.add(`${x.tipo}|${tabela}|COD|${String(x.codigo || "").trim()}`);
    chaves.add(`${x.tipo}|${tabela}|DESC|${normalizarTexto(x.descricao)}`);
  });

  const limpos = [];
  let ignorados = 0;

  validos.forEach(r => {
    const chaveCodigo = `${r.tipo}|${r.tabela_ref}|COD|${r.codigo}`;
    const chaveDesc = `${r.tipo}|${r.tabela_ref}|DESC|${normalizarTexto(r.descricao)}`;

    if(chaves.has(chaveCodigo) || chaves.has(chaveDesc)){
      ignorados++;
      return;
    }

    chaves.add(chaveCodigo);
    chaves.add(chaveDesc);
    limpos.push(r);
  });

  if(limpos.length === 0){
    alert("Nada importado. Todos os itens já existem ou estão duplicados.");
    return;
  }

  const ok = confirm(
    `Tipo: ${tipoAtual}\n\nImportar: ${limpos.length}\nIgnorados: ${ignorados}\n\nContinuar?`
  );

  if(!ok) return;

  const resp = await banco
    .from("sienge_codigos")
    .upsert(limpos, {
      onConflict: "tipo,tabela_ref,codigo",
      ignoreDuplicates: true
    });

  if(resp.error){
    alert("Erro ao importar: " + resp.error.message);
    return;
  }

  alert(`Importação concluída!\nImportados: ${limpos.length}\nIgnorados: ${ignorados}`);
  document.getElementById("arquivoImportacao").value = "";
  await carregarCodigosSienge();
}
document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){
    document.querySelectorAll(".modal-bg.ativo, .modal.ativo").forEach(m=>{
      m.classList.remove("ativo");
    });

    const modalDetalhe = document.getElementById("modalDetalhe");
    if(modalDetalhe) modalDetalhe.classList.remove("ativo");

    const dropdown = document.getElementById("dropdownUser");
    if(dropdown) dropdown.classList.remove("ativo");

    const notif = document.getElementById("notifDropdown");
    if(notif) notif.classList.remove("ativo");
  }
});