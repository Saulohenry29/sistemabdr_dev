/* =========================================================
   BDR ERP - ENTRADA DE MATERIAIS
   Arquivo: JS/entrada.js

   MARCAÇÕES PARA ESTUDO:
   [01] Variáveis globais
   [02] Inicialização da tela
   [03] Funções auxiliares
   [04] Carregar empresas e produtos
   [05] Leitura XML NFe
   [06] Tabela de itens
   [07] Montar dados da entrada
   [08] Salvar entrada ONLINE/OFFLINE
   [09] Atalhos de tela
========================================================= */


/* =========================================================
   [01] VARIÁVEIS GLOBAIS
========================================================= */

let produtos = [];


/* =========================================================
   [02] INICIALIZAÇÃO DA TELA
========================================================= */

window.onload = async () => {
  const usuario = usuarioAtual();

  if(document.getElementById("dataAtual")){
    document.getElementById("dataAtual").innerText = new Date().toLocaleDateString("pt-BR");
  }

  if(document.getElementById("usuarioInfo")){
    document.getElementById("usuarioInfo").innerText = usuario ? "👤 " + usuario.nome : "";
  }

  if(document.getElementById("data_recebimento")){
    document.getElementById("data_recebimento").value = new Date().toISOString().slice(0,10);
  }

  if(usuario && document.getElementById("responsavel")){
    document.getElementById("responsavel").value = usuario.nome || "";
  }

  await carregarEmpresas();
  await carregarProdutos();
  adicionarLinha();
};


/* =========================================================
   [03] FUNÇÕES AUXILIARES
========================================================= */

function ir(pagina){
  window.location.href = pagina;
}

function db(){
  return window.client || window.supabaseClient || window.clientSupabase || client;
}

function usuarioAtual(){
  try{
    const u = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
    return u ? JSON.parse(u) : null;
  }catch(e){
    return null;
  }
}

function moeda(valor){
  return Number(valor || 0).toLocaleString("pt-BR", {
    style:"currency",
    currency:"BRL"
  });
}

function campo(id){
  const el = document.getElementById(id);
  return el ? String(el.value || "").trim() : "";
}

function hojeISO(){
  return new Date().toISOString();
}


/* =========================================================
   [04] CARREGAR EMPRESAS E PRODUTOS
========================================================= */

async function carregarEmpresas(){
  try{
    const { data, error } = await db()
      .from("empresas")
      .select("*")
      .order("nome");

    if(error){
      alert("Erro ao carregar empresas: " + error.message);
      return;
    }

    const select = document.getElementById("empresa");
    if(!select) return;

    select.innerHTML = '<option value="">Selecione</option>';

    (data || []).forEach(emp => {
      select.innerHTML += `
        <option value="${emp.id}">
          ${emp.codigo_empresa || "-"} - ${emp.nome || "-"}
        </option>
      `;
    });

  }catch(e){
    console.warn("Erro ao carregar empresas:", e);
  }
}

async function carregarProdutos(){
  try{
    const { data, error } = await db()
      .from("estoque_produtos")
      .select("*")
      .order("descricao");

    if(error){
      console.warn(error.message);
      produtos = [];
      return;
    }

    produtos = data || [];

  }catch(e){
    console.warn("Erro ao carregar produtos:", e);
    produtos = [];
  }
}


/* =========================================================
   [05] LEITURA XML NFE
========================================================= */

function lerXMLNFe(event){
  const arquivo = event.target.files[0];
  if(!arquivo) return;

  const leitor = new FileReader();

  leitor.onload = function(e){
    const xml = new DOMParser().parseFromString(e.target.result, "text/xml");

    document.getElementById("numero_nf").value = tag(xml, "nNF");
    document.getElementById("chave_nfe").value = pegarChave(xml);
    document.getElementById("fornecedor").value = tagDentro(xml, "emit", "xNome");

    carregarItensXML(xml);
  };

  leitor.readAsText(arquivo);
}

function tag(xml, nome){
  const el = xml.getElementsByTagName(nome)[0];
  return el ? el.textContent.trim() : "";
}

function tagDentro(xml, paiTag, filhoTag){
  const pai = xml.getElementsByTagName(paiTag)[0];
  if(!pai) return "";

  const filho = pai.getElementsByTagName(filhoTag)[0];
  return filho ? filho.textContent.trim() : "";
}

function pegarChave(xml){
  const infNFe = xml.getElementsByTagName("infNFe")[0];
  if(!infNFe) return "";

  return (infNFe.getAttribute("Id") || "").replace("NFe", "");
}

function carregarItensXML(xml){
  const tbody = document.getElementById("itensBody");
  tbody.innerHTML = "";

  const detalhes = xml.getElementsByTagName("det");

  if(detalhes.length === 0){
    alert("XML carregado, mas nenhum item foi encontrado.");
    return;
  }

  for(let i = 0; i < detalhes.length; i++){
    const prod = detalhes[i].getElementsByTagName("prod")[0];
    if(!prod) continue;

    const codigo = textoProduto(prod, "cEAN") || textoProduto(prod, "cProd");
    const descricao = textoProduto(prod, "xProd");
    const qtd = Number(textoProduto(prod, "qCom") || 1);
    const valorUnit = Number(textoProduto(prod, "vUnCom") || 0);
    const total = Number(textoProduto(prod, "vProd") || (qtd * valorUnit));

    const encontrado = localizarProduto(codigo, descricao);

    adicionarLinha({
      produto_id: encontrado ? encontrado.id : "",
      descricao_xml: descricao,
      quantidade: qtd,
      valor_unitario: valorUnit,
      total
    });
  }

  calcularTotalGeral();
  alert("XML carregado com sucesso!");
}

