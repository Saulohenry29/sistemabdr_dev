let produtos = [];

window.onload = async () => {
  document.getElementById("dataAtual").innerText =
    new Date().toLocaleDateString("pt-BR");

  document.getElementById("data_recebimento").value =
    new Date().toISOString().slice(0,10);

  await carregarEmpresas();
  await carregarProdutos();
  adicionarLinha();
};

function ir(pagina){
  window.location.href = pagina;
}

function db(){
  return window.client || window.supabaseClient || client;
}

function moeda(valor){
  return Number(valor || 0).toLocaleString("pt-BR", {
    style:"currency",
    currency:"BRL"
  });
}

function campo(id){
  return document.getElementById(id).value.trim();
}

/* EMPRESAS */
async function carregarEmpresas(){

  const { data, error } = await db()
    .from("empresas")
    .select("*")
    .order("nome");

  if(error){
    console.error(error);
    alert("Erro ao carregar empresas");
    return;
  }

  const select = document.getElementById("empresa");
  select.innerHTML = `<option value="">Selecione</option>`;

  (data || []).forEach(emp => {
    select.innerHTML += `
      <option value="${emp.id}">
        ${emp.codigo_empresa || "-"} - ${emp.nome || "-"}
      </option>
    `;
  });
}

/* PRODUTOS */
async function carregarProdutos(){

  const { data, error } = await db()
    .from("produtos")
    .select("*")
    .eq("ativo", true)
    .order("descricao");

  if(error){
    console.error(error);
    alert("Erro ao carregar produtos");
    return;
  }

  produtos = data || [];
}

/* XML NFE */
function lerXMLNFe(event){

  const arquivo = event.target.files[0];

  if(!arquivo){
    return;
  }

  const leitor = new FileReader();

  leitor.onload = function(e){

    const textoXML = e.target.result;
    const xml = new DOMParser().parseFromString(textoXML, "text/xml");

    const numeroNF = tag(xml, "nNF");
    const chave = pegarChave(xml);
    const fornecedor = tagDentro(xml, "emit", "xNome");

    document.getElementById("numero_nf").value = numeroNF;
    document.getElementById("chave_nfe").value = chave;
    document.getElementById("fornecedor").value = fornecedor;

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

    const codigoBarras =
      textoProduto(prod, "cEAN") ||
      textoProduto(prod, "cProd");

    const descricao = textoProduto(prod, "xProd");
    const qtd = Number(textoProduto(prod, "qCom") || 1);
    const valorUnit = Number(textoProduto(prod, "vUnCom") || 0);
    const total = Number(textoProduto(prod, "vProd") || (qtd * valorUnit));

    const produtoEncontrado = localizarProduto(codigoBarras, descricao);

    adicionarLinha({
      produto_id: produtoEncontrado ? produtoEncontrado.id : "",
      descricao_xml: descricao,
      quantidade: qtd,
      valor_unitario: valorUnit,
      total: total
    });
  }

  calcularTotalGeral();

  alert("XML carregado com sucesso! Itens adicionados automaticamente.");
}

function textoProduto(prod, tagNome){
  const el = prod.getElementsByTagName(tagNome)[0];
  return el ? el.textContent.trim() : "";
}

function textoFilho(pai, tag){
  const el = pai.querySelector(tag);
  return el ? el.textContent.trim() : "";
}

function localizarProduto(codigo, descricao){

  const cod = String(codigo || "").trim().toLowerCase();
  const desc = String(descricao || "").trim().toLowerCase();

  let produto = produtos.find(p =>
    String(p.codigo_barras || "").trim().toLowerCase() === cod
  );

  if(produto) return produto;

  produto = produtos.find(p =>
    String(p.codigo_produto || "").trim().toLowerCase() === cod
  );

  if(produto) return produto;

  produto = produtos.find(p =>
    desc.includes(String(p.descricao || "").trim().toLowerCase()) ||
    String(p.descricao || "").trim().toLowerCase().includes(desc)
  );

  return produto || null;
}