function textoProduto(prod, tagNome){
  const el = prod.getElementsByTagName(tagNome)[0];
  return el ? el.textContent.trim() : "";
}


/* =========================================================
   [06] TABELA DE ITENS
========================================================= */

function localizarProduto(codigo, descricao){
  const cod = String(codigo || "").trim().toLowerCase();
  const desc = String(descricao || "").trim().toLowerCase();

  let produto = produtos.find(p =>
    String(p.codigo || "").trim().toLowerCase() === cod
  );

  if(produto) return produto;

  produto = produtos.find(p =>
    String(p.descricao || "").trim().toLowerCase() === desc
  );

  if(produto) return produto;

  return produtos.find(p =>
    desc.includes(String(p.descricao || "").trim().toLowerCase()) ||
    String(p.descricao || "").trim().toLowerCase().includes(desc)
  ) || null;
}

function montarOptionsProduto(produtoIdSelecionado = ""){
  let options = '<option value="">Novo item / não vinculado</option>';

  produtos.forEach(p => {
    const selected = String(p.id) === String(produtoIdSelecionado) ? "selected" : "";

    options += `
      <option value="${p.id}" ${selected}>
        ${p.codigo || "-"} - ${p.descricao || "-"}
      </option>
    `;
  });

  return options;
}

function sugestaoControle(descricao, valorUnitario){
  const texto = String(descricao || "").toLowerCase();
  const valor = Number(valorUnitario || 0);

  const palavras = [
    "notebook",
    "computador",
    "impressora",
    "furadeira",
    "parafusadeira",
    "esmerilhadeira",
    "maquina",
    "máquina",
    "equipamento",
    "monitor",
    "tablet",
    "celular"
  ];

  const duravel = palavras.some(p => texto.includes(p));

  if(valor >= 1200 && duravel) return "⚠️ Sugerir patrimônio";
  if(duravel) return "🔎 Analisar patrimônio";

  return "📦 Estoque/consumo";
}

function adicionarLinha(dados = {}){
  const tbody = document.getElementById("itensBody");
  const tr = document.createElement("tr");

  const sugestao = sugestaoControle(
    dados.descricao_xml || "",
    dados.valor_unitario || 0
  );

  tr.innerHTML = `
    <td>
      <select class="produto">
        ${montarOptionsProduto(dados.produto_id || "")}
      </select>
    </td>

    <td>
      <input class="descricao_xml" value="${dados.descricao_xml || ""}" placeholder="Descrição do XML ou manual" oninput="atualizarSugestao(this)">
    </td>

    <td>
      <input type="number" class="quantidade" value="${dados.quantidade || 1}" min="0" step="0.01" oninput="calcularLinha(this)">
    </td>

    <td>
      <input type="number" class="valor" step="0.01" value="${dados.valor_unitario || 0}" oninput="calcularLinha(this); atualizarSugestao(this)">
    </td>

    <td>
      <select class="estado">
        <option value="NOVO">NOVO</option>
        <option value="USADO">USADO</option>
        <option value="REAPROVEITADO">REAPROVEITADO</option>
        <option value="RETORNO_DE_OBRA">RETORNO DE OBRA</option>
        <option value="AVARIADO">AVARIADO</option>
      </select>
    </td>

    <td>
      <input class="lote" placeholder="Lote">
    </td>

    <td>
      <input type="date" class="validade">
    </td>

    <td>
      <span class="badge sugestao">${sugestao}</span>
    </td>

    <td>
      <span class="totalLinha">${moeda(dados.total || 0)}</span>
    </td>

    <td>
      <button class="btn btn-danger" onclick="removerLinha(this)">❌</button>
    </td>
  `;

  tbody.appendChild(tr);
  calcularLinha(tr.querySelector(".quantidade"));
}

function atualizarSugestao(el){
  const tr = el.closest("tr");
  const desc = tr.querySelector(".descricao_xml").value || "";
  const valor = Number(tr.querySelector(".valor").value || 0);

  tr.querySelector(".sugestao").innerText = sugestaoControle(desc, valor);
}

function removerLinha(btn){
  btn.closest("tr").remove();
  calcularTotalGeral();
}

function calcularLinha(el){
  const tr = el.closest("tr");
  const qtd = Number(tr.querySelector(".quantidade").value || 0);
  const valor = Number(tr.querySelector(".valor").value || 0);

  tr.querySelector(".totalLinha").innerText = moeda(qtd * valor);

  atualizarSugestao(el);
  calcularTotalGeral();
}

function calcularTotalGeral(){
  let total = 0;

  document.querySelectorAll("#itensBody tr").forEach(tr => {
    const qtd = Number(tr.querySelector(".quantidade").value || 0);
    const valor = Number(tr.querySelector(".valor").value || 0);

    total += qtd * valor;
  });

  document.getElementById("totalGeral").innerText = "Total NF: " + moeda(total);
}


/* =========================================================
   [07] MONTAR DADOS DA ENTRADA
   Aqui apenas organizamos os dados da tela.
========================================================= */

function montarDadosEntrada(){
  const usuarioLogado = usuarioAtual();

  const entrada = {
    empresa_id: campo("empresa"),
    numero_nf: campo("numero_nf"),
    fornecedor: campo("fornecedor"),
    responsavel: campo("responsavel"),
    chave_nfe: campo("chave_nfe"),
    data_recebimento: campo("data_recebimento"),
    observacao: campo("observacao"),
    status: "ENVIADO_TRIAGEM",
    usuario_cadastro: usuarioLogado?.nome || "Usuário não identificado"
  };

  const itens = [];

  document.querySelectorAll("#itensBody tr").forEach(tr => {
    const quantidade = Number(tr.querySelector(".quantidade").value || 0);
    const valor_unitario = Number(tr.querySelector(".valor").value || 0);

    if(quantidade <= 0) return;

    itens.push({
      produto: tr.querySelector(".produto").value || null,
      descricao_xml: tr.querySelector(".descricao_xml").value || null,
      quantidade,
      valor_unitario,
      valor_total: quantidade * valor_unitario,
      estado_material: tr.querySelector(".estado").value,
      lote: tr.querySelector(".lote").value || null,
      validade: tr.querySelector(".validade").value || null,
      status_triagem: "PENDENTE"
    });
  });

  return { entrada, itens };
}

function validarDadosEntrada(entrada, itens){
  if(!entrada.empresa_id){
    alert("Selecione a empresa.");
    return false;
  }

  if(!entrada.numero_nf){
    alert("Informe o número da NF.");
    return false;
  }

  if(!itens.length){
    alert("Adicione pelo menos um item válido.");
    return false;
  }

  return true;
}


/* =========================================================
   [08] SALVAR ENTRADA ONLINE/OFFLINE
   Esse é o ponto principal da atualização.

   ONLINE:
   - Salva entrada em entradas_materiais.
   - Pega o ID gerado.
   - Salva itens em entradas_materiais_itens.

   OFFLINE:
   - Não dá para criar entrada_id real sem Supabase.
   - Então salvamos tudo junto na fila:
     tipo = entrada_completa
     tabela = entradas_materiais
     dados = { entrada, itens }

   Quando a internet voltar, o offlineQueue.js cria a entrada,
   pega o ID real e salva os itens com entrada_id correto.
========================================================= */

async function salvarEntrada(){
  try{
    const { entrada, itens } = montarDadosEntrada();

    if(!validarDadosEntrada(entrada, itens)) return;

    const botao = document.querySelector('[onclick="salvarEntrada()"]');
    if(botao){
      botao.disabled = true;
      botao.innerText = "⏳ Salvando...";
    }

    /* ===============================
       [08.1] MODO OFFLINE
    =============================== */
    if(typeof estaOnline === "function" && !estaOnline()){
      await salvarOffline("entrada_completa", "entradas_materiais", {
        entrada,
        itens,
        criado_offline_em: hojeISO()
      });

      alert("📦 Sem internet. Entrada salva no aparelho e será enviada para triagem quando a internet voltar.");

      limparEntradaDepoisSalvar();
      return;
    }

    /* ===============================
       [08.2] MODO ONLINE NORMAL
    =============================== */
    const { data: entradaSalva, error } = await db()
      .from("entradas_materiais")
      .insert([entrada])
      .select()
      .single();

    if(error) throw error;

    const itensComEntrada = itens.map(item => ({
      ...item,
      entrada_id: entradaSalva.id
    }));

    const { error: erroItens } = await db()
      .from("entradas_materiais_itens")
      .insert(itensComEntrada);

    if(erroItens) throw erroItens;

    alert("Entrada salva e enviada para triagem!");
    location.href = "triagem.html";

  }catch(err){
    console.error(err);
    alert("Erro ao salvar entrada: " + (err.message || err));

  }finally{
    const botao = document.querySelector('[onclick="salvarEntrada()"]');
    if(botao){
      botao.disabled = false;
      botao.innerText = "💾 Salvar entrada e enviar para triagem";
    }
  }
}

function limparEntradaDepoisSalvar(){
  document.getElementById("numero_nf").value = "";
  document.getElementById("fornecedor").value = "";
  document.getElementById("chave_nfe").value = "";
  document.getElementById("observacao").value = "";

  const tbody = document.getElementById("itensBody");
  tbody.innerHTML = "";
  adicionarLinha();
  calcularTotalGeral();
}


/* =========================================================
   [09] ATALHOS DE TELA
========================================================= */

document.addEventListener("keydown", function(e){
  if(e.key === "Escape"){
    document.querySelectorAll(".modal-bg.ativo, .modal.ativo").forEach(m => {
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