/* LINHAS */
function montarOptionsProduto(produtoIdSelecionado = ""){

  let options = `<option value="">Não vinculado</option>`;

  produtos.forEach(p => {
    const selected = String(p.id) === String(produtoIdSelecionado) ? "selected" : "";

    options += `
      <option value="${p.id}" ${selected}>
        ${p.codigo_produto || "-"} - ${p.descricao || "-"}
      </option>
    `;
  });

  return options;
}

function adicionarLinha(dados = {}){

  const tbody = document.getElementById("itensBody");
  const tr = document.createElement("tr");

  tr.innerHTML = `
    <td>
      <select class="produto">
        ${montarOptionsProduto(dados.produto_id || "")}
      </select>
    </td>

    <td>
      <input class="descricao_xml" value="${dados.descricao_xml || ""}" placeholder="Descrição do XML ou manual">
    </td>

    <td>
      <input type="number" class="quantidade" value="${dados.quantidade || 1}" min="0" step="0.01" oninput="calcularLinha(this)">
    </td>

    <td>
      <input type="number" class="valor" step="0.01" value="${dados.valor_unitario || 0}" oninput="calcularLinha(this)">
    </td>

    <td>
      <select class="estado">
        <option>NOVO</option>
        <option>USADO</option>
        <option>RETORNO_OBRA</option>
        <option>AVARIADO</option>
      </select>
    </td>

    <td>
      <input class="lote" placeholder="Lote">
    </td>

    <td>
      <input type="date" class="validade">
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

function removerLinha(btn){
  btn.closest("tr").remove();
  calcularTotalGeral();
}

function calcularLinha(el){

  const tr = el.closest("tr");

  const qtd = Number(tr.querySelector(".quantidade").value || 0);
  const valor = Number(tr.querySelector(".valor").value || 0);

  const total = qtd * valor;

  tr.querySelector(".totalLinha").innerText = moeda(total);

  calcularTotalGeral();
}

function calcularTotalGeral(){

  let total = 0;

  document.querySelectorAll("#itensBody tr").forEach(tr => {
    const qtd = Number(tr.querySelector(".quantidade").value || 0);
    const valor = Number(tr.querySelector(".valor").value || 0);
    total += qtd * valor;
  });

  document.getElementById("totalGeral").innerText =
    "Total NF: " + moeda(total);
}

/* SALVAR */
async function salvarEntrada(){

  try{

    const empresa_id = campo("empresa");
    const numero_nf = campo("numero_nf");
    const fornecedor = campo("fornecedor");
    const responsavel = campo("responsavel");
    const chave_nfe = campo("chave_nfe");
    const observacao = campo("observacao");

    if(!empresa_id){
      alert("Selecione a empresa.");
      return;
    }

    if(!numero_nf){
      alert("Informe o número da NF.");
      return;
    }

    const linhas = document.querySelectorAll("#itensBody tr");

    if(linhas.length === 0){
      alert("Adicione pelo menos um item.");
      return;
    }

    const { data: entrada, error } = await db()
      .from("entradas")
      .insert([{
        empresa_id,
        numero_nf,
        fornecedor,
        responsavel,
        chave_nfe,
        observacao,
        status: "AGUARDANDO_TRIAGEM"
      }])
      .select()
      .single();

    if(error) throw error;

    const itens = [];

    linhas.forEach(tr => {

      const quantidade = Number(tr.querySelector(".quantidade").value || 0);
      const valor_unitario = Number(tr.querySelector(".valor").value || 0);

      itens.push({
        entrada_id: entrada.id,
        produto_id: tr.querySelector(".produto").value || null,
        descricao_xml: tr.querySelector(".descricao_xml").value || null,
        quantidade,
        valor_unitario,
        valor_total: quantidade * valor_unitario,
        estado_produto: tr.querySelector(".estado").value,
        lote: tr.querySelector(".lote").value || null,
        validade: tr.querySelector(".validade").value || null,
        status: "AGUARDANDO_TRIAGEM"
      });
    });

    const { error: erroItens } = await db()
      .from("entrada_itens")
      .insert(itens);

    if(erroItens) throw erroItens;

    alert("Entrada salva e enviada para triagem!");
    location.href = "triagem.html";

  }catch(err){
    console.error(err);
    alert("Erro ao salvar entrada: " + err.message);
  }
}