
let patrimonios = [];
let obras = [];
let empresas = [];
let siengeCodigos = [];
let siengeInsumos = [];
let movimentacoes = [];
let filtradosAtuais = [];
let paginaAtualRelatorio = 1;
const ITENS_POR_PAGINA_RELATORIO = 30;


/* =========================================================
   BDR RELATÓRIOS - PERMISSÕES NOVAS
   Regra: sem permissão = não aparece; função também bloqueia.
========================================================= */
function usuarioAtualRelatoriosBDR(){
  try{
    const raw = localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}

function listaPermissoesRelatoriosBDR(usuario = usuarioAtualRelatoriosBDR()){
  return String(usuario?.permissoes || "")
    .split(",")
    .map(p => String(p || "").trim().toUpperCase())
    .filter(Boolean);
}

function temPermissaoRelatoriosBDR(permissao, usuario = usuarioAtualRelatoriosBDR()){
  if(!usuario) return false;
  if(Number(usuario.id) === 1) return true;

  const perfil = String(usuario.perfil || "").toUpperCase();
  const ps = listaPermissoesRelatoriosBDR(usuario);

  if((perfil === "MASTER" || perfil === "ADMIN") && ps.length === 0) return true;

  permissao = String(permissao || "").toUpperCase();
  return ps.includes(permissao);
}

function exigirPermissaoRelatoriosBDR(permissao, mensagem){
  if(temPermissaoRelatoriosBDR(permissao)) return true;
  alert(mensagem || "Você não tem permissão para esta ação.");
  return false;
}

function aplicarPermissoesRelatoriosBDR(){
  document.querySelectorAll("[data-permissao]").forEach(el => {
    const permissao = el.getAttribute("data-permissao");
    const pode = temPermissaoRelatoriosBDR(permissao);
    el.hidden = !pode;
    el.style.display = pode ? "" : "none";
    el.dataset.bdrSemPermissao = pode ? "NAO" : "SIM";
  });

  if(!temPermissaoRelatoriosBDR("RELATORIOS_VER")){
    alert("Você não tem permissão para acessar relatórios.");
    location.href = "dashboard.html";
    return false;
  }

  return true;
}

document.addEventListener("DOMContentLoaded", () => {
  aplicarPermissoesRelatoriosBDR();
  setTimeout(aplicarPermissoesRelatoriosBDR, 400);
  setTimeout(aplicarPermissoesRelatoriosBDR, 1200);
});


function ir(pagina){
  window.location.href = pagina;
}

function db(){
  return window.client || window.supabaseClient;
}

function valor(id){
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function formatarData(data){
  if(!data) return "-";
  return new Date(data).toLocaleString("pt-BR");
}

function nomePatrimonio(id){
  const p = patrimonios.find(x => Number(x.id) === Number(id));
  return p ? `${p.nome_bem || "-"} | ${p.codigo_qr || "-"}` : "ID " + id;
}

async function carregarDados(){

  if(!aplicarPermissoesRelatoriosBDR()) return;

  if(!db()){
    alert("Supabase não carregado.");
    return;
  }

  async function carregarTodosPatrimoniosRelatorio(){
    const todos = [];
    const tamanhoPagina = 1000;
    let inicio = 0;

    while(true){
      const resposta = await db()
        .from("patrimonio")
        .select("*")
        .order("id", { ascending:false })
        .range(inicio, inicio + tamanhoPagina - 1);

      if(resposta.error) return { data:todos, error:resposta.error };

      const lote = Array.isArray(resposta.data) ? resposta.data : [];
      todos.push(...lote);

      if(lote.length < tamanhoPagina) break;
      inicio += tamanhoPagina;
    }

    return { data:todos, error:null };
  }

  const patResp = await carregarTodosPatrimoniosRelatorio();

  const obrasResp = await db()
    .from("obras")
    .select("*")
    .order("nome");

  const empresasResp = await db()
    .from("empresas")
    .select("*")
    .order("nome");

  const siengeResp = await db()
    .from("sienge_codigos")
    .select("*")
    .eq("ativo", true);

  const movResp = await db()
    .from("movimentacoes")
    .select("*")
    .order("id", { ascending:false })
    .limit(50);

  if(patResp.error){
    console.error(patResp.error);
    alert(patResp.error.message);
    return;
  }

  if(obrasResp.error){
    console.error(obrasResp.error);
  }

  if(empresasResp.error){
    console.warn("Não foi possível carregar empresas:", empresasResp.error.message);
  }

  if(siengeResp.error){
    console.warn("Não foi possível carregar códigos Sienge:", siengeResp.error.message);
  }

  if(movResp.error){
    console.error(movResp.error);
  }

const usuario = usuarioAtualRelatoriosBDR();

let dadosPatrimonios = patResp.data || [];
let dadosMovimentacoes = movResp.data || [];

/* DADOS: filtra por permissão nova, não por perfil. */
const podeTodasObras = temPermissaoRelatoriosBDR("RELATORIOS_TODAS_OBRAS", usuario)
  || temPermissaoRelatoriosBDR("TODAS_OBRAS_VER", usuario);
const podeObrasPermitidas = temPermissaoRelatoriosBDR("RELATORIOS_OBRAS_PERMITIDAS", usuario);
const podePropriaObra = temPermissaoRelatoriosBDR("PROPRIA_OBRA_VER", usuario);
let obrasVisiveis = obrasResp.data || [];

if(usuario && !podeTodasObras){
  // A fonte principal das obras de atuação é usuario_obras, a mesma do
  // gerenciamento de Usuários. Nunca usar a empresa como substituta da
  // autorização por obra; obras permitidas podem ser de empresas distintas.
  const idsPermitidos = new Set();
  if(podeObrasPermitidas){
    const vinculosResp = await db().from("usuario_obras")
      .select("obra_id").eq("usuario_id", Number(usuario.id));
    if(vinculosResp.error){
      console.error("Relatórios: erro ao consultar obras autorizadas", vinculosResp.error);
      alert("Não foi possível consultar suas obras autorizadas. Contate o administrador.");
      return; // Sem autorização confirmada, não exibir dados.
    }
    for(const vinculo of (vinculosResp.data || [])){
      if(vinculo.obra_id != null) idsPermitidos.add(String(vinculo.obra_id));
    }
    // Compatibilidade com usuários legados que ainda não possuem vínculos.
    // A proteção efetiva dos dados continua sendo responsabilidade do RLS.
    if(idsPermitidos.size === 0){
      String(usuario.obras_liberadas || "").split(",")
        .map(id => id.trim()).filter(id => /^\d+$/.test(id))
        .forEach(id => idsPermitidos.add(id));
    }
  }else if(podePropriaObra && usuario.obra_id != null){
    idsPermitidos.add(String(usuario.obra_id));
  }

  dadosPatrimonios = dadosPatrimonios.filter(p =>
    idsPermitidos.has(String(p.obra_id))
  );
  dadosMovimentacoes = dadosMovimentacoes.filter(m =>
    idsPermitidos.has(String(m.obra_origem_id)) ||
    idsPermitidos.has(String(m.obra_destino_id))
  );
  obrasVisiveis = obrasVisiveis.filter(o => idsPermitidos.has(String(o.id)));
  document.getElementById("filtroObra").style.display =
    obrasVisiveis.length > 1 ? "" : "none";
}

// Obras 22 (LAB) e 33 (SATH) são exclusivas do OWNER, mesmo quando
// o perfil tem permissão geral de relatórios. A consulta deve continuar
// obedecendo às policies RLS do Supabase em todas as situações.
const eOwnerRelatorio = Number(usuario?.id)===1 && usuario?.owner_sistema===true;
if(!eOwnerRelatorio){
  dadosPatrimonios = dadosPatrimonios.filter(p => !['22','33'].includes(String(p.obra_id)));
  obrasVisiveis = obrasVisiveis.filter(o => !['22','33'].includes(String(o.id)));
}
patrimonios = dadosPatrimonios;
  atlasMovPatrimoniosPorId = new Map(patrimonios.map(p => [String(p.id), p]));
obras = obrasVisiveis;
  atlasConfigurarObraUnicaRelatorio();
empresas = empresasResp.data || [];
siengeCodigos = siengeResp.data || [];
movimentacoes = dadosMovimentacoes;
  carregarSiengeInsumosPremium(false);
  carregarFiltroObras();
  carregarChecksObrasSienge();
  renderizarRelatorio();
  await atlasCarregarMovimentacoes();
  // BDR V11.1: sininho agora é global em JS/bdrNotificacoes.js; não gerar alertas locais aqui.
}

function carregarFiltroObras(){

  const select = document.getElementById("filtroObra");
  select.innerHTML = `<option value="">Todas as obras/setores</option>`;

  obras.forEach(o => {
    select.innerHTML += `
      <option value="${o.id}">
        ${o.codigo_obra || "-"} - ${o.nome || "-"}
      </option>
    `;
  });
}

function limparCodigoManualSienge(valor){
  if(valor === null || valor === undefined) return "";

  let v = String(valor).trim().toUpperCase();

  // O Sienge aceita no máximo 10 caracteres no código manual.
  // Exemplo: PAT-100130001 vira 100130001.
  v = v.replace(/^PAT[-_\s]*/i, "");
  v = v.replace(/[^A-Z0-9]/g, "");

  return v.slice(0, 10);
}

function codigoManualBDR(p){
  /*
    Padrão Sienge:
    - número do patrimônio
    - máximo 10 caracteres
    - sem PAT- quando ultrapassar o limite
  */
  return limparCodigoManualSienge(
    p.codigo_manual ||
    p.codigo_bem ||
    p.codigo_qr ||
    p.codigo_antigo ||
    p.patrimonio ||
    ""
  );
}

function tipoOrigemCadastro(p){
  const origem = String(p.origem_cadastro || "").toUpperCase();
  const codigo = String(codigoManualBDR(p) || "").toUpperCase();

  if(origem.includes("LEGADO")) return "LEGADO";
  if(origem.includes("NOVO")) return "NOVO";
  if(codigo.startsWith("PAT-")) return "PAT";
  return "ANTIGO";
}

function obrasSelecionadasSienge(){
  return Array.from(document.querySelectorAll(".obra-sienge-check:checked"))
    .map(c => String(c.value));
}

function carregarChecksObrasSienge(){
  const box = document.getElementById("listaObrasSienge");
  if(!box) return;

  box.innerHTML = "";

  obras.forEach(o => {
    const qtd = patrimonios.filter(p => String(p.obra_id) === String(o.id)).length;
    if(qtd === 0) return;

    box.innerHTML += `
      <label class="obra-check">
        <input type="checkbox" class="obra-sienge-check" value="${o.id}" onchange="alternarObraRelatorio(this)">
        <span>${o.codigo_sienge || o.codigo_obra || "-"} - ${o.nome || "-"} (${qtd})</span>
      </label>
    `;
  });
}

/*
 * Alterna uma obra sem recriar a lista.
 * Ajuda principalmente em celular e tablet.
 */
function alternarObraRelatorio(checkbox){
  if(!checkbox) return;
  checkbox.checked = !!checkbox.checked;
  resetarPaginaRelatorio();
  renderizarRelatorio();
}

function marcarTodasObrasSienge(){
  document.querySelectorAll(".obra-sienge-check").forEach(c => c.checked = true);
  resetarPaginaRelatorio();
  renderizarRelatorio();
}

/*
 * Limpa toda seleção de obra do relatório.
 *
 * Antes, esta função desmarcava apenas os checkboxes da área Sienge.
 * Se uma obra ainda estivesse escolhida no filtro superior,
 * o relatório continuava filtrado e parecia que a seleção não tinha saído.
 */
function limparObrasSienge(){
  document.querySelectorAll(".obra-sienge-check").forEach(c => {
    c.checked = false;
  });

  const filtroObra = document.getElementById("filtroObra");
  if(filtroObra){
    filtroObra.value = "";
  }

  resetarPaginaRelatorio();
  renderizarRelatorio();
}


function dataBasePatrimonio(p){
  return p?.created_at ||
         p?.data_cadastro ||
         p?.data_aquisicao ||
         p?.data_compra ||
         p?.data_entrada ||
         null;
}

function converterDataAtlasRelatorio(valorData){
  if(!valorData) return null;

  let texto = String(valorData).trim().replace(" ", "T");
  const possuiFuso = /Z$/i.test(texto) || /[+-]\d{2}:\d{2}$/.test(texto);

  if(!possuiFuso) texto += "Z";

  const data = new Date(texto);
  return isNaN(data.getTime()) ? null : data;
}

function dataLocalISOAtlas(data){
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone:"America/Cuiaba",
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).formatToParts(data);

  const mapa = Object.fromEntries(partes.map(p => [p.type, p.value]));
  return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

function dentroPeriodoRelatorio(p){
  const inicio = valor("dataInicio");
  const fim = valor("dataFim");

  if(!inicio && !fim) return true;

  const data = converterDataAtlasRelatorio(dataBasePatrimonio(p));
  if(!data) return false;

  const localISO = dataLocalISOAtlas(data);

  if(inicio && localISO < inicio) return false;
  if(fim && localISO > fim) return false;
  return true;
}

function periodoRelatorio(tipo){
  const agora = new Date();
  const inicio = new Date(agora);

  if(tipo === "7DIAS") inicio.setDate(inicio.getDate() - 6);
  if(tipo === "30DIAS") inicio.setDate(inicio.getDate() - 29);

  document.getElementById("dataInicio").value = dataLocalISOAtlas(inicio);
  document.getElementById("dataFim").value = dataLocalISOAtlas(agora);
  resetarPaginaRelatorio();
  renderizarRelatorio();
}

function limparPeriodoRelatorio(){
  document.getElementById("dataInicio").value = "";
  document.getElementById("dataFim").value = "";
  renderizarRelatorio();
}

function dataHoraCadastroPatrimonio(p){
  return dataBasePatrimonio(p);
}

function formatarDataHoraCadastroPatrimonio(p){
  const data = converterDataAtlasRelatorio(dataHoraCadastroPatrimonio(p));
  if(!data) return "-";

  return data.toLocaleDateString("pt-BR", {
    timeZone:"America/Cuiaba",
    day:"2-digit",
    month:"2-digit",
    year:"numeric"
  });
}

function identificacaoInteligenteRelatorio(p){
  return p.codigo_qr || p.codigo_bem || p.etiqueta || p.codigo_antigo || `ID-${p.id || "-"}`;
}

function valorPatrimonioRelatorio(p){
  const bruto = p?.valor_bem ?? p?.valor_aquisicao ?? p?.valor;
  const numero = typeof bruto === "string"
    ? Number(bruto.replace(/\./g, "").replace(",", "."))
    : Number(bruto);
  if(!Number.isFinite(numero)) return "-";
  return numero.toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
}

function compararIdentificacaoRelatorio(a,b){
  return identificacaoInteligenteRelatorio(a).localeCompare(
    identificacaoInteligenteRelatorio(b),
    "pt-BR",
    {numeric:true, sensitivity:"base"}
  );
}

function relatorioTemObraUnica(){
  const ids = new Set(filtradosAtuais.map(p => String(p.obra_id || p.localizacao || "-")).filter(Boolean));
  return ids.size === 1;
}

function atualizarVisibilidadeObraRelatorio(){
  document.getElementById("cardRelatorioPatrimonios")?.classList.toggle("relatorio-obra-unica", relatorioTemObraUnica());
}

function nomesObrasRelatorioAtual(){
  const marcadas = obrasSelecionadasSienge();

  if(marcadas.length){
    return obras
      .filter(o => marcadas.includes(String(o.id)))
      .map(o => `${o.codigo_obra || o.codigo_sienge || "-"} - ${o.nome || "-"}`)
      .join("; ");
  }

  const obraId = valor("filtroObra");
  if(obraId){
    const obra = obras.find(o => String(o.id) === String(obraId));
    return obra ? `${obra.codigo_obra || obra.codigo_sienge || "-"} - ${obra.nome || "-"}` : "-";
  }

  const nomesFiltrados = [...new Set(
    filtradosAtuais.map(p => {
      const obra = obras.find(o => String(o.id) === String(p.obra_id));
      return obra ? `${obra.codigo_obra || obra.codigo_sienge || "-"} - ${obra.nome || "-"}` : (p.localizacao || "-");
    })
  )].filter(Boolean);

  return nomesFiltrados.length ? nomesFiltrados.join("; ") : "Todas";
}

function periodoFiltroRelatorioTexto(){
  const inicio = valor("dataInicio");
  const fim = valor("dataFim");

  const br = iso => {
    if(!iso) return "";
    const [a,m,d] = iso.split("-");
    return `${d}/${m}/${a}`;
  };

  if(inicio && fim) return `${br(inicio)} até ${br(fim)}`;
  if(inicio) return `A partir de ${br(inicio)}`;
  if(fim) return `Até ${br(fim)}`;
  return "Todos os registros";
}

function periodoEfetivoLancamentos(){
  const datas = filtradosAtuais
    .map(dataHoraCadastroPatrimonio)
    .filter(Boolean)
    .map(converterDataAtlasRelatorio)
    .filter(Boolean)
    .sort((a,b) => a - b);

  if(!datas.length) return "-";

  const formato = d => d.toLocaleDateString("pt-BR", {
    timeZone:"America/Cuiaba",
    day:"2-digit",
    month:"2-digit",
    year:"numeric"
  });

  if(datas.length === 1) return formato(datas[0]);
  return `${formato(datas[0])} até ${formato(datas[datas.length - 1])}`;
}

function atualizarCabecalhoDocumentoRelatorio(){
  const usuario = JSON.parse(
    localStorage.getItem("usuario_logado") ||
    localStorage.getItem("usuarioLogado") ||
    "null"
  );

  const setTexto = (id, texto) => {
    const el = document.getElementById(id);
    if(el) el.textContent = texto;
  };

  setTexto(
    "relatorioDocEmissao",
    `Emitido em ${new Date().toLocaleString("pt-BR", {
      timeZone:"America/Cuiaba",
      day:"2-digit",
      month:"2-digit",
      year:"numeric",
      hour:"2-digit",
      minute:"2-digit",
      second:"2-digit"
    })}`
  );
  setTexto("relatorioDocObras", nomesObrasRelatorioAtual());
  setTexto("relatorioDocPeriodo", periodoFiltroRelatorioTexto());
  setTexto("relatorioDocPeriodoEfetivo", periodoEfetivoLancamentos());
  setTexto("relatorioDocUsuario", usuario?.nome || usuario?.usuario || "Usuário não identificado");
  setTexto("relatorioDocTotal", String(filtradosAtuais.length));
}


function resetarPaginaRelatorio(){
  paginaAtualRelatorio = 1;
}

function totalPaginasRelatorio(){
  return Math.max(
    1,
    Math.ceil(filtradosAtuais.length / ITENS_POR_PAGINA_RELATORIO)
  );
}

function itensPaginaAtualRelatorio(){
  const totalPaginas = totalPaginasRelatorio();

  if(paginaAtualRelatorio > totalPaginas){
    paginaAtualRelatorio = totalPaginas;
  }

  const inicio = (paginaAtualRelatorio - 1) * ITENS_POR_PAGINA_RELATORIO;
  const fim = inicio + ITENS_POR_PAGINA_RELATORIO;

  return filtradosAtuais.slice(inicio, fim);
}

function atualizarPaginacaoRelatorio(){
  const total = filtradosAtuais.length;
  const totalPaginas = totalPaginasRelatorio();
  const inicio = total === 0
    ? 0
    : ((paginaAtualRelatorio - 1) * ITENS_POR_PAGINA_RELATORIO) + 1;
  const fim = Math.min(
    paginaAtualRelatorio * ITENS_POR_PAGINA_RELATORIO,
    total
  );

  const faixa = document.getElementById("relatorioFaixaExibida");
  const info = document.getElementById("relatorioPaginaInfo");
  const anterior = document.getElementById("btnRelatorioAnterior");
  const proxima = document.getElementById("btnRelatorioProxima");

  if(faixa){
    faixa.textContent = `Exibindo ${inicio}–${fim} de ${total}`;
  }

  if(info){
    info.textContent = `Página ${paginaAtualRelatorio} de ${totalPaginas}`;
  }

  if(anterior){
    anterior.disabled = paginaAtualRelatorio <= 1;
  }

  if(proxima){
    proxima.disabled =
      paginaAtualRelatorio >= totalPaginas ||
      total === 0;
  }
}

function paginaRelatorioAnterior(){
  if(paginaAtualRelatorio <= 1) return;

  paginaAtualRelatorio--;
  renderizarTabelaPaginaRelatorio();
  document.getElementById("cardRelatorioPatrimonios")
    ?.scrollIntoView({ behavior:"smooth", block:"start" });
}

function paginaRelatorioProxima(){
  if(paginaAtualRelatorio >= totalPaginasRelatorio()) return;

  paginaAtualRelatorio++;
  renderizarTabelaPaginaRelatorio();
  document.getElementById("cardRelatorioPatrimonios")
    ?.scrollIntoView({ behavior:"smooth", block:"start" });
}

function renderizarTabelaPaginaRelatorio(){
  const corpo = document.getElementById("corpoTabela");
  if(!corpo) return;
  corpo.innerHTML = "";

  const itensPagina = itensPaginaAtualRelatorio();
  const indiceInicial = (paginaAtualRelatorio - 1) * ITENS_POR_PAGINA_RELATORIO;
  const ocultarObra = relatorioTemObraUnica();
  const totalColunas = ocultarObra ? 11 : 12;

  if(itensPagina.length === 0){
    corpo.innerHTML = `<tr><td colspan="${totalColunas}">Nenhum patrimônio encontrado.</td></tr>`;
    atualizarPaginacaoRelatorio();
    return;
  }

  itensPagina.forEach((p, indicePagina) => {
    const obraObj = obras.find(o => String(o.id) === String(p.obra_id));
    const tipo = String(p.tipo_item || "OUTRO").toUpperCase();
    const tipoExibicao = tipo === "MAQUINA" ? "MÁQUINA PESADA" : tipo.replaceAll("_", " ");
    corpo.innerHTML += `
      <tr>
        <td class="relatorio-numero-linha">${indiceInicial + indicePagina + 1}</td>
        <td>${identificacaoInteligenteRelatorio(p)}</td>
        <td>${p.nome_bem || "-"}</td>
        <td>${tipoExibicao}</td>
        <td><span class="status ${p.status || ""}">${String(p.status || "-").replaceAll("_", " ")}</span></td>
        <td class="coluna-obra-relatorio">${obraObj ? `${obraObj.codigo_obra || obraObj.codigo_sienge || "-"} - ${obraObj.nome || "-"}` : (p.localizacao || "-")}</td>
        <td>${p.marca || "-"}</td>
        <td>${p.modelo || "-"}</td>
        <td>${p.numero_serie || p.placa || "-"}</td>
        <td>${valorPatrimonioRelatorio(p)}</td>
        <td>${formatarDataHoraCadastroPatrimonio(p)}</td>
        <td>${p.usuario_cadastro || p.cadastrado_por || "-"}</td>
      </tr>`;
  });
  atualizarPaginacaoRelatorio();
}
// Busca original e seleção avançada usam a mesma normalização.
function atlasNormalizarBuscaProduto(texto){
  return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
const atlasProdutosSelecionadosRelatorio = new Set();
let atlasProdutosRascunhoRelatorio = new Set();
function atlasCatalogoProdutosRelatorio(){
  const grupos = new Map();
  // Fonte: somente o conjunto de patrimônios já carregado para o usuário.
  for(const p of patrimonios){
    const nome = String(p.nome_bem ?? "").trim();
    if(!nome) continue;
    const chave = atlasNormalizarBuscaProduto(nome);
    if(!chave) continue;
    if(!grupos.has(chave)) grupos.set(chave,{chave,nome,quantidade:0,codigos:[]});
    const grupo=grupos.get(chave);
    grupo.quantidade++;
    if(grupo.codigos.length<3){
      const codigo=String(p.codigo_qr || p.codigo_antigo || p.codigo_bem || "").trim();
      if(codigo)grupo.codigos.push(codigo);
    }
  }
  return [...grupos.values()].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
}
function abrirSeletorProdutosRelatorio(){
  atlasProdutosRascunhoRelatorio = new Set(atlasProdutosSelecionadosRelatorio);
  const modal=document.getElementById("atlasModalProdutosRelatorio");
  document.getElementById("atlasPesquisaProdutosRelatorio").value="";
  modal.classList.add("ativo");modal.setAttribute("aria-hidden","false");
  renderizarSeletorProdutosRelatorio();
  document.getElementById("atlasPesquisaProdutosRelatorio").focus();
}
function fecharSeletorProdutosRelatorio(){
  const modal=document.getElementById("atlasModalProdutosRelatorio");
  modal.classList.remove("ativo");modal.setAttribute("aria-hidden","true");
}
function atlasResultadosPesquisaProdutos(){
  const termo=atlasNormalizarBuscaProduto(document.getElementById("atlasPesquisaProdutosRelatorio")?.value);
  return atlasCatalogoProdutosRelatorio().filter(g=>g.chave.includes(termo)||g.codigos.some(c=>atlasNormalizarBuscaProduto(c).includes(termo)));
}
function renderizarSeletorProdutosRelatorio(){
  const lista=document.getElementById("atlasListaProdutosRelatorio");
  if(!lista)return;
  lista.replaceChildren();
  const resultados=atlasResultadosPesquisaProdutos();
  document.getElementById("atlasContagemResultadosProdutos").textContent=`${resultados.length} encontrado(s)`;
  const marcar=document.getElementById("atlasMarcarPaginaProdutos");
  marcar.checked=resultados.length>0&&resultados.every(g=>atlasProdutosRascunhoRelatorio.has(g.chave));
  marcar.indeterminate=!marcar.checked&&resultados.some(g=>atlasProdutosRascunhoRelatorio.has(g.chave));
  if(!resultados.length){
    const vazio=document.createElement("div");vazio.className="atlas-relatorio-modal-vazio";
    vazio.textContent="Nenhum produto encontrado. Tente outro nome ou código.";lista.append(vazio);
  }
  // Renderiza apenas os primeiros 300 nomes por pesquisa para manter o modal responsivo.
  resultados.slice(0,300).forEach(g=>{
    const linha=document.createElement("label");linha.className="atlas-relatorio-produto";
    const check=document.createElement("input");check.type="checkbox";check.checked=atlasProdutosRascunhoRelatorio.has(g.chave);
    check.addEventListener("change",()=>{
      if(check.checked)atlasProdutosRascunhoRelatorio.add(g.chave);else atlasProdutosRascunhoRelatorio.delete(g.chave);
      renderizarSeletorProdutosRelatorio();
    });
    const nome=document.createElement("span");nome.className="atlas-relatorio-produto-nome";nome.textContent=g.nome;
    const codigo=document.createElement("small");codigo.textContent=g.codigos.length?`Ex.: ${g.codigos.join(" · ")}`:"Patrimônio cadastrado";nome.append(codigo);
    const qtd=document.createElement("span");qtd.className="atlas-relatorio-produto-qtd";qtd.textContent=`${g.quantidade} item(ns)`;
    linha.append(check,nome,qtd);lista.append(linha);
  });
  document.getElementById("atlasTotalProdutosSelecionados").textContent=`${atlasProdutosRascunhoRelatorio.size} produto(s) selecionado(s)`;
}
function marcarResultadosProdutosRelatorio(marcar){
  // Marca todos os nomes encontrados, inclusive além das primeiras 300 linhas exibidas.
  atlasResultadosPesquisaProdutos().forEach(g=>marcar?atlasProdutosRascunhoRelatorio.add(g.chave):atlasProdutosRascunhoRelatorio.delete(g.chave));
  renderizarSeletorProdutosRelatorio();
}
function limparSelecaoProdutosModal(){atlasProdutosRascunhoRelatorio.clear();renderizarSeletorProdutosRelatorio();}
function atualizarContadorProdutosRelatorio(){
  const el=document.getElementById("atlasRelatorioQtdSelecao");if(!el)return;
  el.hidden=atlasProdutosSelecionadosRelatorio.size===0;
  el.textContent=String(atlasProdutosSelecionadosRelatorio.size);
}
function aplicarSeletorProdutosRelatorio(){
  atlasProdutosSelecionadosRelatorio.clear();
  atlasProdutosRascunhoRelatorio.forEach(chave=>atlasProdutosSelecionadosRelatorio.add(chave));
  fecharSeletorProdutosRelatorio();atualizarContadorProdutosRelatorio();
  resetarPaginaRelatorio();renderizarRelatorio();
}
document.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&document.getElementById("atlasModalProdutosRelatorio")?.classList.contains("ativo"))fecharSeletorProdutosRelatorio();
});

// Filtros compactos: seleção múltipla de obras independente da seleção Sienge.
const atlasObrasFiltradas = new Set();
let atlasObrasSelecaoAplicada = false;
let atlasObrasRascunho = new Set();
function atlasNomeObra(o){return [o.codigo_obra || o.codigo_sienge || "",o.nome || ""].filter(Boolean).join(" - ")}
function atlasAbrirModalObras(){
  atlasObrasRascunho=new Set(atlasObrasFiltradas);
  document.getElementById("atlasPesquisarObras").value="";
  document.getElementById("atlasModalObrasRelatorio").classList.add("ativo");
  document.getElementById("atlasModalObrasRelatorio").setAttribute("aria-hidden","false");
  atlasRenderizarObras();
  document.getElementById("atlasPesquisarObras").focus();
}
function atlasFecharModalObras(){
  document.getElementById("atlasModalObrasRelatorio").classList.remove("ativo");
  document.getElementById("atlasModalObrasRelatorio").setAttribute("aria-hidden","true");
}
function atlasObrasVisiveis(){
  const termo=atlasNormalizarBuscaProduto(document.getElementById("atlasPesquisarObras").value);
  return obras.filter(o=>atlasNormalizarBuscaProduto(atlasNomeObra(o)).includes(termo));
}
function atlasRenderizarObras(){
  const lista=document.getElementById("atlasListaObras");
  lista.replaceChildren();
  const visiveis=atlasObrasVisiveis();
  visiveis.forEach(o=>{
    const label=document.createElement("label");
    label.className="atlas-obra-item";
    const box=document.createElement("input");box.type="checkbox";
    box.checked=atlasObrasRascunho.has(String(o.id));
    box.addEventListener("change",()=>{
      if(box.checked)atlasObrasRascunho.add(String(o.id));
      else atlasObrasRascunho.delete(String(o.id));
      atlasAtualizarResumoObrasModal();
    });
    const nome=document.createElement("span");nome.textContent=atlasNomeObra(o);
    label.append(box,nome);lista.appendChild(label);
  });
  if(!visiveis.length){const vazio=document.createElement("p");vazio.textContent="Nenhuma obra encontrada.";lista.appendChild(vazio)}
  atlasAtualizarResumoObrasModal();
}
function atlasAtualizarResumoObrasModal(){
  document.getElementById("atlasQtdObras").textContent=atlasObrasRascunho.size+" obra(s) selecionada(s)";
  const visiveis=atlasObrasVisiveis();
  const marcadas=visiveis.filter(o=>atlasObrasRascunho.has(String(o.id))).length;
  const check=document.getElementById("atlasMarcarObras");
  check.checked=visiveis.length>0 && marcadas===visiveis.length;
  check.indeterminate=marcadas>0 && marcadas<visiveis.length;
}
function atlasSelecionarObrasVisiveis(marcar){
  atlasObrasVisiveis().forEach(o=>marcar?atlasObrasRascunho.add(String(o.id)):atlasObrasRascunho.delete(String(o.id)));
  atlasRenderizarObras();
}
function atlasLimparObrasModal(){atlasObrasRascunho.clear();atlasRenderizarObras()}
function atlasAplicarObras(){
  atlasObrasFiltradas.clear();atlasObrasRascunho.forEach(id=>atlasObrasFiltradas.add(id));
  atlasObrasSelecaoAplicada = true;
  document.getElementById("filtroObra").value="";
  atlasAtualizarResumoObras();
  atlasFecharModalObras();resetarPaginaRelatorio();renderizarRelatorio();atlasMovPagina=1;atlasRenderMov();
}
// Ajuste somente de interface: a autorização e os filtros originais continuam intactos.
function atlasConfigurarObraUnicaRelatorio(){
  const unica = Array.isArray(obras) && obras.length === 1;
  document.body.classList.toggle("atlas-relatorio-obra-unica", unica);
  const botao = document.getElementById("atlasAbrirObras");
  const resumo = document.getElementById("atlasObrasResumo");
  if(botao){botao.disabled=unica;botao.setAttribute("aria-disabled",String(unica));}
  if(unica && resumo){resumo.textContent=atlasNomeObra(obras[0]);}
  if(!unica){atlasAtualizarResumoObras();}
  const info=document.getElementById("atlasObraUnicaSienge");
  if(info && unica){info.textContent="Obra autorizada: "+atlasNomeObra(obras[0])+". Nenhuma seleção necessária.";}
}
function atlasAtualizarResumoObras(){
  document.getElementById("atlasObrasResumo").textContent=obras.length===1?atlasNomeObra(obras[0]):(atlasObrasFiltradas.size?atlasObrasFiltradas.size+" obra(s) selecionada(s)":"Todas as obras autorizadas (exceto testes)");
}
function atlasLimparObras(){atlasObrasFiltradas.clear();atlasObrasSelecaoAplicada=false;atlasAtualizarResumoObras();atlasMovPagina=1;atlasRenderMov()}
function atlasAlternarPeriodo(){
  const el=document.getElementById("atlasPeriodoPopover");
  el.hidden=!el.hidden;
}
function atlasAtualizarPeriodo(){
  const ini=document.getElementById("dataInicio").value;
  const fim=document.getElementById("dataFim").value;
  const fmt=v=>v?v.split("-").reverse().join("/"):"";
  document.getElementById("atlasPeriodoResumo").textContent=ini||fim?[fmt(ini),fmt(fim)].filter(Boolean).join(" até "):"Todo o período";
}
document.addEventListener("click",e=>{
  const wrap=document.querySelector(".atlas-periodo-wrap");
  if(wrap && !wrap.contains(e.target))document.getElementById("atlasPeriodoPopover").hidden=true;
});

function atlasStatusSelecionados(){return [...document.querySelectorAll('#atlasStatusOpcoes input:checked')].map(x=>x.value);}
function atlasStatusAtualizarRotulo(){const sel=atlasStatusSelecionados(),nomes={ESTOQUE:'Estoque',EM_USO:'Em uso',MANUTENCAO:'Manutenção',BAIXADO:'Baixado'};const b=document.getElementById('atlasStatusBotao');if(b)b.textContent=sel.length?sel.map(x=>nomes[x]||x).join(', ')+' ▾':'Todos os status ▾';}
function atlasStatusAlterado(){document.getElementById('filtroStatus').value='';atlasStatusAtualizarRotulo();resetarPaginaRelatorio();renderizarRelatorio();}
function atlasLimparStatus(atualizar=true){document.querySelectorAll('#atlasStatusOpcoes input').forEach(x=>x.checked=false);document.getElementById('filtroStatus').value='';atlasStatusAtualizarRotulo();if(atualizar){resetarPaginaRelatorio();renderizarRelatorio();}}
function atlasDefinirStatus(valor){document.querySelectorAll('#atlasStatusOpcoes input').forEach(x=>x.checked=x.value===valor);atlasStatusAlterado();}
function atlasAlternarStatusFiltro(){const el=document.getElementById('atlasStatusOpcoes');el.hidden=!el.hidden;document.getElementById('atlasStatusBotao').setAttribute('aria-expanded',String(!el.hidden));}
document.addEventListener('click',e=>{const el=document.querySelector('.atlas-status-filtro');if(el&&!el.contains(e.target)){document.getElementById('atlasStatusOpcoes').hidden=true;document.getElementById('atlasStatusBotao').setAttribute('aria-expanded','false');}});

function renderizarRelatorio(){
  if(modoRelatorioHistorico){ modoRelatorioHistorico=false; }

  const busca = atlasNormalizarBuscaProduto(valor("busca"));
  const status = valor("filtroStatus");
  const tipo = valor("filtroTipo");
  const obra = valor("filtroObra");
  const origem = valor("filtroOrigem");
  const dataInicio = valor("dataInicio");
  const dataFim = valor("dataFim");
  const obrasMarcadas = obrasSelecionadasSienge();

  filtradosAtuais = patrimonios.filter(p => {

    const obraObj = obras.find(o => String(o.id) === String(p.obra_id));

    const texto = `
      ${p.codigo_qr || ""}
      ${p.codigo_antigo || ""}
      ${p.codigo_bem || ""}
      ${p.nome_bem || ""}
      ${p.tipo_item || ""}
      ${p.status || ""}
      ${p.localizacao || ""}
      ${p.marca || ""}
      ${p.modelo || ""}
      ${p.numero_serie || ""}
      ${p.placa || ""}
      ${obraObj?.nome || ""}
      ${obraObj?.codigo_obra || ""}
      ${obraObj?.codigo_sienge || ""}
    `;
    const passaBusca = atlasNormalizarBuscaProduto(texto).includes(busca);
    const passaProdutos = atlasProdutosSelecionadosRelatorio.size===0 || atlasProdutosSelecionadosRelatorio.has(atlasNormalizarBuscaProduto(p.nome_bem));
    const estados=atlasStatusSelecionados();
    const passaStatus = estados.length ? estados.includes(String(p.status||"").toUpperCase()) : (!status || p.status === status);
    const passaTipo = !tipo || p.tipo_item === tipo;

    /*
      Regra de obra/setor:
      - se marcou obras na seleção Sienge, usa as marcadas;
      - se não marcou, usa o filtro obra normal.
    */
    const passaObraMarcada =
      obrasMarcadas.length === 0 || obrasMarcadas.includes(String(p.obra_id));

    const passaObraFiltro =
      obrasMarcadas.length > 0 ? true : (atlasObrasFiltradas.size > 0
        ? atlasObrasFiltradas.has(String(p.obra_id))
        : (!obra || String(p.obra_id) === String(obra)));

    let passaOrigem = true;
    const origemItem = tipoOrigemCadastro(p);

    if(origem === "NOVO") passaOrigem = origemItem === "NOVO" || origemItem === "PAT";
    if(origem === "LEGADO") passaOrigem = origemItem === "LEGADO" || origemItem === "ANTIGO";
    if(origem === "PAT") passaOrigem = String(codigoManualBDR(p)).toUpperCase().startsWith("PAT-");
    if(origem === "ANTIGO") passaOrigem = !String(codigoManualBDR(p)).toUpperCase().startsWith("PAT-");

    const passaPeriodo = dentroPeriodoRelatorio(p);

    return passaBusca && passaProdutos && passaStatus && passaTipo && passaObraMarcada && passaObraFiltro && passaOrigem && passaPeriodo;
  });

  filtradosAtuais.sort(compararIdentificacaoRelatorio);

  document.getElementById("resumo").innerText =
    `Total encontrado: ${filtradosAtuais.length} patrimônio(s)`;

  atualizarCabecalhoDocumentoRelatorio();
  atualizarKPIsRelatorio();

  atualizarVisibilidadeObraRelatorio();
  renderizarTabelaPaginaRelatorio();
  clearTimeout(window.__atlasTimerConferencia);
  window.__atlasTimerConferencia=setTimeout(carregarConferenciaCompativel,250);
}

/* Relatório de Movimentações — apresentação e filtros locais (somente leitura).
   Preserva os registros originais, a autorização de obras e a integração Sienge. */
let atlasMovDados = [];
let atlasMovCadastroDados = [];
let atlasMovPatrimoniosPorId = new Map();
let atlasMovPagina = 1;
const ATLAS_MOV_POR_PAGINA = 30;
let atlasMovErro = null;
// Componente reutilizável: duas posições visuais, um único estado da lista.
let atlasMovPaginadores = [];
function atlasMovSincronizarPaginadores(total){
  if(!window.AtlasPaginacao)return;
  const opcoes={pagina:atlasMovPagina,total,porPagina:ATLAS_MOV_POR_PAGINA};
  if(!atlasMovPaginadores.length){
    for(const id of ['atlasMovPaginacaoTopo','atlasMovPaginacaoBaixo']){
      const elemento=document.getElementById(id);
      if(elemento)atlasMovPaginadores.push(AtlasPaginacao.criar({...opcoes,elemento,rotulo:'Navegação dos resultados do relatório',aoMudar:atlasMovIrParaPagina}));
    }
  }else atlasMovPaginadores.forEach(p=>p.atualizar(opcoes));
}
// Mantém os cabeçalhos das colunas sincronizados com o rolamento horizontal da tabela.
function atlasMovSincronizarCabecalhoHorizontal(){
  const corpo=document.querySelector('#atlasMovimentacoesCard .atlas-mov-table-wrap');
  const topo=document.getElementById('atlasMovCabecalhoScroll');
  if(corpo&&topo&&!corpo.dataset.atlasCabecalhoLigado){
    corpo.addEventListener('scroll',()=>{topo.scrollLeft=corpo.scrollLeft;},{passive:true});
    corpo.dataset.atlasCabecalhoLigado='1';
  }
}
// O histórico é reconstruído apenas a partir de transferências/remessas disponíveis e autorizadas.
let atlasMovTrajetos = new Map();
// Auditoria real das baixas: registros gravados pelo módulo Patrimônio em "movimentacoes".
// Chave = patrimônio, valor = última transição documentada para BAIXADO.
let atlasMovBaixasAuditadas = new Map();
let atlasMovErroAuditoriaBaixas = null;
function atlasMovAuditoriaBaixa(m){
  return atlasMovBaixasAuditadas.get(String(m?.patrimonio_id??m?.id??'')) || null;
}
// O patrimônio grava data_movimentacao em horário local de Cuiabá, sem fuso.
// Não reinterpretar essa string como UTC nem subtrair quatro horas novamente.
function atlasMovDataOperacao(valor){
  if(!valor)return '—';
  const texto=String(valor).trim();
  const local=texto.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if(local)return `${local[3]}/${local[2]}/${local[1]} ${local[4]}:${local[5]}`;
  return atlasMovData(valor);
}
function atlasMovBaixaData(m){return atlasMovAuditoriaBaixa(m)?.data_movimentacao||null;}
function atlasMovBaixaUsuario(m){const u=atlasMovAuditoriaBaixa(m)?.usuario;return typeof u==='string'&&u.trim()?u.trim():null;}
// Origem da identificação: movimentação efetiva ou cadastro de um bem já BAIXADO.
// Sem evento de baixa, o nome é o cadastrador (não se inventa uma operação posterior).
function atlasMovCadastroUsuario(m){
  const p=atlasMovPatrimoniosPorId.get(String(m?.patrimonio_id??m?.id??''));
  const nome=m?.usuario_cadastro||p?.usuario_cadastro||p?.cadastrado_por;
  if(typeof nome!=='string'||!nome.trim()||['Usuário não identificado','...','—','-'].includes(nome.trim()))return null;
  return nome.trim();
}
function atlasMovCadastroData(m){
  const p=atlasMovPatrimoniosPorId.get(String(m?.patrimonio_id??m?.id??''));
  return m?.data_cadastro||p?.data_cadastro||p?.created_at||null;
}
function atlasMovBaixaIdentificacao(m){
  const auditoria=atlasMovAuditoriaBaixa(m);
  if(auditoria)return {origem:'MOVIMENTACAO',nome:atlasMovBaixaUsuario(m),data:auditoria.data_movimentacao||null,observacao:auditoria.observacao||null};
  // Em caso de erro de leitura, não presumir que a baixa ocorreu no cadastro.
  if(atlasMovErroAuditoriaBaixas)return {origem:'ERRO',nome:atlasMovCadastroUsuario(m),data:null,observacao:null};
  // Patrimônio atualmente BAIXADO sem evento separado: mostrar o cadastrador e a
  // data do cadastro, deixando explícita a fonte da identificação.
  return {origem:'CADASTRO_INICIAL',nome:atlasMovCadastroUsuario(m),data:atlasMovCadastroData(m),observacao:null};
}
function atlasMovBaixaPessoaRelatorio(m){
  const info=atlasMovBaixaIdentificacao(m);
  if(info.origem==='MOVIMENTACAO')return info.nome||'Baixa sem autor registrado';
  if(info.origem==='CADASTRO_INICIAL')return info.nome?`Cadastrado já BAIXADO por: ${info.nome}`:'Cadastro BAIXADO sem cadastrador identificado';
  return info.nome?`Cadastrado por: ${info.nome} (auditoria indisponível)`:'Autor da baixa não confirmado (auditoria indisponível)';
}
async function atlasMovCarregarBaixasAuditadas(){
  atlasMovBaixasAuditadas=new Map();
  atlasMovErroAuditoriaBaixas=null;
  // Consultar somente os patrimônios BAIXADOS e autorizados para o usuário.
  // A operação deve ser uma mudança real de status, não correção de cadastro.
  const ids=patrimonios.filter(p=>String(p.status||'').toUpperCase()==='BAIXADO')
    .map(p=>Number(p.id)).filter(Number.isSafeInteger);
  if(!ids.length)return;
  try{
    const tamanhoLote=80;
    for(let i=0;i<ids.length;i+=tamanhoLote){
      let inicio=0;
      const loteIds=ids.slice(i,i+tamanhoLote);
      while(true){
        const {data,error}=await db().from('movimentacoes')
          .select('id,patrimonio_id,tipo,status_anterior,status_novo,usuario,observacao,data_movimentacao')
          .in('patrimonio_id',loteIds)
          .eq('status_novo','BAIXADO')
          .in('tipo',['ALTERACAO_STATUS','EXCLUSAO_INATIVACAO'])
          .order('data_movimentacao',{ascending:false})
          .order('id',{ascending:false})
          .range(inicio,inicio+499);
        if(error)throw error;
        const registros=data||[];
        for(const registro of registros){
          // BAIXADO -> BAIXADO não é uma nova baixa.
          if(String(registro.status_anterior||'').toUpperCase()==='BAIXADO')continue;
          const id=String(registro.patrimonio_id??'');
          if(!atlasMovBaixasAuditadas.has(id))atlasMovBaixasAuditadas.set(id,registro);
        }
        if(registros.length<500)break;
        inicio+=500;
      }
    }
  }catch(e){
    atlasMovErroAuditoriaBaixas=e;
    console.warn('Atlas Relatórios: não foi possível consultar toda a auditoria das baixas.',e);
    // Não atribuir usuário ou data com base no responsável pelo patrimônio.
  }
}

// O raio original pertence ao painel. Quando o cabeçalho adere ao topo,
// removemos apenas seu raio, sem criar borda vermelha paralela.
function atlasMovInstalarEstadoSticky(){
  const topo=document.getElementById('atlasMovResultsSticky');
  const painel=topo?.closest('.atlas-mov-results');
  if(!topo||!painel)return;
  const atualizar=()=>topo.classList.toggle('atlas-mov-stuck',painel.getBoundingClientRect().top<14);
  window.addEventListener('scroll',atualizar,{passive:true});
  document.addEventListener('scroll',atualizar,{passive:true,capture:true});
  atualizar();
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',atlasMovInstalarEstadoSticky,{once:true});
}else{
  atlasMovInstalarEstadoSticky();
}

function atlasMovReconstruirTrajetos(){
  atlasMovTrajetos=new Map();
  for(const m of atlasMovDados){
    const origem=String(m.obra_origem_id??'').trim(),destino=String(m.obra_destino_id??'').trim();
    if(!origem||!destino||origem===destino||m.origem_registro==='PATRIMONIO_BAIXADO'||atlasMovStatusNormalizado(m.status)==='CANCELADO')continue;
    const id=String(m.patrimonio_id??'');if(!id)continue;
    const data=atlasMovDataEvento(m);
    // Eventos sem data não determinam, por si só, a sequência de várias transferências.
    const tempo=data&&Number.isFinite(Date.parse(String(data).replace(' ','T')))?Date.parse(String(data).replace(' ','T')):null;
    const evento={origem,destino,tempo,data,tipo:atlasMovTipoLabel(m),status:atlasMovStatusLabel(m.status),
      concluido:['RECEBIDO','TRANSFERIDO','RECEBIDA_DIVERGENCIA'].includes(atlasMovStatusNormalizado(m.status))};
    if(!atlasMovTrajetos.has(id))atlasMovTrajetos.set(id,[]);
    atlasMovTrajetos.get(id).push(evento);
  }
  for(const [id,eventos] of atlasMovTrajetos){
    eventos.sort((a,b)=>a.tempo===null&&b.tempo!==null?1:b.tempo===null&&a.tempo!==null?-1:(a.tempo??0)-(b.tempo??0));
    // A mesma remessa pode existir na tabela de movimentações e nas remessas diretas.
    const unicos=[];
    for(const e of eventos){
      const repetida=unicos.find(x=>x.origem===e.origem&&x.destino===e.destino&&x.tempo!==null&&e.tempo!==null&&Math.abs(x.tempo-e.tempo)<86400000);
      if(repetida){if(e.concluido){repetida.concluido=true;repetida.status=e.status;}continue;}
      unicos.push(e);
    }
    atlasMovTrajetos.set(id,unicos);
  }
}
function atlasMovOrigemRegistrada(m){
  const eventos=atlasMovTrajetos.get(String(m.patrimonio_id))||[];
  // Múltiplos eventos sem data: a primeira origem não pode ser determinada com segurança.
  if(!eventos.length||(eventos.length>1&&eventos.some(e=>e.tempo===null)))return null;
  const primeiro=eventos[0];
  return primeiro?.origem?atlasMovObra(primeiro.origem):null;
}
function atlasMovPassagens(m){
  const eventos=atlasMovTrajetos.get(String(m.patrimonio_id))||[];
  if(!eventos.length)return [['Histórico','Nenhuma transferência entre obras encontrada nas fontes consultadas']];
  const etapas=[];
  eventos.forEach((e,i)=>{
    const situacao=e.concluido?'Transferência/recebimento registrado':'Movimentação sem recebimento confirmado';
    etapas.push([`Movimentação ${i+1}${e.tempo===null?' (ordem não confirmada)':''}`,`${atlasMovObra(e.origem)} → ${atlasMovObra(e.destino)} · ${situacao}${e.data?' · '+atlasMovData(e.data):' · data não informada'}`]);
  });
  return etapas;
}

function atlasMovEsc(v){return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function atlasMovTexto(v){return v == null || String(v).trim()==='' ? '—' : String(v);}
function atlasMovObra(id){const o=obras.find(x=>String(x.id)===String(id));return o ? (o.nome || o.codigo_obra || String(id)) : (id == null ? '—' : `Obra ${id}`);}
function atlasMovPat(id,m){const p=atlasMovPatrimoniosPorId.get(String(id));return p ? `${p.codigo_qr || m?.codigo_qr || 'ID '+id} — ${p.nome_bem || m?.nome_bem || '—'}` : (m?.nome_bem ? `${m.codigo_qr || 'ID '+id} — ${m.nome_bem}` : `Patrimônio ID ${id ?? '—'}`);}
function atlasMovData(v){if(!v)return '—';const str=String(v);if(/^\d{4}-\d{2}-\d{2}$/.test(str))return `${str.slice(8,10)}/${str.slice(5,7)}/${str.slice(0,4)}`;const d=new Date(str.replace(' ','T'));return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{timeZone:'America/Cuiaba',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function atlasMovDataISO(v){if(!v)return '';const str=String(v);if(/^\d{4}-\d{2}-\d{2}$/.test(str))return str;const d=new Date(str.replace(' ','T'));return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function atlasMovDiaISO(d){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function atlasMovCodigo(m){const p=atlasMovPatrimoniosPorId.get(String(m.patrimonio_id));return p?.codigo_qr || p?.codigo_bem || p?.etiqueta || p?.codigo_antigo || m.codigo_qr || `ID ${m.patrimonio_id ?? '—'}`;}
function atlasMovDescricao(m){const p=atlasMovPatrimoniosPorId.get(String(m.patrimonio_id));return p?.nome_bem || m.nome_bem || '—';}
function atlasMovStatusNormalizado(status){
  const s=String(status||'').toUpperCase();
  if(['RECEBIDA','RECEBIDO'].includes(s))return 'RECEBIDO';
  if(['ENVIADA','ENVIADO'].includes(s))return 'ENVIADO';
  if(['TRANSFERIDA','TRANSFERIDO'].includes(s))return 'TRANSFERIDO';
  if(['RECEBIDA_DIVERGENCIA','RECEBIDO_COM_DIVERGENCIA','EM_ANALISE_DIVERGENCIA','RECEBIDA_COM_DIVERGENCIA'].includes(s))return 'RECEBIDA_DIVERGENCIA';
  if(['A_RECEBER','AGUARDANDO_RECEBIMENTO'].includes(s))return 'AGUARDANDO_RECEBIMENTO';
  if(['CANCELADA','CANCELADO'].includes(s))return 'CANCELADO';
  return s;
}
function atlasMovStatusFiltro(m){const s=atlasMovStatusNormalizado(m.status);return s||'SEM_STATUS';}
function atlasMovStatusLabel(status){const s=atlasMovStatusNormalizado(status);return ({ENVIADO:'Enviada',EM_TRANSITO:'Em trânsito',RECEBIDO:'Recebida',TRANSFERIDO:'Transferida',RECEBIDA_DIVERGENCIA:'Com divergência',CANCELADO:'Cancelada',BAIXADO:'Baixado',AGUARDANDO_RECEBIMENTO:'A receber',EM_SEPARACAO:'Em separação',AGUARDANDO_RETIRADA:'Aguardando retirada',APROVADO:'Aprovado',ESTOQUE:'Estoque',EM_USO:'Em uso',DISPONIVEL:'Disponível',RESERVADO:'Reservado',MANUTENCAO:'Manutenção',INATIVO:'Inativo',ATIVO:'Ativo',SEM_STATUS:'Sem status'})[s]||s.replace(/_/g,' ')||'Sem status';}
function atlasMovTipoRegistro(m){
  if(m.origem_registro==='CADASTRO_PATRIMONIAL')return 'CADASTRO';
  if(m.origem_registro==='PATRIMONIO_BAIXADO'||atlasMovStatusNormalizado(m.status)==='BAIXADO')return 'BAIXA';
  const tipo=String(m.tipo_movimentacao||m.tipo||m.evento||'').toUpperCase();
  if(tipo.includes('TRANSFER'))return 'TRANSFERENCIA';
  if(tipo.includes('RECEB'))return 'RECEBIMENTO';
  if(tipo.includes('ENVIO')||tipo.includes('SAIDA'))return 'ENVIO';
  const status=atlasMovStatusNormalizado(m.status);
  if(status==='TRANSFERIDO')return 'TRANSFERENCIA';
  if(['RECEBIDO','RECEBIDA_DIVERGENCIA'].includes(status))return 'RECEBIMENTO';
  if(['EM_TRANSITO','ENVIADO'].includes(status))return 'ENVIO';
  return 'OUTROS';
}
function atlasMovTipoLabel(m){
  if(m.origem_registro==='PATRIMONIO_BAIXADO'){
    const fonte=atlasMovBaixaIdentificacao(m).origem;
    return fonte==='MOVIMENTACAO'?'Baixa registrada':fonte==='CADASTRO_INICIAL'?'Cadastro com status BAIXADO':'Status BAIXADO (auditoria indisponível)';
  }
  return ({ENVIO:'Envio',RECEBIMENTO:'Recebimento',TRANSFERENCIA:'Transferência',BAIXA:'Baixa patrimonial',OUTROS:'Registro patrimonial',CADASTRO:'Cadastro patrimonial'})[atlasMovTipoRegistro(m)];
}
function atlasMovResponsavel(m){
  if(m.origem_registro==='PATRIMONIO_BAIXADO')return atlasMovBaixaPessoaRelatorio(m);
  if(m.origem_registro==='CADASTRO_PATRIMONIAL'){
    if(atlasMovStatusNormalizado(m.status)==='BAIXADO')return atlasMovBaixaPessoaRelatorio(m);
    return atlasMovTexto(m.responsavel||m.usuario_cadastro);
  }
  const tipo=atlasMovTipoRegistro(m);
  // O responsável pela operação não é necessariamente o responsável atual pelo bem.
  const nome=tipo==='RECEBIMENTO'?(m.recebido_por||m.usuario||m.enviado_por):
    tipo==='ENVIO'?(m.enviado_por||m.usuario||m.solicitado_por):
    tipo==='BAIXA'?(m.usuario||m.baixado_por):
    (m.usuario||m.recebido_por||m.enviado_por||m.solicitado_por);
  return atlasMovTexto(nome||m.responsavel||m.usuario_cadastro);
}
function atlasMovParticipantes(m){
  return [m.solicitado_por,m.aprovado_por,m.separado_por,m.enviado_por,m.recebido_por,m.responsavel,m.usuario,m.usuario_cadastro,atlasMovBaixaUsuario(m),atlasMovCadastroUsuario(m)]
    .filter(v=>typeof v==='string'&&v.trim());
}
function atlasMovDataEvento(m){
  if(m.origem_registro==='CADASTRO_PATRIMONIAL')return m.data_cadastro||m.created_at||null;
  if(m.origem_registro==='PATRIMONIO_BAIXADO')return atlasMovBaixaIdentificacao(m).data;
  if(atlasMovTipoRegistro(m)==='RECEBIMENTO')return m.data_recebimento||m.data_movimentacao||null;
  return m.data_envio||m.data_recebimento||m.data_movimentacao||m.data_solicitacao||null;
}
function atlasMovDataExibicao(m){
  return m.origem_registro==='PATRIMONIO_BAIXADO'
    ?atlasMovDataOperacao(atlasMovBaixaIdentificacao(m).data):atlasMovData(atlasMovDataEvento(m));
}
/* Seletores múltiplos do novo painel. Nenhuma seleção altera dados no banco. */
const atlasMovSelecoes = {
  obras: new Set(), funcionarios: new Set(), tipos: new Set(), status: new Set(), categorias: new Set()
};
const atlasMovOpcoes = {obras:[],funcionarios:[],tipos:[],status:[],categorias:[]};
const atlasMovRotulos = {
  obras:'Todas as obras autorizadas',funcionarios:'Todos os funcionários',
  tipos:'Todos os patrimônios',status:'Todos os status',categorias:'Todas as categorias'
};
let atlasMovFotosReferencia = new Map();
function atlasMovFotoChave(marca,modelo){
  const n = x => String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  return n(marca)&&n(modelo) ? `${n(marca)}|||${n(modelo)}` : '';
}
function atlasMovImagemUrl(raw){
  const u=String(raw||'').trim();
  if(!u)return '';
  if(/^https:\/\//i.test(u))return u;
  if(/^http:\/\//i.test(u))return '';
  if(/^\/\//.test(u) || /^(?:javascript|data|file):/i.test(u))return '';
  return 'https://arquivos.sathtech.com.br/files/'+u.replace(/^\/+/, '');
}
function atlasMovFoto(m){
  const p=atlasMovPatrimoniosPorId.get(String(m.patrimonio_id));
  if(!p)return '';
  const k=atlasMovFotoChave(p.marca,p.modelo);
  return atlasMovImagemUrl(atlasMovFotosReferencia.get(k)||p.foto_referencia_url||p.foto_url||p.imagem_url);
}
async function atlasMovCarregarFotos(){
  atlasMovFotosReferencia=new Map();
  try{
    const {data,error}=await db().from('atlas_imagens_referencia')
      .select('marca,modelo,foto_url').eq('ativo',true);
    if(error)throw error;
    (data||[]).forEach(r=>{
      const chave=atlasMovFotoChave(r.marca,r.modelo);
      if(chave&&!atlasMovFotosReferencia.has(chave))atlasMovFotosReferencia.set(chave,r.foto_url);
    });
  }catch(e){console.warn('Relatórios: imagens de referência indisponíveis; usando ícones.',e?.message||e);}
}
function atlasMovElementoMulti(nome){return document.querySelector(`#atlasMovimentacoesCard [data-mov-multi="${nome}"]`);}
function atlasMovOpcoesVisiveis(nome){
  const root=atlasMovElementoMulti(nome),q=root?.querySelector('.atlas-mov-multi-search')?.value||'';
  const normal=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  return (atlasMovOpcoes[nome]||[]).filter(o=>normal(o.texto).includes(normal(q)));
}
function atlasMovDesenharMulti(nome){
  const root=atlasMovElementoMulti(nome);if(!root)return;
  const selecionados=atlasMovSelecoes[nome];
  const opts=atlasMovOpcoes[nome]||[];
  const selecionadas=opts.filter(o=>selecionados.has(String(o.valor)));
  const container=root.querySelector('.atlas-mov-multi-selected');
  if(container){
    container.innerHTML=nome==='obras' && selecionadas.length
      ? `<span class="atlas-mov-selection-count">${selecionadas.length} obra${selecionadas.length===1?'':'s'}/setor${selecionadas.length===1?'':'es'} selecionado${selecionadas.length===1?'':'s'}</span>`
      : selecionadas.length
        ?selecionadas.slice(0,2).map(o=>`<span class="atlas-mov-chip" data-valor="${atlasMovEsc(o.valor)}" title="Remover ${atlasMovEsc(o.texto)}">${atlasMovEsc(o.texto)} <i class="fa-solid fa-xmark" aria-hidden="true"></i></span>`).join('')
          +(selecionadas.length>2?`<span class="atlas-mov-chip-more">+${selecionadas.length-2}</span>`:'')
        :atlasMovEsc(atlasMovRotulos[nome]);
    container.parentElement.title=selecionadas.length?selecionadas.map(o=>o.texto).join(' · '):atlasMovRotulos[nome];
    container.querySelectorAll('.atlas-mov-chip').forEach(chip=>chip.addEventListener('click',e=>{
      e.stopPropagation();selecionados.delete(chip.dataset.valor);atlasMovDesenharMulti(nome);atlasMovMudouFiltro();
    }));
  }
  const lista=root.querySelector('.atlas-mov-multi-options');if(!lista)return;
  const visiveis=atlasMovOpcoesVisiveis(nome);
  lista.innerHTML=visiveis.map((o,i)=>`<label><input type="checkbox" data-valor="${atlasMovEsc(o.valor)}" ${selecionados.has(String(o.valor))?'checked':''}><span>${atlasMovEsc(o.texto)}</span></label>`).join('')
    ||'<div class="atlas-mov-multi-empty">Nenhuma opção encontrada.</div>';
  lista.querySelectorAll('input[type=checkbox]').forEach(input=>input.addEventListener('change',()=>{
    const id=input.dataset.valor;
    if(input.checked)selecionados.add(id);else selecionados.delete(id);
    atlasMovDesenharMulti(nome);atlasMovMudouFiltro();
  }));
}
function atlasMovAlternarMulti(nome,forcar){
  const root=atlasMovElementoMulti(nome);if(!root)return;
  const popup=root.querySelector('.atlas-mov-multi-popup');
  const aberto=typeof forcar==='boolean'?forcar:popup.hidden;
  document.querySelectorAll('#atlasMovimentacoesCard .atlas-mov-multi-popup').forEach(x=>{
    x.hidden=true;x.parentElement.querySelector('.atlas-mov-multi-trigger')?.setAttribute('aria-expanded','false');
  });
  popup.hidden=!aberto;root.querySelector('.atlas-mov-multi-trigger').setAttribute('aria-expanded',String(aberto));
  if(aberto){atlasMovDesenharMulti(nome);root.querySelector('.atlas-mov-multi-search')?.focus();}
}
function atlasMovPesquisarMulti(nome){atlasMovDesenharMulti(nome);}
function atlasMovSelecionarTodosMulti(nome){
  const sel=atlasMovSelecoes[nome];atlasMovOpcoesVisiveis(nome).forEach(o=>sel.add(String(o.valor)));
  atlasMovDesenharMulti(nome);atlasMovMudouFiltro();
}
function atlasMovLimparMulti(nome){atlasMovSelecoes[nome].clear();atlasMovDesenharMulti(nome);atlasMovMudouFiltro();}
/* Menu compacto da consulta: apenas apresentação, chama os exportadores existentes sem alterá-los. */
function atlasMovAlternarAcoes(forcar){
  const menu=document.getElementById('atlasMovMenuAcoes');
  const botao=document.getElementById('atlasMovBotaoAcoes');
  if(!menu||!botao)return;
  const abrir=typeof forcar==='boolean'?forcar:menu.hidden;
  menu.hidden=!abrir;
  botao.setAttribute('aria-expanded',String(abrir));
}
function atlasMovExecutarAcao(acao){
  atlasMovAlternarAcoes(false);
  if(acao==='excel')return atlasMovExportarExcelInteligente();
  if(acao==='imprimir')return atlasMovImprimirInteligente(false);
  if(acao==='detalhado')return atlasMovImprimirInteligente(true);
  if(acao==='sienge')return atlasMovAbrirSienge();
  if(acao==='codigos'){
    if(!exigirPermissaoRelatoriosBDR('SIENGE_EXPORTAR'))return;
    return abrirModalSienge();
  }
  if(acao==='assinados')return abrirRelatoriosAssinados();
  if(acao==='assinar'){
    if(!exigirPermissaoRelatoriosBDR('PATRIMONIO_CONFERIR_RELATORIO'))return;
    alert('A assinatura virtual existente é vinculada à conferência de uma única obra. Vamos abrir a tela de conferência antiga: selecione nela a obra e confirme o inventário antes de assinar. Os filtros deste novo relatório não são transferidos automaticamente.');
    atlasRelTab('patrimonios');
    return;
  }
}
function atlasMovAbrirSienge(){
  if(!exigirPermissaoRelatoriosBDR('SIENGE_EXPORTAR','Você não tem permissão para exportar Sienge.'))return;
  const overlay=document.getElementById('atlasMovSiengeOverlay');
  if(!overlay)return;
  overlay.hidden=false;
  overlay.querySelector('.atlas-mov-sienge-close')?.focus();
}
function atlasMovFecharSienge(){
  const overlay=document.getElementById('atlasMovSiengeOverlay');
  if(overlay)overlay.hidden=true;
  document.getElementById('atlasMovBotaoAcoes')?.focus();
}
document.addEventListener('click',e=>{
  if(!e.target.closest?.('#atlasMovimentacoesCard .atlas-mov-actions-menu'))atlasMovAlternarAcoes(false);
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(!document.getElementById('atlasMovSiengeOverlay')?.hidden)atlasMovFecharSienge();
    atlasMovAlternarAcoes(false);
  }
});
function atlasMovAlternarAvancados(){
  const corpo=document.getElementById('atlasMovAvancados'),btn=document.getElementById('atlasMovBotaoAvancados');
  if(!corpo||!btn)return;
  corpo.hidden=!corpo.hidden;btn.setAttribute('aria-expanded',String(!corpo.hidden));
}
document.addEventListener('click',e=>{
  if(!e.target.closest?.('#atlasMovimentacoesCard .atlas-mov-multi')){
    document.querySelectorAll('#atlasMovimentacoesCard .atlas-mov-multi-popup').forEach(p=>{
      p.hidden=true;p.parentElement.querySelector('.atlas-mov-multi-trigger')?.setAttribute('aria-expanded','false');
    });
  }
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')document.querySelectorAll('#atlasMovimentacoesCard .atlas-mov-multi-popup').forEach(p=>{
    p.hidden=true;p.parentElement.querySelector('.atlas-mov-multi-trigger')?.setAttribute('aria-expanded','false');
  });
});
function atlasMovMudouFiltro(){atlasMovPagina=1;atlasRenderMov();}
function atlasMovPeriodoPersonalizado(){
  const sel=document.getElementById('atlasMovPeriodo');if(sel)sel.value='personalizado';atlasMovMudouFiltro();
}
function atlasMovAtualizarPeriodo(){
  const periodo=document.getElementById('atlasMovPeriodo')?.value||'todos';
  const inicio=document.getElementById('atlasMovDataInicio'),fim=document.getElementById('atlasMovDataFim');
  if(!inicio||!fim)return;
  if(periodo==='todos'){inicio.value='';fim.value='';}
  else if(periodo!=='personalizado'){
    const hoje=new Date(),base=new Date(hoje);base.setDate(base.getDate()-(periodo==='7'?6:periodo==='30'?29:0));
    const atual=atlasMovDiaISO(hoje);
    inicio.value=periodo==='mes'?atual.slice(0,8)+'01':atlasMovDiaISO(base);
    fim.value=atual;
  }
  atlasMovMudouFiltro();
}
function atlasMovLimparTodos(){
  for(const nome of Object.keys(atlasMovSelecoes)){atlasMovSelecoes[nome].clear();atlasMovDesenharMulti(nome);}
  for(const id of ['atlasMovBusca']){const el=document.getElementById(id);if(el)el.value='';}
  const periodo=document.getElementById('atlasMovPeriodo');if(periodo)periodo.value='todos';
  const ordem=document.getElementById('atlasMovOrdenacao');if(ordem)ordem.value='data_desc';
  const sentido=document.getElementById('atlasMovSentido');if(sentido)sentido.value='ambas';
  document.querySelectorAll('#atlasMovimentacoesCard .atlas-mov-multi-search').forEach(x=>x.value='');
  document.querySelectorAll('#atlasMovimentacoesCard .atlas-mov-multi-popup').forEach(x=>x.hidden=true);
  atlasMovAtualizarPeriodo();
}
// Sem tipo marcado: consulta geral de bens (um registro por patrimônio).
// HISTORICO ou tipos de evento: consulta a movimentações. Uma seleção pode
// combinar cadastro e eventos, sem repetir o cadastro de um mesmo bem.
function atlasMovIncluiCadastro(){
  const t=atlasMovSelecoes.tipos;
  return !t.size || t.has('CADASTRO');
}
function atlasMovIncluiHistorico(){
  const t=atlasMovSelecoes.tipos;
  return t.has('HISTORICO')||['ENVIO','RECEBIMENTO','TRANSFERENCIA','BAIXA','OUTROS'].some(x=>t.has(x));
}
function atlasMovFontesSelecionadas(){
  const t=atlasMovSelecoes.tipos;
  const cadastro=atlasMovIncluiCadastro()?atlasMovCadastroDados:[];
  const historico=atlasMovIncluiHistorico()?atlasMovDados.filter(m=>{
    if(t.has('HISTORICO'))return m.origem_registro!=='PATRIMONIO_BAIXADO'||t.has('BAIXA');
    return t.has(atlasMovTipoRegistro(m));
  }):[];
  return [...cadastro,...historico];
}
function atlasMovPovoarFiltros(){
  const anteriores=Object.fromEntries(Object.entries(atlasMovSelecoes).map(([k,v])=>[k,new Set(v)]));
  const pessoas=new Map(),categorias=new Map(),estados=new Map();
  for(const p of patrimonios){
    for(const nome of [p.responsavel,p.usuario_cadastro]){
      const n=String(nome||'').trim();if(n)pessoas.set(n.toLocaleLowerCase('pt-BR'),n);
    }
    const tipo=String(p.tipo_item||'').trim();if(tipo)categorias.set(tipo.toUpperCase(),tipo);
    const stat=atlasMovStatusFiltro(p);estados.set(stat,atlasMovStatusLabel(stat));
  }
  for(const m of atlasMovDados){
    for(const nome of atlasMovParticipantes(m)){
      const n=nome.trim();if(n)pessoas.set(n.toLocaleLowerCase('pt-BR'),n);
    }
    const stat=atlasMovStatusFiltro(m);estados.set(stat,atlasMovStatusLabel(stat));
  }
  const ordenar=(a,b)=>a.texto.localeCompare(b.texto,'pt-BR');
  atlasMovOpcoes.funcionarios=[...pessoas.values()].map(n=>({valor:n,texto:n})).sort(ordenar);
  // Todas as obras autorizadas, não apenas as que já possuem movimentação.
  atlasMovOpcoes.obras=obras.map(o=>({valor:String(o.id),texto:[o.codigo_obra||o.codigo_sienge||'',o.nome||''].filter(Boolean).join(' - ')||String(o.id)})).sort(ordenar);
  atlasMovOpcoes.tipos=[
    ['CADASTRO','Todos os patrimônios (cadastro)'],
    ['HISTORICO','Histórico de movimentações'],
    ['ENVIO','Envio'],['RECEBIMENTO','Recebimento'],
    ['TRANSFERENCIA','Transferência'],['BAIXA','Patrimônio baixado'],
    ['OUTROS','Outros registros']
  ].map(([valor,texto])=>({valor,texto}));
  atlasMovOpcoes.status=[...estados.entries()].map(([valor,texto])=>({valor,texto})).sort(ordenar);
  atlasMovOpcoes.categorias=[...categorias.entries()].map(([valor,texto])=>({valor,texto})).sort(ordenar);
  Object.keys(atlasMovOpcoes).forEach(k=>{
    atlasMovSelecoes[k]=new Set([...anteriores[k]].filter(v=>atlasMovOpcoes[k].some(o=>String(o.valor)===v)));
    atlasMovDesenharMulti(k);
  });
}
function atlasMovVisiveis(){
  const q=(document.getElementById('atlasMovBusca')?.value||'').trim().toLocaleLowerCase('pt-BR');
  const {obras:obrasSel,funcionarios:funcSel,tipos:tipoSel,status:statusSel,categorias:catSel}=atlasMovSelecoes;
  const sentido=document.getElementById('atlasMovSentido')?.value||'ambas';
  const inicio=document.getElementById('atlasMovDataInicio')?.value||'';
  const fim=document.getElementById('atlasMovDataFim')?.value||'';
  const autorizadas=new Set(obras.map(o=>String(o.id)));
  const usuario=usuarioAtualRelatoriosBDR(),owner=Number(usuario?.id)===1&&usuario?.owner_sistema===true;
  const lista=atlasMovFontesSelecionadas().filter(m=>{
    const origem=String(m.obra_origem_id??''),destino=String(m.obra_destino_id??'');
    // Patrimônios sem obra podem ser consultados pelo OWNER; outros usuários
    // continuam restritos às obras autorizadas, inclusive com RLS.
    if(!autorizadas.has(origem)&&!autorizadas.has(destino)&&!(owner&&m.origem_registro==='CADASTRO_PATRIMONIAL'))return false;
    if(!owner&&([origem,destino].includes('22')||[origem,destino].includes('33')))return false;
    if(obrasSel.size&&!(sentido!=='destino'&&obrasSel.has(origem))&&!(sentido!=='origem'&&obrasSel.has(destino)))return false;
    if(funcSel.size&&!atlasMovParticipantes(m).some(v=>[...funcSel].some(f=>v.toLocaleLowerCase('pt-BR')===f.toLocaleLowerCase('pt-BR'))))return false;
    if(tipoSel.size&&!tipoSel.has(atlasMovTipoRegistro(m))&&!(tipoSel.has('HISTORICO')&&m.origem_registro!=='CADASTRO_PATRIMONIAL'&&m.origem_registro!=='PATRIMONIO_BAIXADO'))return false;
    if(statusSel.size&&!statusSel.has(atlasMovStatusFiltro(m)))return false;
    if(catSel.size){
      const p=atlasMovPatrimoniosPorId.get(String(m.patrimonio_id));
      if(!catSel.has(String(p?.tipo_item||'').trim().toUpperCase()))return false;
    }
    const data=m.origem_registro==='PATRIMONIO_BAIXADO'&&atlasMovDataEvento(m)?String(atlasMovDataEvento(m)).slice(0,10):atlasMovDataISO(atlasMovDataEvento(m));
    if((inicio||fim)&&(!data||(inicio&&data<inicio)||(fim&&data>fim)))return false;
    if(!q)return true;
    return [atlasMovPat(m.patrimonio_id,m),atlasMovDescricao(m),atlasMovObra(m.obra_origem_id),atlasMovObra(m.obra_destino_id),m.pedido_id,m.codigo_remessa,...atlasMovParticipantes(m),m.status,m.observacao,m.observacao_recebimento,m.marca,m.modelo,m.codigo_antigo,m.numero_serie,m.placa,m.localizacao,m.departamento,atlasMovTipoLabel(m)].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q));
  });
  const ordem=document.getElementById('atlasMovOrdenacao')?.value||'data_desc';
  lista.sort((a,b)=>{
    if(ordem==='patrimonio')return atlasMovCodigo(a).localeCompare(atlasMovCodigo(b),'pt-BR');
    if(ordem==='responsavel')return atlasMovResponsavel(a).localeCompare(atlasMovResponsavel(b),'pt-BR');
    if(ordem==='descricao')return atlasMovDescricao(a).localeCompare(atlasMovDescricao(b),'pt-BR');
    if(ordem==='origem')return (a.origem_registro==='CADASTRO_PATRIMONIAL'?(atlasMovOrigemRegistrada(a)||''):atlasMovObra(a.obra_origem_id)).localeCompare(b.origem_registro==='CADASTRO_PATRIMONIAL'?(atlasMovOrigemRegistrada(b)||''):atlasMovObra(b.obra_origem_id),'pt-BR');
    if(ordem==='destino')return atlasMovObra(a.obra_destino_id).localeCompare(atlasMovObra(b.obra_destino_id),'pt-BR');
    if(ordem==='tipo')return atlasMovTipoLabel(a).localeCompare(atlasMovTipoLabel(b),'pt-BR');
    if(ordem==='status')return atlasMovStatusLabel(a.status).localeCompare(atlasMovStatusLabel(b.status),'pt-BR');
    const av=atlasMovDataEvento(a),bv=atlasMovDataEvento(b);
    const ta=av?new Date(String(av).replace(' ','T')).getTime():null,tb=bv?new Date(String(bv).replace(' ','T')).getTime():null;
    if(ta==null||Number.isNaN(ta))return tb==null||Number.isNaN(tb)?0:1;
    if(tb==null||Number.isNaN(tb))return -1;
    return ordem==='data_asc'?ta-tb:tb-ta;
  });
  return lista;
}
function atlasMovResumo(lista){
  const pessoas=new Set(),obrasUsadas=new Set(),patrimoniosUsados=new Set();
  const autorizadas=new Set(obras.map(o=>String(o.id)));
  for(const m of lista){
    const responsavel=atlasMovResponsavel(m);if(responsavel!=='—')pessoas.add(responsavel.trim().toLocaleLowerCase('pt-BR'));
    for(const id of [m.obra_origem_id,m.obra_destino_id])if(id!=null&&autorizadas.has(String(id)))obrasUsadas.add(String(id));
    if(m.patrimonio_id!=null)patrimoniosUsados.add('id:'+String(m.patrimonio_id));
    else if(m.codigo_qr)patrimoniosUsados.add('qr:'+String(m.codigo_qr));
  }
  return {total:lista.filter(m=>m.origem_registro!=='PATRIMONIO_BAIXADO').length,
    patrimonios:patrimoniosUsados.size,participantes:pessoas.size,obras:obrasUsadas.size,
    baixados:lista.filter(m=>atlasMovStatusNormalizado(m.status)==='BAIXADO').length};
}
function atlasMovFiltroDescricao(){
  const v=id=>document.getElementById(id)?.value||'';
  const lista=[atlasMovIncluiCadastro()&&!atlasMovIncluiHistorico()?'Consulta: todos os patrimônios':atlasMovIncluiHistorico()&&!atlasMovIncluiCadastro()?'Consulta: histórico de movimentações':'Consulta: patrimônios e histórico',v('atlasMovDataInicio')||v('atlasMovDataFim')?`Período: ${v('atlasMovDataInicio')||'início'} até ${v('atlasMovDataFim')||'hoje'}`:'Todo o período'];
  for(const [nome,titulo] of [['obras','Obras'],['funcionarios','Funcionários'],['tipos','Tipos'],['status','Status'],['categorias','Categorias']]){
    const opts=atlasMovOpcoes[nome].filter(o=>atlasMovSelecoes[nome].has(String(o.valor)));
    if(opts.length)lista.push(titulo+': '+opts.map(o=>o.texto).join(', '));
  }
  if(v('atlasMovSentido')&&v('atlasMovSentido')!=='ambas')lista.push('Obra no '+v('atlasMovSentido'));
  if(v('atlasMovBusca'))lista.push('Busca: '+v('atlasMovBusca'));
  return lista.join(' · ');
}
function atlasAtualizarCabecalhoMov(lista){
  const resumo=atlasMovResumo(lista),set=(id,t)=>{const el=document.getElementById(id);if(el)el.textContent=t;};
  set('bdrMovEmitido','Emitido por: '+atlasMovEmitente());set('bdrMovEmissao','Emissão: '+new Date().toLocaleString('pt-BR'));set('bdrMovFiltros','Filtros: '+atlasMovFiltroDescricao());
  set('atlasMovContador',`${lista.length} registro${lista.length===1?'':'s'} encontrado${lista.length===1?'':'s'}`);
  const cadastro=atlasMovIncluiCadastro(),historico=atlasMovIncluiHistorico();
  set('atlasMovColData',cadastro&&!historico?'Data cadastro':'Data/Hora');
  set('atlasMovColTipo',cadastro&&!historico?'Marca / Modelo · Valor':'Movimentação');
  set('atlasMovColOrigem',cadastro&&!historico?'Origem registrada':'Origem');
  set('atlasMovColDestino',cadastro&&!historico?'Obra atual':'Destino');
  set('atlasMovColResponsavel',cadastro&&!historico?'Responsável / Baixa':'Realizado por');
  const formatar=x=>x?x.split('-').reverse().join('/'):'';
  const di=document.getElementById('atlasMovDataInicio')?.value||'',df=document.getElementById('atlasMovDataFim')?.value||'';
  set('atlasMovResumoPeriodo',di||df?`Período: ${formatar(di)||'início'} a ${formatar(df)||'hoje'}`:'Período: todo o histórico');
  const el=document.getElementById('bdrMovIndicadores');if(el)el.innerHTML=[
    ['fa-arrow-right-arrow-left',cadastro&&!historico?'Registros':'Movimentações',resumo.total],
    ['fa-cube','Patrimônios',resumo.patrimonios],
    ['fa-users','Funcionários',resumo.participantes],
    ['fa-building','Obras (envolvidas)',resumo.obras]
  ].map(([ico,k,v])=>`<div class="atlas-mov-summary-stat"><i class="fa-solid ${ico}" aria-hidden="true"></i><div><small>${atlasMovEsc(k)}</small><strong>${v.toLocaleString('pt-BR')}</strong></div></div>`).join('');
}
function atlasMovOrdenarColuna(valor){
  const el=document.getElementById('atlasMovOrdenacao');if(!el)return;
  el.value=valor;
  atlasMovMudouFiltro();
}
// Salto direto para qualquer página sem percorrer páginas intermediárias.
function atlasMovIrParaPagina(pagina){
  const nova=Number(pagina);
  if(!Number.isSafeInteger(nova)||nova<1||nova===atlasMovPagina)return;
  atlasMovPagina=nova;
  atlasRenderMov();
  const posicionar=()=>{
    const resultados=document.querySelector('#atlasMovimentacoesCard .atlas-mov-results');
    if(!resultados)return;
    const y=Math.max(0,Math.round(resultados.getBoundingClientRect().top+window.scrollY-8));
    const altura=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);
    const falta=Math.max(0,Math.ceil(y+window.innerHeight-altura+2));
    if(falta){const padding=parseFloat(getComputedStyle(resultados).paddingBottom)||0;resultados.style.paddingBottom=`${padding+falta}px`;}
    // Somente documento do módulo: não move o cabeçalho do Shell.
    window.scrollTo({left:window.scrollX,top:y,behavior:'instant'});
  };
  posicionar();requestAnimationFrame(posicionar);
}
function atlasMovMudarPagina(direcao){if(Number.isFinite(direcao)&&direcao)atlasMovIrParaPagina(atlasMovPagina+(direcao>0?1:-1));}
function atlasRenderMov(){
  const painelResultados=document.querySelector('#atlasMovimentacoesCard .atlas-mov-results');
  if(painelResultados) painelResultados.style.paddingBottom='';
  const corpo=document.getElementById('atlasMovCorpo');if(!corpo)return;
  const lista=atlasMovVisiveis(),paginas=Math.max(1,Math.ceil(lista.length/ATLAS_MOV_POR_PAGINA));
  atlasMovPagina=Math.min(Math.max(1,atlasMovPagina),paginas);
  const ini=(atlasMovPagina-1)*ATLAS_MOV_POR_PAGINA;
  corpo.innerHTML=lista.slice(ini,ini+ATLAS_MOV_POR_PAGINA).map(m=>{
    const tipo=atlasMovTipoRegistro(m),status=atlasMovStatusFiltro(m);
    const eCadastro=m.origem_registro==='CADASTRO_PATRIMONIAL';
    const classe=({ENVIADO:'enviado',RECEBIDO:'recebido',TRANSFERIDO:'transferido',RECEBIDA_DIVERGENCIA:'divergencia',EM_TRANSITO:'transito',CANCELADO:'cancelado',BAIXADO:'baixado',AGUARDANDO_RECEBIMENTO:'transito',ESTOQUE:'recebido',DISPONIVEL:'recebido',EM_USO:'enviado',MANUTENCAO:'transito'})[status]||'outro';
    const data=atlasMovDataExibicao(m);
    const partes=data!=='—'?data.replace(', ',' ').split(' '):[];
    const soCadastro=atlasMovIncluiCadastro()&&!atlasMovIncluiHistorico();
    const p=atlasMovPatrimoniosPorId.get(String(m.patrimonio_id))||m;
    const patAntigo=String(p.codigo_antigo||'').trim();
    const valor=atlasMovValorPatrimonio(p);
    const identificacao=[p.marca,p.modelo].filter(x=>String(x||'').trim()).join(' / ');

    const responsavel=atlasMovResponsavel(m),referencia=atlasMovTexto(m.codigo_remessa||m.pedido_id);
    const baixaAtual=eCadastro&&status==='BAIXADO';
    const identificacaoBaixa=baixaAtual?atlasMovBaixaIdentificacao(m):null;
    const baixaAuditada=identificacaoBaixa?.origem==='MOVIMENTACAO';
    const baixaNoCadastro=identificacaoBaixa?.origem==='CADASTRO_INICIAL';
    const erroBaixa=identificacaoBaixa?.origem==='ERRO';
    const cadastrador=atlasMovCadastroUsuario(m);
    const nomeExibido=baixaAtual?(identificacaoBaixa.nome||(baixaAuditada?'Baixa sem autor registrado':erroBaixa?'Auditoria indisponível':'Cadastrador não identificado')):responsavel;
    const infoBaixa=baixaAtual
      ?(baixaAuditada
        ?`<small class="atlas-mov-auditoria-baixa" title="Autor da alteração de status conforme a movimentação registrada">Baixa realizada · Cadastro: ${atlasMovEsc(cadastrador||'não informado')}</small>`
        :baixaNoCadastro
          ?`<small class="atlas-mov-auditoria-baixa" title="Identificação pelo cadastro; não existe movimentação separada de baixa">BAIXADO no cadastro · sem baixa separada</small>`
          :`<small class="atlas-mov-auditoria-baixa" title="Não foi possível consultar o histórico da baixa">${cadastrador?'Nome do cadastrador · auditoria indisponível':'Consulta de baixas indisponível'}</small>`):'';
    const dataBaixa=baixaAtual
      ?`<small class="atlas-mov-auditoria-data" title="${baixaAuditada?'Data da movimentação de baixa':baixaNoCadastro?'Data do cadastro (sem evento separado)':'Não foi possível consultar a auditoria'}">${atlasMovEsc(baixaAuditada?'Baixa: '+atlasMovDataOperacao(identificacaoBaixa.data):baixaNoCadastro?'Cadastro: '+atlasMovDataOperacao(identificacaoBaixa.data):'Baixa: auditoria indisponível')}</small>`:'';
    const foto=atlasMovFoto(m);
    const mid=Number(m.id);
    const origemTexto=eCadastro?(atlasMovOrigemRegistrada(m)||'Sem origem registrada'):atlasMovObra(m.obra_origem_id);
    const destinoTexto=eCadastro?atlasMovObra(p.obra_id):atlasMovObra(m.obra_destino_id);
    const icone=(tipo==='CADASTRO'?'fa-box':tipo==='RECEBIMENTO'?'fa-arrow-down':tipo==='ENVIO'?'fa-arrow-up':tipo==='TRANSFERENCIA'?'fa-arrow-right-arrow-left':tipo==='BAIXA'?'fa-arrow-down-long':'fa-box');
    const celTipo=eCadastro && soCadastro
      ?`<span class="atlas-mov-identificacao" title="${atlasMovEsc(identificacao||'Marca/modelo não informados')}">${atlasMovEsc(identificacao||'Não informado')}</span><small class="atlas-mov-valor">${valor===null?'Valor não informado':atlasMovEsc(atlasMovMoeda(valor))}</small>`
      :`<span class="atlas-mov-tipo atlas-mov-tipo-${tipo.toLowerCase()}"><i class="fa-solid ${icone}" aria-hidden="true"></i>${atlasMovEsc(atlasMovTipoLabel(m))}</span>`;
    return `<tr class="${eCadastro?'atlas-mov-linha-cadastro':''}">
      <td class="atlas-mov-data">${partes.length>1?`<i class="fa-regular fa-calendar" aria-hidden="true"></i><span class="atlas-mov-data-inline" title="${atlasMovEsc(data)}">${atlasMovEsc(partes[0])} <small>· ${atlasMovEsc(partes.slice(1).join(' '))}</small></span>`:'<span title="Data de evento não registrada">—</span>'}</td>
      <td><span class="atlas-mov-codigo" title="${atlasMovEsc(referencia)}">${atlasMovEsc(atlasMovCodigo(m))}</span>${eCadastro&&patAntigo?`<small class="atlas-mov-pat-antigo" title="Patrimônio antigo">Ant.: ${atlasMovEsc(patAntigo)}</small>`:''}</td>
      <td><div class="atlas-mov-item"><span class="atlas-mov-foto"><i class="fa-solid fa-box" aria-hidden="true"></i>${foto?`<img src="${atlasMovEsc(foto)}" loading="lazy" alt="" onerror="this.remove()">`:""}</span><span title="${atlasMovEsc(atlasMovDescricao(m))}">${atlasMovEsc(atlasMovDescricao(m))}</span></div></td>
      <td>${celTipo}</td>
      <td class="atlas-mov-obra" title="${atlasMovEsc(origemTexto)}">${atlasMovEsc(origemTexto)}</td>
      <td class="atlas-mov-obra" title="${atlasMovEsc(destinoTexto)}">${atlasMovEsc(destinoTexto)}</td>
      <td class="atlas-mov-pessoa" title="${atlasMovEsc(nomeExibido)}"><i class="fa-regular fa-user" aria-hidden="true"></i><span class="atlas-mov-pessoa-info">${atlasMovEsc(nomeExibido)}${infoBaixa}</span></td>
      <td><span class="atlas-mov-status atlas-mov-status-${classe}">${classe==='recebido'?'<i class="fa-regular fa-circle-check" aria-hidden="true"></i>':''}${atlasMovEsc(atlasMovStatusLabel(m.status))}</span>${dataBaixa}</td>
      <td class="atlas-mov-acoes"><button type="button" onclick="atlasMovAbrir(${Number.isFinite(mid)?mid:0})" title="${eCadastro?'Ver dados do patrimônio':'Ver detalhes da remessa '+atlasMovEsc(referencia)}" aria-label="Ver detalhes de ${atlasMovEsc(atlasMovCodigo(m))}"><i class="fa-regular fa-eye" aria-hidden="true"></i></button></td>
    </tr>`;
  }).join('')||'<tr><td class="atlas-mov-empty" colspan="9"><i class="fa-regular fa-folder-open" aria-hidden="true"></i> Nenhum registro encontrado para os filtros selecionados.</td></tr>';
  atlasAtualizarCabecalhoMov(lista);
  const faixa=document.getElementById('atlasMovFaixa');if(faixa)faixa.textContent=`Exibindo ${lista.length?ini+1:0}–${Math.min(ini+ATLAS_MOV_POR_PAGINA,lista.length)} de ${lista.length} registros`;
  atlasMovSincronizarPaginadores(lista.length);
  atlasMovSincronizarCabecalhoHorizontal();
}

function atlasMovAbrir(id){
  const m=[...atlasMovCadastroDados,...atlasMovDados].find(x=>Number(x.id)===Number(id));if(!m)return;
  const p=atlasMovPatrimoniosPorId.get(String(m.patrimonio_id))||m;
  const cadastro=m.origem_registro==='CADASTRO_PATRIMONIAL';
  const tipo=atlasMovTipoLabel(m);
  const campos=[
    {titulo:'Identificação do patrimônio',itens:[
      ['Patrimônio Atlas',atlasMovCodigo(m)],['Patrimônio antigo',p.codigo_antigo],
      ['Descrição',atlasMovDescricao(m)],['Categoria',p.tipo_item],['Marca',p.marca],['Modelo',p.modelo],
      ['Número de série',p.numero_serie],['Placa',p.placa],['Valor patrimonial',atlasMovValorPatrimonio(p)===null?'Não informado':atlasMovMoeda(atlasMovValorPatrimonio(p))],
      ['Situação atual',p.status?atlasMovStatusLabel(p.status):'—']
    ]},
    cadastro?{titulo:'Cadastro e localização atual',itens:[
      ['Primeira origem registrada',atlasMovOrigemRegistrada(m)||'Não identificada no histórico'],
      ['Obra atual',atlasMovObra(p.obra_id)],['Localização interna',m.localizacao||m.departamento],
      ['Responsável pelo bem',m.responsavel],['Cadastrado por',m.usuario_cadastro],['Data do cadastro',atlasMovData(atlasMovDataEvento(m))],
      ...(String(p.status||'').toUpperCase()==='BAIXADO'?(
        atlasMovAuditoriaBaixa(m)
          ?[['Baixa realizada por',atlasMovBaixaUsuario(m)||'Não identificado'],
            ['Data/hora da baixa',atlasMovDataOperacao(atlasMovBaixaData(m))],
            ['Justificativa da baixa',atlasMovAuditoriaBaixa(m)?.observacao||'Não registrada']]
          :atlasMovBaixaIdentificacao(m).origem==='CADASTRO_INICIAL'
            ?[['Identificação do status','BAIXADO no cadastro; sem alteração de status registrada'],
              ['Cadastrado por',atlasMovCadastroUsuario(m)||'Não informado'],
              ['Data/hora do cadastro',atlasMovDataOperacao(atlasMovCadastroData(m))],
              ['Fonte da identificação','Cadastro patrimonial; não há evento separado de baixa']]
            :[['Registro da baixa','Auditoria indisponível: conferir acesso ao histórico'],
              ['Cadastrador identificado',atlasMovCadastroUsuario(m)||'Não informado'],
              ['Nota de auditoria','Sem acesso ao evento de baixa, não é possível confirmar o executor.']]
      ):[])
    ]}:{titulo:'Operação e trajeto',itens:[
      ['Tipo de operação',tipo],['Situação do registro',atlasMovStatusLabel(m.status)],
      ['Realizado por',atlasMovResponsavel(m)],['Data/hora da operação',atlasMovDataExibicao(m)],
      ['Pedido / Remessa',m.codigo_remessa||m.pedido_id],
      ['Origem',atlasMovObra(m.obra_origem_id)],['Destino',atlasMovObra(m.obra_destino_id)],
      ['Motorista',m.motorista_nome],['Placa do transporte',m.veiculo_placa],
      ['Conferência',m.conferencia_status]
    ]},
    {titulo:'Trajeto entre obras (registros disponíveis)',itens:atlasMovPassagens(m)},
    ...(!cadastro?[{titulo:'Pessoas envolvidas',itens:[
      ['Solicitado por',m.solicitado_por],['Aprovado por',m.aprovado_por],['Separado por',m.separado_por],
      ['Enviado por',m.enviado_por],['Recebido por',m.recebido_por],['Responsável / usuário',m.responsavel||m.usuario]
    ]},{titulo:'Linha do tempo',itens:[
      ['Solicitação',m.data_solicitacao?atlasMovData(m.data_solicitacao):null],
      ['Aprovação',m.data_aprovacao?atlasMovData(m.data_aprovacao):null],
      ['Separação',m.data_separacao?atlasMovData(m.data_separacao):null],
      ['Envio',m.data_envio?atlasMovData(m.data_envio):null],
      ['Recebimento',m.data_recebimento?atlasMovData(m.data_recebimento):null]
    ]},{titulo:'Observações',itens:[
      ['Observação',m.observacao],['Observação do recebimento físico',m.observacao_recebimento],
      ['Nota de origem',m.origem_registro==='PATRIMONIO_BAIXADO'&&!atlasMovAuditoriaBaixa(m)
        ?(atlasMovErroAuditoriaBaixas?'Auditoria de baixa indisponível.':'BAIXADO no cadastro; cadastrador e data vêm do registro patrimonial, sem evento separado de baixa.'):null]
    ]}]:[])
  ];
  const detalhes=document.getElementById('atlasMovDetalhes'),dlg=document.getElementById('atlasMovDialog');if(!detalhes||!dlg)return;
  detalhes.innerHTML=campos.map(grupo=>{
    const itens=grupo.itens.filter(([nome,v])=>v!==null&&v!==undefined&&String(v).trim()!==''&&String(v)!=='—');
    if(!itens.length)return '';
    return `<section class="atlas-mov-detail-group"><h4>${atlasMovEsc(grupo.titulo)}</h4><div class="atlas-mov-detail-grid">${itens.map(([nome,v])=>`<div class="atlas-mov-detail"><small>${atlasMovEsc(nome)}</small><strong>${atlasMovEsc(v)}</strong></div>`).join('')}</div></section>`;
  }).join('');
  document.getElementById('atlasMovDialogTitulo').textContent=`${atlasMovCodigo(m)} · ${cadastro?'Cadastro patrimonial':tipo}`;
  if(!dlg.open)dlg.showModal();
}
function atlasMovEmitente(){const u=usuarioAtualRelatoriosBDR();return u?.nome||u?.nome_completo||u?.usuario||'Usuário não identificado';}
function atlasMovLinhas(lista){return lista.map(m=>[atlasMovDataExibicao(m),atlasMovCodigo(m),atlasMovDescricao(m),atlasMovTipoLabel(m),atlasMovObra(m.obra_origem_id),atlasMovObra(m.obra_destino_id),atlasMovResponsavel(m),atlasMovStatusLabel(m.status),m.codigo_remessa||m.pedido_id||'',m.solicitado_por||'',m.enviado_por||'',m.recebido_por||'',atlasMovData(m.data_envio),atlasMovData(m.data_recebimento),[m.observacao,m.observacao_recebimento].filter(Boolean).join(' | ')]);}
async function atlasExportarMovExcel(){
  if(!exigirPermissaoRelatoriosBDR('RELATORIOS_EXPORTAR'))return;
  const lista=atlasMovVisiveis();if(!lista.length){alert('Nenhuma movimentação para exportar.');return;}
  if(!window.ExcelJS){alert('A biblioteca ExcelJS não foi carregada. Verifique a conexão.');return;}
  const livro=new ExcelJS.Workbook();livro.creator='BDR Construart';livro.created=new Date();
  const aba=livro.addWorksheet('Movimentações',{views:[{state:'frozen',ySplit:8}]});
  const titulos=['Data/hora do registro','Patrimônio','Descrição do bem','Movimentação','Origem','Destino','Responsável','Status','Pedido / Remessa','Solicitado por','Enviado por','Recebido por','Envio registrado','Recebimento registrado','Observações'];
  for(const [n,valor] of [[1,'BDR CONSTRUART'],[2,'RELATÓRIO DE MOVIMENTAÇÕES PATRIMONIAIS'],[3,`Emitido por: ${atlasMovEmitente()}  |  Emissão: ${new Date().toLocaleString('pt-BR',{timeZone:'America/Cuiaba'})}`],[4,'Filtros: '+atlasMovFiltroDescricao()]]){aba.mergeCells(n,1,n,15);aba.getCell(n,1).value=valor;}
  const r=atlasMovResumo(lista);aba.mergeCells(5,1,5,15);aba.getCell(5,1).value=`Movimentações: ${r.total}   |   Funcionários participantes: ${r.participantes}   |   Obras envolvidas: ${r.obras}`;
  aba.mergeCells(6,1,6,15);aba.getCell(6,1).value='Datas de recebimento: momento registrado no Atlas. Datas históricas informadas posteriormente constam nas observações.';
  const cab=aba.getRow(8);cab.values=titulos;cab.height=30;
  for(const registro of atlasMovLinhas(lista))aba.addRow(registro);
  aba.columns.forEach((c,i)=>c.width=[22,20,40,20,32,32,28,21,25,25,25,25,22,22,55][i]);
  for(const n of [1,2]){const c=aba.getCell(n,1);c.font={bold:true,size:n===1?18:13,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF11396D'}};c.alignment={vertical:'middle'};aba.getRow(n).height=31;}
  for(const n of [3,4,5,6]){aba.getCell(n,1).font={size:10,color:{argb:'FF334155'}};aba.getRow(n).height=22;}
  cab.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0C3678'}};c.font={bold:true,color:{argb:'FFFFFFFF'}};c.alignment={vertical:'middle',wrapText:true};});
  for(let i=9;i<=aba.rowCount;i++){const row=aba.getRow(i);row.height=32;row.eachCell(c=>{c.alignment={vertical:'middle',wrapText:true};c.border={bottom:{style:'hair',color:{argb:'FFDFE8F3'}}};if(i%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F7FC'}};});}
  aba.autoFilter={from:{row:8,column:1},to:{row:8,column:15}};
  aba.pageSetup={paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  const buffer=await livro.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download='BDR_Movimentacoes_Patrimoniais.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function atlasExportarMovCSV(){return atlasExportarMovExcel();}
function atlasImprimirMovimentacoes(){
  if(!exigirPermissaoRelatoriosBDR('RELATORIOS_EXPORTAR','Você não tem permissão para imprimir relatórios.'))return;
  const lista=atlasMovVisiveis();if(!lista.length){alert('Nenhuma movimentação encontrada para impressão.');return;}
  const resumo=atlasMovResumo(lista),colunas=['Data/hora','Patrimônio','Descrição','Movimentação','Origem','Destino','Responsável','Status','Pedido/Remessa'];
  const tabela='<table><thead><tr>'+colunas.map(v=>`<th>${atlasMovEsc(v)}</th>`).join('')+'</tr></thead><tbody>'+lista.map(m=>{
    const linha=[atlasMovDataExibicao(m),atlasMovCodigo(m),atlasMovDescricao(m),atlasMovTipoLabel(m),atlasMovObra(m.obra_origem_id),atlasMovObra(m.obra_destino_id),atlasMovResponsavel(m),atlasMovStatusLabel(m.status),m.codigo_remessa||m.pedido_id||''];
    return '<tr>'+linha.map(v=>`<td>${atlasMovEsc(v)}</td>`).join('')+'</tr>';
  }).join('')+'</tbody></table>';
  const css=`@page{size:A3 landscape;margin:11mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:#112747;margin:0}.brand{background:#0c3678;color:white;padding:15px 20px;border-radius:5px}.brand strong{font-size:19px}.brand small{display:block;margin-top:4px;letter-spacing:1px}.title{font-weight:800;font-size:18px;margin:18px 0 8px}.meta{display:flex;flex-wrap:wrap;gap:10px 25px;border-bottom:1px solid #d8e4f3;padding-bottom:10px}.summary{display:flex;gap:32px;padding:14px 0}.summary strong{font-size:15px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{font-size:9px;padding:7px 5px;vertical-align:top;text-align:left;border-bottom:1px solid #dbe5f0;overflow-wrap:anywhere}th{color:#0c3678;background:#edf3fb;font-weight:bold}tr:nth-child(even){background:#f8fbff}thead{display:table-header-group}tr{break-inside:avoid}.foot{font-size:9px;color:#64748b;padding:14px 0;line-height:1.5}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;
  const html=`<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>BDR Construart - Movimentações</title><style>${css}</style></head><body><div class="brand"><strong>BDR CONSTRUART</strong><small>ATLAS · GESTÃO PATRIMONIAL</small></div><div class="title">Relatório de Movimentações Patrimoniais</div><div class="meta"><span>Emitido por: ${atlasMovEsc(atlasMovEmitente())}</span><span>Emissão: ${atlasMovEsc(new Date().toLocaleString('pt-BR',{timeZone:'America/Cuiaba'}))}</span><span>Filtros: ${atlasMovEsc(atlasMovFiltroDescricao())}</span></div><div class="summary"><span>Movimentações: <strong>${resumo.total}</strong></span><span>Funcionários: <strong>${resumo.participantes}</strong></span><span>Obras: <strong>${resumo.obras}</strong></span></div>${tabela}<div class="foot">Dados conforme registros disponíveis e filtros autorizados. Patrimônios baixados sem data de evento refletem apenas sua situação atual. Recebimentos históricos informados posteriormente devem ser consultados nas observações.</div></body></html>`;
  // Impressão no diálogo do navegador, sem navegar ou abrir aba about:blank.
  const frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0';document.body.appendChild(frame);
  try{
    const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();
    const remover=()=>{if(frame.isConnected)frame.remove();};
    frame.contentWindow.addEventListener('afterprint',remover,{once:true});
    setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch(e){remover();alert('Não foi possível abrir a impressão: '+e.message);}},250);
    setTimeout(remover,120000);
  }catch(e){frame.remove();alert('Não foi possível preparar a impressão: '+e.message);}
}

/* Cadastro: Excel/impressão com a mesma identidade visual histórica,
   sem substituir os modelos de exportação de movimentações já aprovados. */
function atlasMovCadastroLinhas(lista){
  return lista.map(m=>{
    const p=atlasMovPatrimoniosPorId.get(String(m.patrimonio_id))||m;
    return [atlasMovDataExibicao(m),atlasMovCodigo(m),atlasMovDescricao(m),
      atlasMovTipoLabel(m),String(p.tipo_item||'—'),atlasMovObra(m.obra_origem_id),
      m.origem_registro==='CADASTRO_PATRIMONIAL'?atlasMovTexto(m.localizacao||m.departamento):atlasMovObra(m.obra_destino_id),
      atlasMovResponsavel(m),atlasMovStatusLabel(m.status),p.marca||'—',p.modelo||'—',p.numero_serie||p.placa||'—',
      p.valor_bem??p.valor_aquisicao??'',m.codigo_remessa||m.pedido_id||''];
  });
}
async function atlasExportarCadastroExcel(){
  if(!exigirPermissaoRelatoriosBDR('RELATORIOS_EXPORTAR'))return;
  const lista=atlasMovVisiveis();if(!lista.length){alert('Nenhum patrimônio encontrado para exportar.');return;}
  if(!window.ExcelJS){alert('A biblioteca ExcelJS não foi carregada.');return;}
  const livro=new ExcelJS.Workbook();livro.creator='BDR Construart';livro.created=new Date();
  const aba=livro.addWorksheet('Consulta patrimonial',{views:[{state:'frozen',ySplit:8}]});
  const titulos=['Data de cadastro/evento','Patrimônio','Descrição do bem','Tipo de registro','Categoria','Obra / Origem','Localização / Destino','Pessoa / fonte da baixa','Status','Marca','Modelo','Série / Placa','Valor (R$)','Pedido / Remessa'];
  for(const [n,texto] of [[1,'BDR CONSTRUART'],[2,'RELATÓRIO PATRIMONIAL'],[3,`Emitido por: ${atlasMovEmitente()}  |  Emissão: ${new Date().toLocaleString('pt-BR',{timeZone:'America/Cuiaba'})}`],[4,'Filtros: '+atlasMovFiltroDescricao()]]){
    aba.mergeCells(n,1,n,14);aba.getCell(n,1).value=texto;
  }
  const r=atlasMovResumo(lista);aba.mergeCells(5,1,5,14);aba.getCell(5,1).value=`Registros: ${lista.length}   |   Patrimônios: ${r.patrimonios}   |   Responsáveis: ${r.participantes}   |   Obras: ${r.obras}`;
  aba.mergeCells(6,1,6,14);aba.getCell(6,1).value='Bens sem movimentação permanecem na consulta patrimonial. Eventos aparecem somente quando selecionados.';
  const cab=aba.getRow(8);cab.values=titulos;cab.height=30;
  atlasMovCadastroLinhas(lista).forEach(l=>aba.addRow(l));
  aba.columns.forEach((col,i)=>col.width=[23,22,40,22,23,32,32,27,19,21,21,19,18,22][i]);
  for(const n of [1,2]){const x=aba.getCell(n,1);x.font={bold:true,size:n===1?18:13,color:{argb:'FFFFFFFF'}};x.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF11396D'}};aba.getRow(n).height=31;}
  for(const n of [3,4,5,6]){aba.getCell(n,1).font={size:10,color:{argb:'FF334155'}};aba.getRow(n).height=22;}
  cab.eachCell(x=>{x.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0C3678'}};x.font={bold:true,color:{argb:'FFFFFFFF'}};x.alignment={vertical:'middle',wrapText:true};});
  for(let i=9;i<=aba.rowCount;i++){const row=aba.getRow(i);row.height=30;row.eachCell(x=>{x.alignment={vertical:'middle',wrapText:true};x.border={bottom:{style:'hair',color:{argb:'FFDFE8F3'}}};if(i%2===0)x.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F7FC'}};});}
  aba.autoFilter={from:{row:8,column:1},to:{row:8,column:14}};
  aba.pageSetup={paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  const buffer=await livro.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download='BDR_Relatorio_Patrimonial.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function atlasImprimirCadastro(){
  if(!exigirPermissaoRelatoriosBDR('RELATORIOS_EXPORTAR','Você não tem permissão para imprimir relatórios.'))return;
  const lista=atlasMovVisiveis();if(!lista.length){alert('Nenhum patrimônio encontrado para impressão.');return;}
  const resumo=atlasMovResumo(lista),colunas=['Data','Patrimônio','Descrição','Registro','Obra / Origem','Local / Destino','Responsável','Status'];
  const tabela='<table><thead><tr>'+colunas.map(x=>`<th>${atlasMovEsc(x)}</th>`).join('')+'</tr></thead><tbody>'+atlasMovCadastroLinhas(lista).map(x=>{
    const a=[x[0],x[1],x[2],x[3],x[5],x[6],x[7],x[8]];
    return '<tr>'+a.map(v=>`<td>${atlasMovEsc(v)}</td>`).join('')+'</tr>';
  }).join('')+'</tbody></table>';
  const css=`@page{size:A3 landscape;margin:11mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:#112747;margin:0}.brand{background:#0c3678;color:white;padding:15px 20px;border-radius:5px}.brand strong{font-size:19px}.brand small{display:block;margin-top:4px;letter-spacing:1px}.title{font-weight:800;font-size:18px;margin:18px 0 8px}.meta{display:flex;flex-wrap:wrap;gap:10px 25px;border-bottom:1px solid #d8e4f3;padding-bottom:10px}.summary{display:flex;gap:32px;padding:14px 0}.summary strong{font-size:15px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{font-size:9px;padding:7px 5px;vertical-align:top;text-align:left;border-bottom:1px solid #dbe5f0;overflow-wrap:anywhere}th{color:#0c3678;background:#edf3fb;font-weight:bold}tr:nth-child(even){background:#f8fbff}thead{display:table-header-group}tr{break-inside:avoid}.foot{font-size:9px;color:#64748b;padding:14px 0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;
  const html=`<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>BDR Construart - Patrimônios</title><style>${css}</style></head><body><div class="brand"><strong>BDR CONSTRUART</strong><small>ATLAS · GESTÃO PATRIMONIAL</small></div><div class="title">Relatório Patrimonial</div><div class="meta"><span>Emitido por: ${atlasMovEsc(atlasMovEmitente())}</span><span>Emissão: ${atlasMovEsc(new Date().toLocaleString('pt-BR',{timeZone:'America/Cuiaba'}))}</span><span>Filtros: ${atlasMovEsc(atlasMovFiltroDescricao())}</span></div><div class="summary"><span>Registros: <strong>${lista.length}</strong></span><span>Patrimônios: <strong>${resumo.patrimonios}</strong></span><span>Obras: <strong>${resumo.obras}</strong></span></div>${tabela}<div class="foot">Situação e localização conforme cadastro patrimonial na data da emissão.</div></body></html>`;
  const frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0';document.body.appendChild(frame);
  try{const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();const remover=()=>{if(frame.isConnected)frame.remove();};frame.contentWindow.addEventListener('afterprint',remover,{once:true});setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch(e){remover();alert('Não foi possível abrir a impressão: '+e.message);}},250);setTimeout(remover,120000);}catch(e){frame.remove();alert('Não foi possível preparar a impressão: '+e.message);}
}


/* ===============================================================
   ATLAS | RELATÓRIO INTELIGENTE (consulta patrimonial / eventos)
   Somente leitura. Usa os mesmos filtros, autorizações e objetos
   de dados já consultados. Não modifica o modelo de conferência
   assinada nem a exportação de importação para o Sienge.
   =============================================================== */
function atlasMovValorPatrimonio(p){
  const valor=p?.valor_bem??p?.valor_aquisicao;
  if(valor===null||valor===undefined||String(valor).trim()==='')return null;
  const n=Number(valor);
  return Number.isFinite(n)?n:null;
}
function atlasMovMoeda(n){return n===null?'Não informado':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);}
function atlasMovModoRelatorio(){
  return atlasMovIncluiCadastro()&&atlasMovIncluiHistorico()?'misto':atlasMovIncluiHistorico()?'eventos':'cadastro';
}
function atlasMovDividirConsulta(){
  const lista=atlasMovVisiveis();
  return {lista,cadastros:lista.filter(x=>x.origem_registro==='CADASTRO_PATRIMONIAL'),eventos:lista.filter(x=>x.origem_registro!=='CADASTRO_PATRIMONIAL')};
}
function atlasMovIdentificacoesFiltro(){
  const selecionadas=atlasMovSelecoes.obras;
  const lista=(selecionadas.size?obras.filter(o=>selecionadas.has(String(o.id))):[])
    .map(o=>[o.codigo_obra||o.codigo_sienge,o.nome].filter(Boolean).join(' - '));
  return {texto:selecionadas.size?(lista.length<=3?lista.join(', '):`${lista.length} obras/setores selecionados`):'Todas as obras autorizadas',
    completo:lista.length>3?lista.join(' · '):''};
}
function atlasMovPeriodoFiltro(){
  const e=id=>document.getElementById(id)?.value||'';
  const i=e('atlasMovDataInicio'),f=e('atlasMovDataFim');
  const formatar=s=>s?s.split('-').reverse().join('/'):'Sem limite';
  return !i&&!f?'Todo o período':`${formatar(i)} a ${formatar(f)}`;
}
function atlasMovPeriodoEfetivo(lista){
  const datas=lista.map(x=>atlasMovDataISO(atlasMovDataEvento(x))).filter(Boolean).sort();
  return datas.length?`${datas[0].split('-').reverse().join('/')} a ${datas[datas.length-1].split('-').reverse().join('/')}`:'Não disponível nos registros';
}
function atlasMovTotalValor(cadastros){
  let total=0,qtd=0,sem=0;
  for(const m of cadastros){const p=atlasMovPatrimoniosPorId.get(String(m.patrimonio_id))||m;const valor=atlasMovValorPatrimonio(p);
    if(valor===null)sem++;else{total+=valor;qtd++;}}
  return {total,qtd,sem};
}
function atlasMovCabecalhoDocumento(lista,titulo){
  const obrasFiltro=atlasMovIdentificacoesFiltro(),periodo=atlasMovPeriodoFiltro(),efetivo=atlasMovPeriodoEfetivo(lista);
  const emitido=new Date().toLocaleString('pt-BR',{timeZone:'America/Cuiaba',dateStyle:'short',timeStyle:'medium'});
  const filtros=[...['funcionarios','tipos','status','categorias'].flatMap(nome=>{
    const selecionados=atlasMovOpcoes[nome].filter(o=>atlasMovSelecoes[nome].has(String(o.valor)));
    return selecionados.length?[`${({funcionarios:'Funcionários',tipos:'Tipos',status:'Status',categorias:'Categorias'})[nome]}: ${selecionados.map(o=>o.texto).join(', ')}`]:[];
  }),...(document.getElementById('atlasMovBusca')?.value.trim()?[`Busca: ${document.getElementById('atlasMovBusca').value.trim()}`]:[])];
  return `<header class="doc-top"><div class="doc-brand">BDR CONSTRUART</div><div class="doc-emissao">Emitido em: ${atlasMovEsc(emitido)}</div><h1>${atlasMovEsc(titulo)}</h1><div class="doc-rule"></div>
   <div class="doc-meta"><div><b>Obra(s)/setor(es):</b> ${atlasMovEsc(obrasFiltro.texto)}</div><div><b>Período filtrado:</b> ${atlasMovEsc(periodo)}</div>
   <div><b>Período efetivo dos registros:</b> ${atlasMovEsc(efetivo)}</div><div><b>Relatório emitido por:</b> ${atlasMovEsc(atlasMovEmitente())}</div></div>
   ${obrasFiltro.completo?`<div class="doc-obras"><b>Obras incluídas:</b> ${atlasMovEsc(obrasFiltro.completo)}</div>`:''}
   ${filtros.length?`<div class="doc-filtros"><b>Outros filtros:</b> ${atlasMovEsc(filtros.join(' · '))}</div>`:''}
  </header>`;
}
function atlasMovInventarioCabecalhos(){return ['Nº','Identificação Atlas','Patrimônio antigo','Descrição do bem','Tipo','Status','Marca / Modelo','Série / Placa','Valor (R$)','Origem registrada','Obra atual','Localização interna','Data cadastro','Cadastrado por','Autor / fonte da baixa','Data e origem'];}
function atlasMovInventarioLinha(m,idx){
  const p=atlasMovPatrimoniosPorId.get(String(m.patrimonio_id))||m;
  const v=atlasMovValorPatrimonio(p);
  const baixado=atlasMovStatusNormalizado(m.status)==='BAIXADO';
  const info=baixado?atlasMovBaixaIdentificacao(m):null;
  const fonte=info?.origem==='MOVIMENTACAO'?'Movimentação':info?.origem==='CADASTRO_INICIAL'?'Cadastro já BAIXADO':'Auditoria indisponível';
  return [idx+1,atlasMovCodigo(m),p.codigo_antigo||'',atlasMovDescricao(m),p.tipo_item||'',atlasMovStatusLabel(m.status),
    [p.marca,p.modelo].filter(Boolean).join(' / '),p.numero_serie||p.placa||'',v===null?'Não informado':atlasMovMoeda(v),
    atlasMovOrigemRegistrada(m)||'Não identificada',atlasMovObra(p.obra_id),m.localizacao||m.departamento||'',atlasMovData(atlasMovDataEvento(m)),atlasMovCadastroUsuario(m)||'',
    baixado?`${info.nome||'Não identificado'} (${fonte})`:'',baixado&&info.data?`${fonte}: ${atlasMovDataOperacao(info.data)}`:''];
}
function atlasMovEventosCabecalhos(){return ['Nº','Data / hora','Patrimônio','Descrição','Evento','Origem','Destino','Executor / fonte','Situação','Pedido / Remessa'];}
function atlasMovEventoLinha(m,idx){
  return [idx+1,atlasMovDataExibicao(m),atlasMovCodigo(m),atlasMovDescricao(m),atlasMovTipoLabel(m),
    atlasMovObra(m.obra_origem_id),atlasMovObra(m.obra_destino_id),atlasMovResponsavel(m),atlasMovStatusLabel(m.status),m.codigo_remessa||m.pedido_id||''];
}
function atlasMovTabelaDocumento(titulos,linhas,classe){
  return `<table class="${classe}"><thead><tr>${titulos.map(x=>`<th>${atlasMovEsc(x)}</th>`).join('')}</tr></thead><tbody>${linhas.map(l=>`<tr>${l.map(v=>`<td>${atlasMovEsc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function atlasMovDetalhamentoEvento(m){
  const p=atlasMovPatrimoniosPorId.get(String(m.patrimonio_id))||m;
  const celulas=[['Tipo',atlasMovTipoLabel(m)],['Situação',atlasMovStatusLabel(m.status)],['Patrimônio antigo',p.codigo_antigo],
    ['Origem',atlasMovObra(m.obra_origem_id)],['Destino',atlasMovObra(m.obra_destino_id)],
    ['Pedido/remessa',m.codigo_remessa||m.pedido_id],['Solicitado por',m.solicitado_por],['Aprovado por',m.aprovado_por],
    ['Separado por',m.separado_por],['Enviado por',m.enviado_por],['Recebido por',m.recebido_por],
    ['Solicitação',m.data_solicitacao?atlasMovData(m.data_solicitacao):null],
    ['Aprovação',m.data_aprovacao?atlasMovData(m.data_aprovacao):null],['Separação',m.data_separacao?atlasMovData(m.data_separacao):null],
    ['Envio',m.data_envio?atlasMovData(m.data_envio):null],['Recebimento',m.data_recebimento?atlasMovData(m.data_recebimento):null],
    ['Motorista',m.motorista_nome],['Placa do veículo',m.veiculo_placa],['Conferência',m.conferencia_status],
    ['Observações',m.observacao],['Observações recebimento',m.observacao_recebimento]]
    .filter(([k,v])=>v!==null&&v!==undefined&&String(v).trim()&&v!=='—');
  if(m.origem_registro==='PATRIMONIO_BAIXADO'){
    if(atlasMovAuditoriaBaixa(m)){
      celulas.push(['Baixa realizada por',atlasMovBaixaUsuario(m)||'Não identificado']);
      celulas.push(['Data/hora da baixa',atlasMovDataOperacao(atlasMovBaixaData(m))]);
      if(atlasMovAuditoriaBaixa(m)?.observacao)celulas.push(['Justificativa da baixa',atlasMovAuditoriaBaixa(m).observacao]);
    }else if(atlasMovBaixaIdentificacao(m).origem==='CADASTRO_INICIAL'){
      celulas.push(['Fonte do status','BAIXADO no cadastro; sem baixa separada registrada']);
      celulas.push(['Cadastrado por',atlasMovCadastroUsuario(m)||'Não informado']);
      celulas.push(['Data/hora do cadastro',atlasMovDataOperacao(atlasMovCadastroData(m))]);
    }else{
      celulas.push(['Evento de baixa','Consulta da auditoria indisponível']);
      celulas.push(['Cadastrado por',atlasMovCadastroUsuario(m)||'Não informado']);
      celulas.push(['Nota','A autoria da baixa não foi confirmada.']);
    }
  }
  return `<article class="doc-event-card"><h3>${atlasMovEsc(atlasMovCodigo(m))} · ${atlasMovEsc(atlasMovDescricao(m))}</h3><div class="doc-event-grid">${celulas.map(([nome,v])=>`<div><b>${atlasMovEsc(nome)}:</b> ${atlasMovEsc(v)}</div>`).join('')}</div></article>`;
}
function atlasMovDocumentoHtml(detalhado=false){
  const {lista,cadastros,eventos}=atlasMovDividirConsulta();if(!lista.length)return null;
  const m=atlasMovModoRelatorio();
  const titulo=m==='cadastro'?'RELATÓRIO DE ATIVIDADES PATRIMONIAIS':m==='eventos'?'RELATÓRIO DE MOVIMENTAÇÕES PATRIMONIAIS':'RELATÓRIO CONSOLIDADO · PATRIMÔNIOS E MOVIMENTAÇÕES';
  const cabe=atlasMovCabecalhoDocumento(lista,titulo);
  const valor=atlasMovTotalValor(cadastros),resumo=atlasMovResumo(lista);
  const inv=cadastros.length?`<section class="doc-section"><h2>Inventário patrimonial — situação atual</h2><p class="doc-info">Uma linha por bem, inclusive sem movimentação. A origem é a primeira origem de transferência registrada com sequência verificável, não necessariamente a obra inicial de cadastro.</p><div class="doc-resumo">Patrimônios: <b>${cadastros.length}</b> · Obras: <b>${atlasMovResumo(cadastros).obras}</b> · Valor dos bens com valor informado: <b>${valor.qtd?atlasMovEsc(atlasMovMoeda(valor.total)):'Não informado'}</b>${valor.sem?` · Sem valor informado: <b>${valor.sem}</b>`:''}</div>${atlasMovTabelaDocumento(atlasMovInventarioCabecalhos(),cadastros.map(atlasMovInventarioLinha),'doc-inventario')}</section>`:'';
  const mov=eventos.length?`<section class="doc-section"><h2>Movimentações e situações selecionadas</h2><p class="doc-info">Uma linha por registro de evento; o mesmo patrimônio pode aparecer mais de uma vez.</p><div class="doc-resumo">Registros: <b>${eventos.length}</b> · Patrimônios únicos: <b>${atlasMovResumo(eventos).patrimonios}</b> · Obras envolvidas: <b>${atlasMovResumo(eventos).obras}</b></div>${atlasMovTabelaDocumento(atlasMovEventosCabecalhos(),eventos.map(atlasMovEventoLinha),'doc-eventos')}${detalhado?`<h2 class="doc-appendix">Detalhamento das operações</h2>${eventos.map(atlasMovDetalhamentoEvento).join('')}`:''}</section>`:'';
  const css=`@page{size:A4 landscape;margin:9mm;@bottom-right{content:"Página " counter(page) " de " counter(pages);font-size:8px;color:#64748b}}*{box-sizing:border-box}body{font:9px Arial,Helvetica,sans-serif;color:#1b2433;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.doc-top{margin-bottom:12px;position:relative}.doc-brand{font-size:13px;font-weight:900;color:#b31119;letter-spacing:.2px}.doc-emissao{position:absolute;top:0;right:0;font-size:9px;color:#555}.doc-top h1{font-size:17px;margin:5px 0 8px}.doc-rule{height:3px;background:#ae1320;margin-bottom:10px}.doc-meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;line-height:1.5}.doc-obras,.doc-filtros{margin-top:7px;padding:6px 9px;background:#f6f7f9;border-left:3px solid #b1111c;line-height:1.5;overflow-wrap:anywhere}.doc-section{margin-top:11px}.doc-section h2{font-size:12px;color:#a60f1a;margin:0 0 5px}.doc-info{font-size:8.5px;color:#596272;margin:0 0 7px}.doc-resumo{margin:0 0 9px;font-size:9px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #cfd3d8;padding:5px 4px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:normal}th{font-size:8px;background:#eef1f4;color:#202734;font-weight:800}td{font-size:8px}tr{break-inside:avoid}thead{display:table-header-group}tbody tr:nth-child(even){background:#fafafa}.doc-inventario th:nth-child(1){width:3%}.doc-inventario th:nth-child(2){width:8%}.doc-inventario th:nth-child(3){width:5%}.doc-inventario th:nth-child(4){width:10%}.doc-inventario th:nth-child(5){width:5%}.doc-inventario th:nth-child(6){width:6%}.doc-inventario th:nth-child(7){width:7%}.doc-inventario th:nth-child(8){width:6%}.doc-inventario th:nth-child(9){width:6%}.doc-inventario th:nth-child(10){width:6%}.doc-inventario th:nth-child(11){width:7%}.doc-inventario th:nth-child(12){width:6%}.doc-inventario th:nth-child(13){width:6%}.doc-inventario th:nth-child(14){width:6%}.doc-inventario th:nth-child(15){width:8%}.doc-inventario th:nth-child(16){width:5%}.doc-eventos th:nth-child(1){width:3%}.doc-eventos th:nth-child(2){width:10%}.doc-eventos th:nth-child(3){width:11%}.doc-eventos th:nth-child(4){width:20%}.doc-eventos th:nth-child(5){width:9%}.doc-eventos th:nth-child(6){width:12%}.doc-eventos th:nth-child(7){width:12%}.doc-eventos th:nth-child(8){width:11%}.doc-eventos th:nth-child(9){width:7%}.doc-eventos th:nth-child(10){width:5%}.doc-event-card{break-inside:avoid;border:1px solid #d4d4d4;border-left:3px solid #ad1420;padding:8px 10px;margin:8px 0}.doc-event-card h3{font-size:10px;margin:0 0 6px}.doc-event-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px 12px;font-size:8.5px;line-height:1.4}.doc-appendix{break-before:page;margin-top:0!important}.doc-foot{padding-top:10px;margin-top:10px;border-top:1px solid #ddd;font-size:8px;color:#5b6370}.doc-section+.doc-section{break-before:page}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>BDR Construart - ${atlasMovEsc(titulo)}</title><style>${css}</style></head><body>${cabe}${inv}${mov}<footer class="doc-foot">BDR CONSTRUART · Atlas Gestão Patrimonial · Informações conforme cadastro e registros disponíveis na data de emissão. Ausência de datas não comprova que o evento ocorreu.</footer></body></html>`;
}
function atlasMovImprimirInteligente(detalhado=false){
  if(!exigirPermissaoRelatoriosBDR('RELATORIOS_EXPORTAR','Você não tem permissão para imprimir relatórios.'))return;
  const html=atlasMovDocumentoHtml(detalhado);if(!html){alert('Nenhum registro encontrado para impressão.');return;}
  const frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0';document.body.appendChild(frame);
  try{
    const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();
    const remover=()=>{if(frame.isConnected)frame.remove();};
    frame.contentWindow.addEventListener('afterprint',remover,{once:true});
    setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch(e){remover();alert('Não foi possível abrir a impressão: '+e.message);}},350);
    setTimeout(remover,120000);
  }catch(e){frame.remove();alert('Não foi possível preparar a impressão: '+e.message);}
}
function atlasMovExcelEventoLinha(m){
  const p=atlasMovPatrimoniosPorId.get(String(m.patrimonio_id))||m;
  return [atlasMovDataExibicao(m),atlasMovCodigo(m),p.codigo_antigo||'',atlasMovDescricao(m),atlasMovTipoLabel(m),
    atlasMovObra(m.obra_origem_id),atlasMovObra(m.obra_destino_id),atlasMovResponsavel(m),atlasMovStatusLabel(m.status),
    m.codigo_remessa||m.pedido_id||'',m.solicitado_por||'',m.aprovado_por||'',m.separado_por||'',m.enviado_por||'',m.recebido_por||'',
    atlasMovData(m.data_solicitacao),atlasMovData(m.data_aprovacao),atlasMovData(m.data_separacao),atlasMovData(m.data_envio),atlasMovData(m.data_recebimento),
    m.motorista_nome||'',m.veiculo_placa||'',m.conferencia_status||'',m.observacao||'',m.observacao_recebimento||''];
}
function atlasMovExcelCriarAba(livro,nome,titulo,cabecalhos,linhas,larguras,lista){
  const aba=livro.addWorksheet(nome,{views:[{state:'frozen',ySplit:9}]});const n=cabecalhos.length;
  for(const [l,v] of [[1,'BDR CONSTRUART'],[2,titulo],
    [3,`Emitido em: ${new Date().toLocaleString('pt-BR',{timeZone:'America/Cuiaba'})}   |   Emitido por: ${atlasMovEmitente()}`],
    [4,`Obras/setores: ${atlasMovIdentificacoesFiltro().texto}`],
    [5,`Período filtrado: ${atlasMovPeriodoFiltro()}   |   Efetivo: ${atlasMovPeriodoEfetivo(lista)}`],
    [6,`Filtros: ${atlasMovFiltroDescricao()}`],
    [7,`Total de registros: ${linhas.length}`]]){
      aba.mergeCells(l,1,l,n);aba.getCell(l,1).value=v;
      aba.getRow(l).height=l===1||l===2?27:20;
      aba.getCell(l,1).font={bold:l<3,size:l===2?14:10,color:{argb:l<3?'FFFFFFFF':'FF334155'}};
      if(l<3)aba.getCell(l,1).fill={type:'pattern',pattern:'solid',fgColor:{argb:l===1?'FFAF1520':'FF263243'}};
  }
  const h=aba.getRow(9);h.values=cabecalhos;h.height=29;
  h.eachCell(x=>{x.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEFEFF1'}};x.font={bold:true,color:{argb:'FF961821'}};x.alignment={vertical:'middle',wrapText:true};});
  for(const linha of linhas){const r=aba.addRow(linha);r.height=28;r.eachCell(x=>{x.alignment={vertical:'middle',wrapText:true};x.border={bottom:{style:'hair',color:{argb:'FFDDDFE3'}}};if(r.number%2===0)x.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFAFAFB'}};});}
  aba.columns.forEach((x,i)=>x.width=larguras[i]||20);
  aba.autoFilter={from:{row:9,column:1},to:{row:9,column:n}};
  aba.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  return aba;
}
async function atlasMovExportarExcelInteligente(){
  if(!exigirPermissaoRelatoriosBDR('RELATORIOS_EXPORTAR','Você não tem permissão para exportar relatórios.'))return;
  const {lista,cadastros,eventos}=atlasMovDividirConsulta();if(!lista.length){alert('Nenhum registro encontrado para exportação.');return;}
  if(!window.ExcelJS){alert('Biblioteca ExcelJS indisponível. Verifique a conexão.');return;}
  const livro=new ExcelJS.Workbook();livro.creator='BDR Construart';livro.created=new Date();
  if(cadastros.length){
    const campos=atlasMovInventarioCabecalhos();
    const aba=atlasMovExcelCriarAba(livro,'Patrimônios','RELATÓRIO DE ATIVIDADES PATRIMONIAIS',campos,
      cadastros.map((m,i)=>{const l=atlasMovInventarioLinha(m,i);const p=atlasMovPatrimoniosPorId.get(String(m.patrimonio_id))||m;l[8]=atlasMovValorPatrimonio(p);return l;}),
      [6,22,20,46,18,19,27,20,19,26,26,26,21,27,34,27],cadastros);
    aba.getColumn(9).numFmt='"R$" #,##0.00;[Red]("R$" #,##0.00)';
  }
  if(eventos.length){
    const campos=['Data/hora','Patrimônio','Patrimônio antigo','Descrição','Evento','Origem','Destino','Responsável','Status','Pedido / Remessa','Solicitado por','Aprovado por','Separado por','Enviado por','Recebido por','Solicitação','Aprovação','Separação','Envio','Recebimento','Motorista','Placa','Conferência','Observação','Observação do recebimento'];
    atlasMovExcelCriarAba(livro,'Movimentações','RELATÓRIO DE MOVIMENTAÇÕES PATRIMONIAIS',campos,eventos.map(atlasMovExcelEventoLinha),
      [24,22,21,46,22,32,32,28,21,22,28,26,26,26,26,24,24,24,24,24,24,18,24,55,55],eventos);
  }
  const buffer=await livro.xlsx.writeBuffer(),url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download=`BDR_Relatorio_${atlasMovModoRelatorio()==='cadastro'?'Patrimonial':atlasMovModoRelatorio()==='eventos'?'Movimentacoes':'Consolidado'}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}

async function atlasCarregarMovimentacoes(){
  const aviso=document.getElementById('atlasMovAviso');
  const usuario=usuarioAtualRelatoriosBDR();
  const todas=temPermissaoRelatoriosBDR('RELATORIOS_TODAS_OBRAS',usuario)||temPermissaoRelatoriosBDR('TODAS_OBRAS_VER',usuario);
  const ids=new Set(obras.map(o=>String(o.id)));
  // Exibe o cadastro assim que o carregamento inicial terminou. A consulta
  // demorada do histórico não deve segurar a tela padrão com todos os bens.
  atlasMovDados=[];atlasMovTrajetos=new Map();atlasMovBaixasAuditadas=new Map();atlasMovErroAuditoriaBaixas=null;
  atlasMovCadastroDados=patrimonios.map(p=>({
    ...p,id:-(2000000000+Number(p.id)),patrimonio_id:p.id,
    origem_registro:'CADASTRO_PATRIMONIAL',
    codigo_qr:p.codigo_qr||p.codigo_bem||p.etiqueta||p.codigo_antigo,
    obra_origem_id:p.obra_id,obra_destino_id:p.obra_id,
    responsavel:p.responsavel||null,usuario_cadastro:p.usuario_cadastro||null,
    data_cadastro:p.data_cadastro||p.created_at||null,
    status:p.status||'SEM_STATUS'
  }));
  atlasMovPovoarFiltros();atlasMovPagina=1;atlasRenderMov();
  if(aviso)aviso.textContent=`${atlasMovCadastroDados.length} patrimônios disponíveis. Carregando também o histórico de movimentações...`;
  // Independente do histórico de remessas: o cadastro já pode exibir a baixa auditada.
  await atlasMovCarregarBaixasAuditadas();
  const registros=[];let offset=0;const limite=500;
  try{
    while(true){
      const r=await db().from('patrimonio_movimentacoes').select('*').order('id',{ascending:false}).range(offset,offset+limite-1);
      if(r.error)throw r.error;
      const lote=r.data||[];registros.push(...lote);if(lote.length<limite)break;offset+=limite;
    }
    // Remessas diretas: cabeçalho e itens, com paginação completa.
    // Sem gravações; mantém identificação própria para não colidir com pedidos.
    async function carregarTabela(nome){
      const dados=[];let inicio=0;
      while(true){
        const r=await db().from(nome).select('*').order('id',{ascending:false}).range(inicio,inicio+499);
        if(r.error)throw r.error;
        const lote=r.data||[];dados.push(...lote);
        if(lote.length<500)break;
        inicio+=500;
      }
      return dados;
    }
    let remessas=[];let falhaRemessas=null;
    try{
      const [cabecalhos,itens]=await Promise.all([
        carregarTabela('atlas_patrimonio_remessas'),
        carregarTabela('atlas_patrimonio_remessa_itens')
      ]);
      const porId=new Map(cabecalhos.map(r=>[String(r.id),r]));
      remessas=itens.flatMap(item=>{
        const r=porId.get(String(item.remessa_id));if(!r)return [];
        return [{
          id:-Number(item.id), origem_registro:'REMESSA_DIRETA',
          codigo_remessa:r.codigo || `Remessa ${r.id}`, pedido_id:null,
          patrimonio_id:item.patrimonio_id, codigo_qr:item.codigo_qr,
          nome_bem:item.nome_bem, obra_origem_id:r.obra_origem_id,
          obra_destino_id:r.obra_destino_id, status:r.status,
          solicitado_por:null, aprovado_por:null, separado_por:null,
          enviado_por:r.enviado_por_nome, recebido_por:r.recebido_por_nome,
          data_envio:r.enviado_em, data_recebimento:r.recebido_em,
          motorista_nome:r.motorista, veiculo_placa:r.placa,
          observacao:r.observacao, observacao_recebimento:r.observacao_recebimento, conferencia_status:r.condicao_recebimento,
          remessa_id:r.id, item_id:item.id
        }];
      });
    }catch(e){falhaRemessas=e;console.error('Atlas: falha ao consultar remessas diretas',e);}
    // Cadastro completo: uma linha por bem, com a localização e o status atuais.
    // Não inventa movimentações para bens nunca movimentados.
    // Baixas: situação atual dos patrimônios. Não são movimentações históricas
    // e não se deve inventar data, remetente, recebedor ou pedido de baixa.
    const baixados=patrimonios.filter(p=>String(p.status||'').toUpperCase()==='BAIXADO').map(p=>({
      id:-(1000000000+Number(p.id)),origem_registro:'PATRIMONIO_BAIXADO',
      patrimonio_id:p.id,codigo_qr:p.codigo_qr,nome_bem:p.nome_bem,
      obra_origem_id:p.obra_id,obra_destino_id:p.obra_id,
      codigo_remessa:'—',pedido_id:null,status:'BAIXADO',
      solicitado_por:null,enviado_por:null,recebido_por:null,
      usuario_cadastro:p.usuario_cadastro||p.cadastrado_por||null,
      data_cadastro:p.data_cadastro||p.created_at||null,
      data_envio:null,data_recebimento:null,
      observacao:atlasMovAuditoriaBaixa(p)?.observacao||'Situação atual: BAIXADO. Sem movimentação separada de baixa registrada.'
    }));
    atlasMovDados=[...registros,...remessas,...baixados].filter(m=>{
      const o=String(m.obra_origem_id),d=String(m.obra_destino_id);
      if(!(ids.has(o)||ids.has(d)))return false;
      // Obras de laboratório são exclusivas do proprietário do sistema.
      if(!(Number(usuario?.id)===1 && usuario?.owner_sistema===true) && ([o,d].includes('22')||[o,d].includes('33')))return false;
      return true;
    });
    atlasMovDados.sort((a,b)=>new Date(b.data_envio||0)-new Date(a.data_envio||0));
    atlasMovReconstruirTrajetos();
    atlasMovErro=falhaRemessas;
    if(aviso)aviso.textContent=`${atlasMovCadastroDados.length} patrimônios cadastrados e ${atlasMovDados.filter(m=>m.origem_registro!=='PATRIMONIO_BAIXADO').length} eventos disponíveis para consulta. Selecione o tipo de registro para visualizar o histórico.`+(falhaRemessas?' ATENÇÃO: remessas diretas não puderam ser consultadas: '+(falhaRemessas.message||falhaRemessas):'')+(atlasMovErroAuditoriaBaixas?' ATENÇÃO: consulta de auditoria de baixas indisponível. Verifique as permissões de leitura.':'');
  }catch(e){atlasMovDados=[];atlasMovErro=e;if(aviso)aviso.textContent='Cadastro disponível; não foi possível carregar o histórico: '+(e.message||e);console.error(e);}
  await atlasMovCarregarFotos();
  atlasMovPovoarFiltros();atlasMovPagina=1;atlasRenderMov();
}
function renderizarMovimentacoes(){atlasRenderMov();}

function limparFiltros(){
  atlasLimparObras();
  atlasProdutosSelecionadosRelatorio.clear();
  atualizarContadorProdutosRelatorio();
  document.getElementById("busca").value = "";
  document.getElementById("filtroStatus").value = "";
  atlasLimparStatus(false);
  document.getElementById("filtroTipo").value = "";
  document.getElementById("filtroObra").value = "";
  document.getElementById("dataInicio").value = "";
  document.getElementById("dataFim").value = "";
  if(document.getElementById("filtroOrigem")) document.getElementById("filtroOrigem").value = "";
  document.querySelectorAll(".obra-sienge-check").forEach(c => c.checked = false);
  renderizarRelatorio();
}


let conferenciaAtualRelatorio = null;
let modoRelatorioHistorico = false;
let assinaturaCanvasVazia = true;
let assinaturaDesenhando = false;
let assinaturaUltimoPonto = null;

function usuarioAtualRelatorio(){
  try{
    return JSON.parse(localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado") || localStorage.getItem("usuarioAtual") || "null");
  }catch(e){ return null; }
}

function obraUnicaSelecionadaRelatorio(){
  const marcadas = obrasSelecionadasSienge();
  if(marcadas.length > 1) return null;
  const obraId = marcadas.length === 1 ? marcadas[0] : valor("filtroObra");
  if(!obraId) return null;
  return obras.find(o => String(o.id) === String(obraId)) || null;
}

function codigoPatrimonioConferencia(p){
  return String(p?.codigo_qr || p?.codigo_bem || p?.etiqueta || p?.id || "");
}

function snapshotPatrimoniosConferencia(){
  return filtradosAtuais.map(p => {
    const obra = obras.find(o => String(o.id) === String(p.obra_id));
    return {
      id:p.id || null,
      codigo:codigoPatrimonioConferencia(p),
      nome:p.nome_bem || null,
      tipo:p.tipo_item || null,
      status:p.status || null,
      obra_id:p.obra_id || null,
      obra:obra ? `${obra.codigo_obra || obra.codigo_sienge || "-"} - ${obra.nome || "-"}` : (p.localizacao || null),
      marca:p.marca || null,
      modelo:p.modelo || null,
      numero_serie:p.numero_serie || p.placa || null,
      valor:p.valor_aquisicao ?? p.valor ?? null,
      data_cadastro:p.data_cadastro || p.created_at || null,
      cadastrado_por:p.usuario_cadastro || p.cadastrado_por || null
    };
  });
}

function assinaturaCorrespondeAoRelatorio(c){
  const itens = Array.isArray(c?.patrimonios_json) ? c.patrimonios_json : [];
  if(itens.length !== filtradosAtuais.length) return false;
  const atuais = filtradosAtuais.map(codigoPatrimonioConferencia).sort();
  const assinados = itens.map(i => String(i?.codigo || i?.id || "")).sort();
  return atuais.every((codigo, indice) => codigo === assinados[indice]);
}

function redimensionarCanvasAssinatura(){
  const canvas = document.getElementById("canvasAssinaturaConferencia");
  if(!canvas) return;
  const ret = canvas.getBoundingClientRect();
  const escala = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(ret.width * escala);
  canvas.height = Math.round(ret.height * escala);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(escala,0,0,escala,0,0);
  ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111827";
  assinaturaCanvasVazia = true; assinaturaUltimoPonto = null;
}

function pontoCanvasAssinatura(e){
  const canvas = document.getElementById("canvasAssinaturaConferencia");
  const ret = canvas.getBoundingClientRect();
  return {x:e.clientX-ret.left,y:e.clientY-ret.top};
}
function iniciarAssinaturaConferencia(e){e.preventDefault();assinaturaDesenhando=true;assinaturaUltimoPonto=pontoCanvasAssinatura(e);try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){}}
function desenharAssinaturaConferencia(e){
  if(!assinaturaDesenhando || !assinaturaUltimoPonto) return;
  e.preventDefault();
  const ctx=document.getElementById("canvasAssinaturaConferencia").getContext("2d");
  const atual=pontoCanvasAssinatura(e);
  ctx.beginPath();ctx.moveTo(assinaturaUltimoPonto.x,assinaturaUltimoPonto.y);ctx.lineTo(atual.x,atual.y);ctx.stroke();
  assinaturaUltimoPonto=atual;assinaturaCanvasVazia=false;
}
function finalizarAssinaturaConferencia(e){if(e)e.preventDefault();assinaturaDesenhando=false;assinaturaUltimoPonto=null}
function limparAssinaturaConferencia(){
  const canvas=document.getElementById("canvasAssinaturaConferencia");
  if(!canvas)return;
  canvas.getContext("2d").clearRect(0,0,canvas.width,canvas.height);
  assinaturaCanvasVazia=true;assinaturaUltimoPonto=null;
}
function prepararEventosCanvasAssinatura(){
  const canvas=document.getElementById("canvasAssinaturaConferencia");
  if(!canvas || canvas.dataset.pronto==="SIM")return;
  canvas.addEventListener("pointerdown",iniciarAssinaturaConferencia);
  canvas.addEventListener("pointermove",desenharAssinaturaConferencia);
  canvas.addEventListener("pointerup",finalizarAssinaturaConferencia);
  canvas.addEventListener("pointercancel",finalizarAssinaturaConferencia);
  canvas.addEventListener("pointerleave",finalizarAssinaturaConferencia);
  canvas.dataset.pronto="SIM";
}

function abrirConferenciaPatrimonial(){
  /*
   * Segurança em duas camadas:
   * 1. o botão fica oculto sem a permissão;
   * 2. esta função também bloqueia chamadas manuais pelo console.
   */
  if(!exigirPermissaoRelatoriosBDR(
    "PATRIMONIO_CONFERIR_RELATORIO",
    "Você não tem permissão para registrar conferência patrimonial."
  )) return;

  if(filtradosAtuais.length===0){alert("Nenhum patrimônio encontrado para conferir.");return}
  const obra=obraUnicaSelecionadaRelatorio();
  if(!obra){alert("Selecione apenas uma obra/setor antes de registrar a conferência.");return}
  document.getElementById("confObraNome").textContent=`${obra.codigo_obra || obra.codigo_sienge || "-"} - ${obra.nome || "-"}`;
  document.getElementById("confQuantidade").textContent=`${filtradosAtuais.length} patrimônio(s)`;
  const usuario=usuarioAtualRelatorio() || {};
  document.getElementById("confResponsavelNome").value=usuario.nome || usuario.usuario || "";
  document.getElementById("confResponsavelCargo").value=usuario.cargo || "";
  document.getElementById("confResponsavelFuncao").value="Responsável pela conferência";
  document.getElementById("confObservacao").value="";
  const modal=document.getElementById("modalConferenciaPatrimonial");
  modal.classList.add("ativo");modal.setAttribute("aria-hidden","false");
  setTimeout(()=>{prepararEventosCanvasAssinatura();redimensionarCanvasAssinatura();document.getElementById("confResponsavelNome")?.focus()},80);
}
function fecharConferenciaPatrimonial(){
  const modal=document.getElementById("modalConferenciaPatrimonial");
  if(!modal)return;modal.classList.remove("ativo");modal.setAttribute("aria-hidden","true");finalizarAssinaturaConferencia();
}

function dataBRCompacta(d){return d.toLocaleDateString("pt-BR",{timeZone:"America/Cuiaba",day:"2-digit",month:"2-digit",year:"numeric"}).replaceAll("/","")}
async function gerarCodigoConferencia(obra){
  const codigoObra=String(obra.codigo_obra || obra.codigo_sienge || obra.id).replace(/\D+/g,"") || String(obra.id);
  const prefixo=`CONF-${codigoObra}-${dataBRCompacta(new Date())}-`;
  const {data,error}=await db().from("conferencias_patrimoniais").select("codigo_conferencia").like("codigo_conferencia",`${prefixo}%`).order("codigo_conferencia",{ascending:false}).limit(1);
  if(error)throw error;
  let proximo=1;
  if(data?.length){const atual=Number(String(data[0].codigo_conferencia||"").split("-").pop());if(Number.isFinite(atual))proximo=atual+1}
  return `${prefixo}${String(proximo).padStart(4,"0")}`;
}

function exportarAssinaturaRecortada(){
  const origem=document.getElementById("canvasAssinaturaConferencia");
  if(!origem)return null;
  const ctx=origem.getContext("2d",{willReadFrequently:true});
  const {width,height}=origem;
  const pixels=ctx.getImageData(0,0,width,height).data;
  let minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      const a=pixels[i+3], r=pixels[i], g=pixels[i+1], b=pixels[i+2];
      if(a>20 && (r<245 || g<245 || b<245)){
        if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
      }
    }
  }
  if(maxX<minX || maxY<minY)return null;
  const escala=Math.max(1,window.devicePixelRatio||1);
  const margem=Math.round(8*escala);
  minX=Math.max(0,minX-margem);minY=Math.max(0,minY-margem);
  maxX=Math.min(width-1,maxX+margem);maxY=Math.min(height-1,maxY+margem);
  const largura=maxX-minX+1, altura=maxY-minY+1;
  const recorte=document.createElement("canvas");
  recorte.width=largura;recorte.height=altura;
  recorte.getContext("2d").drawImage(origem,minX,minY,largura,altura,0,0,largura,altura);
  return recorte.toDataURL("image/png");
}

async function salvarConferenciaPatrimonial(){
  if(!exigirPermissaoRelatoriosBDR(
    "PATRIMONIO_CONFERIR_RELATORIO",
    "Você não tem permissão para salvar esta conferência."
  )) return;

  const obra=obraUnicaSelecionadaRelatorio();
  const nome=valor("confResponsavelNome");
  const cargo=valor("confResponsavelCargo");
  const funcao=valor("confResponsavelFuncao");
  const observacao=valor("confObservacao");
  const usuario=usuarioAtualRelatorio()||{};
  const botao=document.getElementById("btnSalvarConferencia");
  if(!obra){alert("Selecione apenas uma obra/setor.");return}
  if(!nome){alert("Informe o nome do responsável.");return}
  if(!cargo){alert("Informe o cargo do responsável.");return}
  if(!funcao){alert("Informe a função na conferência.");return}
  if(assinaturaCanvasVazia){alert("Peça ao responsável para assinar.");return}
  const snapshot=snapshotPatrimoniosConferencia();
  botao.disabled=true;botao.textContent="Salvando...";
  try{
    let resultado=null;
    for(let tentativa=0;tentativa<3;tentativa++){
      const codigo=await gerarCodigoConferencia(obra);
      resultado=await db().from("conferencias_patrimoniais").insert([{
        empresa_id:usuario.empresa_id || obra.empresa_id || null,
        obra_id:Number(obra.id),
        codigo_conferencia:codigo,
        periodo_inicio:valor("dataInicio") || null,
        periodo_fim:valor("dataFim") || null,
        quantidade_patrimonios:snapshot.length,
        responsavel_nome:nome,
        responsavel_cargo:cargo,
        responsavel_funcao:funcao,
        assinatura_base64:exportarAssinaturaRecortada(),
        criado_por_usuario_id:usuario.id || usuario.usuario_id || null,
        criado_por_nome:usuario.nome || usuario.usuario || "SISTEMA",
        patrimonios_json:snapshot,
        observacao:observacao || null,
        status:"CONFERIDO"
      }]).select("*").single();
      if(!resultado.error)break;
      if(String(resultado.error.code)!=="23505")throw resultado.error;
    }
    if(resultado?.error)throw resultado.error;
    conferenciaAtualRelatorio=resultado.data;
    aplicarConferenciaNaImpressao(conferenciaAtualRelatorio);
    fecharConferenciaPatrimonial();
    const imprimirAgora=confirm(
      `Conferência registrada e salva!\n\n${resultado.data.codigo_conferencia}\n${snapshot.length} patrimônio(s).\n\nDeseja imprimir o relatório assinado agora?`
    );
    if(imprimirAgora) setTimeout(imprimirRelatorio,120);
  }catch(error){
    console.error(error);alert("Não foi possível registrar: "+(error?.message || error));
  }finally{
    botao.disabled=false;botao.textContent="✓ Confirmar conferência";
  }
}

function escaparHtmlRelatorio(valor){
  return String(valor ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function fecharRelatoriosAssinados(){
  const modal=document.getElementById("modalRelatoriosAssinados");
  modal?.classList.remove("ativo");modal?.setAttribute("aria-hidden","true");
}
async function abrirRelatoriosAssinados(){
  if(!exigirPermissaoRelatoriosBDR("PATRIMONIO_CONFERIR_RELATORIO","Você não tem permissão para consultar relatórios assinados."))return;
  const modal=document.getElementById("modalRelatoriosAssinados");
  const lista=document.getElementById("listaRelatoriosAssinados");
  modal?.classList.add("ativo");modal?.setAttribute("aria-hidden","false");
  if(lista)lista.innerHTML='<div class="atlas-assinados-carregando">Carregando relatórios assinados...</div>';
  try{
    const usuario=usuarioAtualRelatorio()||{};
    let consulta=db().from("conferencias_patrimoniais").select("*").eq("status","CONFERIDO").order("conferido_em",{ascending:false}).limit(100);
    if(usuario.empresa_id)consulta=consulta.eq("empresa_id",usuario.empresa_id);
    const {data,error}=await consulta;if(error)throw error;
    window.__atlasRelatoriosAssinados=data||[];
    if(!lista)return;
    if(!data?.length){lista.innerHTML='<div class="atlas-assinados-vazio">Nenhum relatório assinado foi encontrado.</div>';return}
    lista.innerHTML=data.map((c,indice)=>{
      const obra=obras.find(o=>String(o.id)===String(c.obra_id));
      const obraNome=obra?`${obra.codigo_obra||obra.codigo_sienge||"-"} - ${obra.nome||"-"}`:`Obra/setor ID ${c.obra_id||"-"}`;
      return `<article class="atlas-assinado-item">
        <div><h4>${escaparHtmlRelatorio(c.codigo_conferencia||"Conferência")}</h4>
        <p><b>${escaparHtmlRelatorio(obraNome)}</b></p>
        <p>${escaparHtmlRelatorio(c.responsavel_nome||"-")} - ${escaparHtmlRelatorio(c.responsavel_cargo||"-")}</p>
        <p>${Number(c.quantidade_patrimonios||0)} patrimônio(s) • ${escaparHtmlRelatorio(formatarDataConferencia(c.conferido_em||c.created_at))}</p></div>
        <div class="atlas-assinado-acoes">
          <button class="atlas-assinado-abrir" onclick="abrirRelatorioAssinado(${indice},false)">Abrir</button>
          <button class="atlas-assinado-imprimir" onclick="abrirRelatorioAssinado(${indice},true)">Imprimir</button>
        </div></article>`;
    }).join("");
  }catch(error){console.error(error);if(lista)lista.innerHTML=`<div class="atlas-assinados-vazio">Não foi possível carregar: ${escaparHtmlRelatorio(error?.message||error)}</div>`}
}
async function abrirRelatorioAssinado(indice,imprimir=false){
  const c=(window.__atlasRelatoriosAssinados||[])[indice];
  if(!c)return;
  fecharRelatoriosAssinados();

  const snapshot=Array.isArray(c.patrimonios_json)?c.patrimonios_json:[];
  if(!snapshot.length){
    alert("Esta conferência não possui a fotografia dos patrimônios salva.");
    return;
  }

  modoRelatorioHistorico=true;
  conferenciaAtualRelatorio=c;

  // Reconstrói exatamente a relação que foi assinada, sem depender do estado atual.
  filtradosAtuais=snapshot.map((i,indice)=>({
    id:i.id ?? `HIST-${indice+1}`,
    codigo_qr:i.codigo || null,
    codigo_bem:i.codigo || null,
    etiqueta:i.codigo || null,
    nome_bem:i.nome || "-",
    tipo_item:i.tipo || "OUTRO",
    status:i.status || "-",
    obra_id:i.obra_id || c.obra_id || null,
    localizacao:i.obra || null,
    marca:i.marca || null,
    modelo:i.modelo || null,
    numero_serie:i.numero_serie || null,
    placa:i.numero_serie || null,
    valor_aquisicao:i.valor ?? null,
    valor:i.valor ?? null,
    data_cadastro:i.data_cadastro || null,
    created_at:i.data_cadastro || null,
    usuario_cadastro:i.cadastrado_por || null,
    cadastrado_por:i.cadastrado_por || null
  }));

  paginaRelatorioAtual=1;
  renderizarTodosItensParaImpressao();
  document.getElementById("resumo").textContent=`Fotografia oficial assinada: ${snapshot.length} patrimônio(s)`;
  document.getElementById("relatorioDocTotal").textContent=String(snapshot.length);
  document.getElementById("relatorioDocPeriodo").textContent=(c.periodo_inicio||c.periodo_fim)
    ? `${c.periodo_inicio ? formatarData(c.periodo_inicio) : "Início"} até ${c.periodo_fim ? formatarData(c.periodo_fim) : "Hoje"}`
    : "Todos os registros no momento da conferência";
  document.getElementById("relatorioDocEmissao").textContent=`Conferido em ${formatarDataConferencia(c.conferido_em||c.created_at)}`;

  const aviso=document.getElementById("avisoHistoricoConferencia");
  if(aviso){
    aviso.className="atlas-conferencia-status ativo historico";
    aviso.innerHTML=`<strong>📸 Relatório histórico assinado</strong>
      Esta é a fotografia oficial de ${snapshot.length} patrimônio(s) no momento da conferência
      <b>${escaparHtmlRelatorio(c.codigo_conferencia||"")}</b>. Movimentações posteriores não alteram este documento.
      <br><button type="button" onclick="voltarRelatorioAtual()">← Voltar ao relatório atual</button>`;
  }

  aplicarConferenciaNaImpressao(c,true);
  document.getElementById("cardRelatorioPatrimonios")?.scrollIntoView({behavior:"smooth",block:"start"});
  if(imprimir)setTimeout(imprimirRelatorio,120);
}

function voltarRelatorioAtual(){
  modoRelatorioHistorico=false;
  conferenciaAtualRelatorio=null;
  const aviso=document.getElementById("avisoHistoricoConferencia");
  if(aviso){aviso.className="atlas-conferencia-status";aviso.innerHTML=""}
  resetarPaginaRelatorio();
  renderizarRelatorio();
}

function formatarDataConferencia(v){
  if(!v)return "-";const d=new Date(v);if(isNaN(d.getTime()))return "-";
  return d.toLocaleString("pt-BR",{timeZone:"America/Cuiaba",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function removerRodapesAntigosConferencia(){
  // Proteção contra versões antigas ainda existentes no HTML ou no cache.
  document.querySelectorAll(
    ".relatorio-visto-eletronico, .relatorio-total-final, #relatorioVistoEletronico, #totalTabelaRelatorio"
  ).forEach((elemento)=>{
    const linha = elemento.closest("tr");
    (linha || elemento).remove();
  });
}

function aplicarConferenciaNaImpressao(c,forcarHistorico=false){
  removerRodapesAntigosConferencia();
  const bloco=document.getElementById("relatorioConferenciaImpressao");
  const visto=document.getElementById("relatorioVistoPaginas");
  const imagem=document.getElementById("relatorioAssinaturaImagem");
  const imagemVisto=document.getElementById("relatorioVistoImagem");
  const imagemVistoAntes=document.getElementById("relatorioVistoAntesImagem");

  if(!c || (!forcarHistorico && !assinaturaCorrespondeAoRelatorio(c)) || !c.assinatura_base64){
    bloco?.classList.remove("ativo");
    visto?.classList.remove("ativo");
    document.body.classList.remove("relatorio-assinado","relatorio-uma-pagina","relatorio-historico-duas-paginas");
    if(imagem)imagem.removeAttribute("src");
    if(imagemVisto)imagemVisto.removeAttribute("src");
    if(imagemVistoAntes)imagemVistoAntes.removeAttribute("src");
    return false;
  }

  document.getElementById("relatorioAssinaturaNomeFinal").textContent=c.responsavel_nome || "-";
  document.getElementById("relatorioAssinaturaCargo").textContent=c.responsavel_cargo || "-";
  document.getElementById("relatorioAssinaturaFuncao").textContent=c.responsavel_funcao || "-";
  document.getElementById("relatorioAssinaturaData").textContent=formatarDataConferencia(c.conferido_em || c.created_at);
  document.getElementById("relatorioAssinaturaCodigo").textContent=c.codigo_conferencia || "-";
  imagem.src=c.assinatura_base64;
  imagemVisto.src=c.assinatura_base64;
  if(imagemVistoAntes)imagemVistoAntes.src=c.assinatura_base64;
  bloco?.classList.add("ativo");
  visto?.classList.add("ativo");
  document.body.classList.add("relatorio-assinado");

  /*
     No histórico com até 17 itens, o bloco completo pode ser empurrado para
     uma segunda folha pelo tamanho real das linhas. Criamos então um visto
     dentro do fluxo, no final da primeira folha, e iniciamos a conferência
     completa na página seguinte.
  */
  const historicoDuasPaginas = modoRelatorioHistorico && filtradosAtuais.length <= 17;
  document.body.classList.toggle("relatorio-historico-duas-paginas", historicoDuasPaginas);

  // Para relatórios maiores, o visto fixo continua repetido nas páginas anteriores.
  const relatorioPossuiPaginaExtra = historicoDuasPaginas || filtradosAtuais.length > 17;
  document.body.classList.toggle("relatorio-uma-pagina", !relatorioPossuiPaginaExtra);
  return true;
}
function compararConferenciaComAtual(c){
  const antigos=Array.isArray(c?.patrimonios_json)?c.patrimonios_json:[];
  const mapaAntigos=new Map(antigos.map(i=>[String(i?.codigo||i?.id||""),i]));
  const mapaAtuais=new Map(filtradosAtuais.map(i=>[codigoPatrimonioConferencia(i),i]));
  let entradas=0,saidas=0,alterados=0;
  mapaAtuais.forEach((item,codigo)=>{
    if(!mapaAntigos.has(codigo)){entradas++;return}
    const antigo=mapaAntigos.get(codigo)||{};
    const statusAntigo=String(antigo.status||"").toUpperCase();
    const statusAtual=String(item.status||"").toUpperCase();
    const obraAntiga=String(antigo.obra_id||"");
    const obraAtual=String(item.obra_id||"");
    if(statusAntigo!==statusAtual || obraAntiga!==obraAtual)alterados++;
  });
  mapaAntigos.forEach((_,codigo)=>{if(!mapaAtuais.has(codigo))saidas++});
  return {entradas,saidas,alterados,total:entradas+saidas+alterados};
}

function mostrarSituacaoUltimaConferencia(c){
  const aviso=document.getElementById("avisoHistoricoConferencia");
  if(!aviso || modoRelatorioHistorico)return;
  if(!c){aviso.className="atlas-conferencia-status";aviso.innerHTML="";return}
  const diff=compararConferenciaComAtual(c);
  aviso.className="atlas-conferencia-status ativo";
  if(diff.total===0){
    aviso.innerHTML=`<strong>✓ Última conferência: ${escaparHtmlRelatorio(c.codigo_conferencia||"-")}</strong>
      A relação atual corresponde à fotografia assinada em ${escaparHtmlRelatorio(formatarDataConferencia(c.conferido_em||c.created_at))}.`;
  }else{
    const partes=[];
    if(diff.entradas)partes.push(`${diff.entradas} entrada(s)`);
    if(diff.saidas)partes.push(`${diff.saidas} saída(s)/transferência(s)`);
    if(diff.alterados)partes.push(`${diff.alterados} alteração(ões) de situação`);
    aviso.innerHTML=`<strong>ℹ️ Existem alterações posteriores à última conferência</strong>
      A conferência <b>${escaparHtmlRelatorio(c.codigo_conferencia||"-")}</b>, realizada em
      ${escaparHtmlRelatorio(formatarDataConferencia(c.conferido_em||c.created_at))}, continua válida como fotografia daquele momento.
      Situação atual comparada ao documento: ${escaparHtmlRelatorio(partes.join(" • "))}.`;
  }
}

async function carregarConferenciaCompativel(){
  if(modoRelatorioHistorico)return;
  conferenciaAtualRelatorio=null;
  aplicarConferenciaNaImpressao(null);
  const obra=obraUnicaSelecionadaRelatorio();
  const aviso=document.getElementById("avisoHistoricoConferencia");
  if(!obra || filtradosAtuais.length===0){
    if(aviso){aviso.className="atlas-conferencia-status";aviso.innerHTML=""}
    return;
  }
  try{
    const {data,error}=await db().from("conferencias_patrimoniais").select("*").eq("obra_id",obra.id).eq("status","CONFERIDO").order("conferido_em",{ascending:false}).limit(20);
    if(error)throw error;
    const lista=data||[];
    const ultima=lista[0]||null;
    mostrarSituacaoUltimaConferencia(ultima);
    const compativel=lista.find(assinaturaCorrespondeAoRelatorio);
    if(compativel){
      conferenciaAtualRelatorio=compativel;
      aplicarConferenciaNaImpressao(compativel);
    }
  }catch(error){
    console.warn("Conferência não carregada:",error?.message||error);
  }
}

function renderizarTodosItensParaImpressao(){
  const corpo=document.getElementById("corpoTabela");
  if(!corpo)return;
  corpo.innerHTML="";
  const ocultarObra=relatorioTemObraUnica();
  atualizarVisibilidadeObraRelatorio();
  filtradosAtuais.forEach((p,indice)=>{
    const obraObj=obras.find(o=>String(o.id)===String(p.obra_id));
    const tipo=String(p.tipo_item||"OUTRO").toUpperCase();
    corpo.innerHTML+=`<tr>
      <td class="relatorio-numero-linha">${indice+1}</td>
      <td>${identificacaoInteligenteRelatorio(p)}</td>
      <td>${p.nome_bem || "-"}</td>
      <td>${tipo==="MAQUINA" ? "MÁQUINA PESADA" : tipo.replaceAll("_"," ")}</td>
      <td><span class="status ${p.status || ""}">${String(p.status || "-").replaceAll("_"," ")}</span></td>
      <td class="coluna-obra-relatorio">${obraObj ? `${obraObj.codigo_obra || obraObj.codigo_sienge || "-"} - ${obraObj.nome || "-"}` : (p.localizacao || "-")}</td>
      <td>${p.marca || "-"}</td><td>${p.modelo || "-"}</td><td>${p.numero_serie || p.placa || "-"}</td>
      <td>${valorPatrimonioRelatorio(p)}</td><td>${formatarDataHoraCadastroPatrimonio(p)}</td><td>${p.usuario_cadastro || p.cadastrado_por || "-"}</td>
    </tr>`;
  });
}
/* Dialogo institucional Atlas: evita confirmacoes nativas do navegador. */
function confirmarRelatorioAtlas(mensagem, titulo="Confirmação do relatório"){
  return new Promise(resolve=>{
    const anterior=document.getElementById("atlasDialogoRelatorio");
    if(anterior) anterior.remove();
    const fundo=document.createElement("div");
    fundo.id="atlasDialogoRelatorio";
    fundo.style.cssText="position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.64);display:flex;align-items:center;justify-content:center;padding:18px";
    fundo.innerHTML=`<section role="alertdialog" aria-modal="true" aria-labelledby="atlasDialogoTitulo" aria-describedby="atlasDialogoMensagem" style="background:#fff;width:min(440px,100%);border-radius:16px;box-shadow:0 24px 75px #0f172a55;overflow:hidden;border-top:5px solid #a4161a;font-family:Arial,sans-serif">
      <header style="padding:22px 24px 8px"><h2 id="atlasDialogoTitulo" style="font-size:19px;color:#991b1b;margin:0"></h2></header>
      <p id="atlasDialogoMensagem" style="padding:0 24px;color:#334155;font-size:14px;line-height:1.55;white-space:pre-line"></p>
      <footer style="display:flex;justify-content:flex-end;gap:10px;padding:16px 24px 22px;background:#f8fafc"><button type="button" data-resposta="nao" style="padding:10px 18px;border:1px solid #cbd5e1;background:white;border-radius:9px;font-weight:700;cursor:pointer">Cancelar</button><button type="button" data-resposta="sim" style="padding:10px 18px;border:0;background:#a4161a;color:white;border-radius:9px;font-weight:700;cursor:pointer">Continuar</button></footer>
    </section>`;
    fundo.querySelector("#atlasDialogoTitulo").textContent=titulo;
    fundo.querySelector("#atlasDialogoMensagem").textContent=mensagem;
    document.body.appendChild(fundo);
    const anteriorFoco=document.activeElement;
    const concluir=(valor)=>{document.removeEventListener("keydown",tecla);fundo.remove();anteriorFoco?.focus?.();resolve(valor)};
    const tecla=e=>{if(e.key==="Escape"){e.preventDefault();concluir(false)}else if(e.key==="Tab"){const botoes=[...fundo.querySelectorAll("button")];const i=botoes.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();botoes[1].focus()}else if(!e.shiftKey&&i===1){e.preventDefault();botoes[0].focus()}}};
    document.addEventListener("keydown",tecla);
    fundo.querySelector('[data-resposta="nao"]').onclick=()=>concluir(false);
    fundo.querySelector('[data-resposta="sim"]').onclick=()=>concluir(true);
    fundo.querySelector('[data-resposta="nao"]').focus();
  });
}
async function imprimirRelatorio(){
  removerRodapesAntigosConferencia();
  if(!exigirPermissaoRelatoriosBDR("RELATORIOS_EXPORTAR","Você não tem permissão para imprimir/exportar relatórios.")) return;
  if(filtradosAtuais.length===0){alert("Nenhum patrimônio encontrado para imprimir.");return}
  atualizarCabecalhoDocumentoRelatorio();
  const possuiAssinatura=aplicarConferenciaNaImpressao(conferenciaAtualRelatorio);
  if(!possuiAssinatura){
    const continuar=await confirmarRelatorioAtlas("Este relatório ainda não possui conferência assinada. Deseja imprimir sem assinatura?", "Imprimir sem assinatura?");
    if(!continuar)return;
  }
  const tituloAnterior=document.title;
  const obraArquivo=nomesObrasRelatorioAtual().replace(/[^a-zA-Z0-9À-ÿ]+/g,"_").replace(/^_+|_+$/g,"").slice(0,60);
  renderizarTodosItensParaImpressao();
  document.title=`Relatorio_Atividades_Patrimoniais_${obraArquivo || "BDR"}`;
  let restaurado=false;
  const restaurar=()=>{if(restaurado)return;restaurado=true;document.title=tituloAnterior;renderizarTabelaPaginaRelatorio();window.removeEventListener("afterprint",restaurar)};
  window.addEventListener("afterprint",restaurar);
  window.print();
  setTimeout(restaurar,1800);
}

function atualizarKPIsRelatorio(){
  const total = filtradosAtuais.length;
  const uso = filtradosAtuais.filter(p => p.status === "EM_USO").length;
  const estoque = filtradosAtuais.filter(p => p.status === "ESTOQUE").length;
  const manutencao = filtradosAtuais.filter(p => p.status === "MANUTENCAO").length;

  const elTotal = document.getElementById("kpiTotal");
  const elUso = document.getElementById("kpiUso");
  const elEstoque = document.getElementById("kpiEstoque");
  const elManutencao = document.getElementById("kpiManutencao");

  if(elTotal) elTotal.innerText = total;
  if(elUso) elUso.innerText = uso;
  if(elEstoque) elEstoque.innerText = estoque;
  if(elManutencao) elManutencao.innerText = manutencao;
}

async function exportarCSV(){
  if(!exigirPermissaoRelatoriosBDR("RELATORIOS_EXPORTAR", "Você não tem permissão para exportar Excel.")) return;
  if(!filtradosAtuais.length){ alert("Nenhum dado para exportar."); return; }
  if(typeof ExcelJS === "undefined"){
    alert("A biblioteca de formatação do Excel não carregou. Verifique sua conexão e tente novamente.");
    return;
  }

  const usuario = JSON.parse(localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado") || "null");
  const responsavel = usuario?.nome || usuario?.usuario || "-";
  const emitidoEm = new Date().toLocaleString("pt-BR", {timeZone:"America/Cuiaba"});
  const valorNumero = p => {
    const bruto = p?.valor_bem ?? p?.valor_aquisicao ?? p?.valor;
    if(bruto == null || String(bruto).trim() === "") return null;
    const texto = String(bruto).trim().replace(/[^\d,.-]/g, "");
    const numero = Number(texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto);
    return Number.isFinite(numero) ? numero : null;
  };
  const nomeObra = p => {
    const obra = obras.find(o => String(o.id) === String(p.obra_id));
    return obra ? `${obra.codigo_obra || obra.codigo_sienge || "-"} - ${obra.nome || "-"}` : (p.localizacao || "-");
  };
  const corVermelha = "A4161A", corEscura = "111827", corCinza = "64748B";
  const moeda = '"R$" #,##0.00';
  const borda = {top:{style:"thin",color:{argb:"FFD1D5DB"}},bottom:{style:"thin",color:{argb:"FFD1D5DB"}},left:{style:"thin",color:{argb:"FFD1D5DB"}},right:{style:"thin",color:{argb:"FFD1D5DB"}}};
  const livro = new ExcelJS.Workbook();
  livro.creator = "BDR Gestão - Atlas";
  livro.created = new Date();
  const aba = livro.addWorksheet("Patrimônios", {views:[{state:"frozen",ySplit:9}]});
  aba.properties.defaultRowHeight = 18;
  aba.columns = [
    {width:6},{width:21},{width:43},{width:19},{width:17},{width:33},
    {width:22},{width:20},{width:23},{width:16},{width:19},{width:26}
  ];
  const mesclar = (intervalo, texto, tamanho, cor) => {
    aba.mergeCells(intervalo);
    const cel = aba.getCell(intervalo.split(":")[0]);
    cel.value = texto;
    cel.font = {name:"Arial",size:tamanho,bold:true,color:{argb:"FF"+cor}};
    cel.alignment = {vertical:"middle"};
  };
  mesclar("A1:I1","BDR CONSTRUART",15,corVermelha);
  mesclar("A2:I2","RELATÓRIO DE ATIVIDADES PATRIMONIAIS",17,corEscura);
  aba.mergeCells("J1:L1");
  aba.getCell("J1").value = `Emitido em ${emitidoEm}`;
  aba.getCell("J1").font = {name:"Arial",size:9,color:{argb:"FF"+corCinza}};
  aba.getCell("J1").alignment = {horizontal:"right"};
  aba.getRow(1).height = 23;
  aba.getRow(2).height = 30;
  for(let c=1;c<=12;c++) aba.getRow(3).getCell(c).border = {bottom:{style:"medium",color:{argb:"FF"+corVermelha}}};
  aba.getRow(3).height=7;
  const campo = (linha,coluna,rotulo,valor,ate) => {
    aba.mergeCells(linha,coluna,linha,ate);
    const cel=aba.getRow(linha).getCell(coluna);
    cel.value = {richText:[{text:rotulo+" ",font:{bold:true}},{text:String(valor??"-")}]};
    cel.font = {name:"Arial",size:10,color:{argb:"FF"+corEscura}};
    cel.alignment={vertical:"middle",wrapText:true};
  };
  campo(4,1,"Obra(s)/setor(es):",nomesObrasRelatorioAtual(),6);
  campo(4,7,"Período filtrado:",periodoFiltroRelatorioTexto(),12);
  campo(5,1,"Período efetivo dos lançamentos:",periodoEfetivoLancamentos(),6);
  campo(5,7,"Relatório emitido por:",responsavel,12);
  campo(6,1,"Total de patrimônios:",filtradosAtuais.length,6);
  aba.getRow(4).height=27; aba.getRow(5).height=27; aba.getRow(6).height=23;
  aba.mergeCells("A7:L7");
  const descricao=aba.getCell("A7");
  descricao.value="Relação dos patrimônios cadastrados no Atlas/BDR, contendo data, valor, identificação, usuário responsável e obra/setor de lançamento.";
  descricao.font={name:"Arial",size:9,italic:true,color:{argb:"FF"+corCinza}};
  descricao.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF8FAFC"}};
  descricao.border={left:{style:"medium",color:{argb:"FF"+corVermelha}}};
  descricao.alignment={vertical:"middle",indent:1,wrapText:true};
  aba.getRow(7).height=28;
  aba.getRow(8).height=9;
  const cabecalho=["Nº","Identificação","Patrimônio","Tipo","Status","Obra/Setor","Marca","Modelo","Série/Placa","Valor","Data do cadastro","Cadastrado por"];
  aba.getRow(9).values=cabecalho;
  aba.getRow(9).height=29;
  aba.getRow(9).eachCell(c=>{
    c.font={name:"Arial",size:10,bold:true,color:{argb:"FF"+corEscura}};
    c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFE5E7EB"}};
    c.border=borda;
    c.alignment={vertical:"middle",wrapText:true};
  });
  const porObra=new Map();
  filtradosAtuais.forEach((p,i)=>{
    const obra=nomeObra(p),valor=valorNumero(p);
    const row=aba.addRow([i+1,codigoManualBDR(p)||"-",p.nome_bem||"-",p.tipo_item||"-",String(p.status||"-").replaceAll("_"," "),obra,p.marca||"-",p.modelo||"-",p.numero_serie||p.placa||"-",valor,formatarDataHoraCadastroPatrimonio(p),p.usuario_cadastro||p.cadastrado_por||"-"]);
    row.height=Math.max(29, Math.ceil(String(p.nome_bem||"").length/36)*13+8,Math.ceil(obra.length/30)*13+8);
    row.eachCell({includeEmpty:true},c=>{
      c.font={name:"Arial",size:9,color:{argb:"FF"+corEscura}};
      c.border=borda;
      c.alignment={vertical:"middle",wrapText:true};
      if(i%2===1) c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF8FAFC"}};
    });
    row.getCell(10).numFmt=moeda;
    const t=porObra.get(obra)||{quantidade:0,valor:0,semValor:0};
    t.quantidade++;
    if(valor===null)t.semValor++;else t.valor+=valor;
    porObra.set(obra,t);
  });
  const ultima=9+filtradosAtuais.length;
  aba.autoFilter={from:"A9",to:`L${ultima}`};
  aba.mergeCells(ultima+1,1,ultima+1,9);
  aba.getCell(ultima+1,1).value="VALOR TOTAL DOS PATRIMÔNIOS";
  aba.getCell(ultima+1,1).font={name:"Arial",size:10,bold:true,color:{argb:"FF"+corEscura}};
  aba.getCell(ultima+1,1).alignment={horizontal:"right",vertical:"middle"};
  aba.getCell(ultima+1,10).value={formula:`SUM(J10:J${ultima})`};
  aba.getCell(ultima+1,10).numFmt=moeda;
  aba.getCell(ultima+1,10).font={name:"Arial",size:10,bold:true,color:{argb:"FF"+corVermelha}};
  aba.getRow(ultima+1).height=27;
  aba.pageSetup={paperSize:9,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,showGridLines:false,printTitlesRow:"1:9",margins:{left:.2,right:.2,top:.4,bottom:.4,header:.15,footer:.15}};
  aba.headerFooter.oddFooter="&LBDR Gestão | Atlas&R Página &P de &N";
  aba.pageSetup.printArea=`A1:L${ultima+1}`;

  const resumo=livro.addWorksheet("Resumo por obra",{views:[{state:"frozen",ySplit:5}]});
  resumo.columns=[{width:48},{width:19},{width:24},{width:20}];
  resumo.mergeCells("A1:D1");
  resumo.getCell("A1").value="BDR CONSTRUART";
  resumo.getCell("A1").font={name:"Arial",size:15,bold:true,color:{argb:"FF"+corVermelha}};
  resumo.mergeCells("A2:D2");
  resumo.getCell("A2").value="RESUMO PATRIMONIAL POR OBRA";
  resumo.getCell("A2").font={name:"Arial",size:16,bold:true,color:{argb:"FF"+corEscura}};
  resumo.getRow(2).height=29;
  for(let c=1;c<=4;c++)resumo.getRow(3).getCell(c).border={bottom:{style:"medium",color:{argb:"FF"+corVermelha}}};
  resumo.getRow(4).values=["Obras conforme filtros do relatório"];
  resumo.getRow(5).values=["Obra/Setor","Quantidade","Valor total (R$)","Itens sem valor"];
  resumo.getRow(5).eachCell(c=>{c.font={name:"Arial",bold:true,color:{argb:"FF"+corEscura}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFE5E7EB"}};c.border=borda;});
  [...porObra.entries()].sort((a,b)=>b[1].valor-a[1].valor).forEach(([obra,t],i)=>{
    const row=resumo.addRow([obra,t.quantidade,t.valor,t.semValor]);
    row.getCell(3).numFmt=moeda;
    row.eachCell(c=>{c.border=borda;c.font={name:"Arial",size:10};if(i%2)c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF8FAFC"}};});
  });
  const total=[...porObra.values()].reduce((acc,t)=>({q:acc.q+t.quantidade,v:acc.v+t.valor,s:acc.s+t.semValor}),{q:0,v:0,s:0});
  const totalRow=resumo.addRow(["TOTAL GERAL",total.q,total.v,total.s]);
  totalRow.getCell(3).numFmt=moeda;
  totalRow.eachCell(c=>{c.font={name:"Arial",bold:true,color:{argb:"FF"+corVermelha}};c.border=borda;});
  resumo.autoFilter={from:"A5",to:`D${totalRow.number-1}`};
  resumo.pageSetup={paperSize:9,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:1};

  try{
    const buffer=await livro.xlsx.writeBuffer();
    const blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download="relatorio_patrimonios.xlsx";
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  }catch(erro){
    console.error("Falha ao gerar Excel patrimonial:",erro);
    alert("Não foi possível gerar o Excel. Consulte o console para detalhes.");
  }
}

function limparNumero(valor){
  if(valor === null || valor === undefined) return "";
  return String(valor).replace(/\D/g, "");
}

function csvValor(campo){
  return `"${String(campo ?? "").replace(/"/g,'""')}"`;
}

function campoSienge(valor){
  return String(valor ?? "")
    .replace(/;/g, ",")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function anoSienge(valor){
  const v = String(valor ?? "").replace(/\D/g, "");
  return v ? v.slice(0, 4) : "";
}

function primeiroCodigoNumerico(...valores){
  for(const valor of valores){
    const limpo = limparNumero(valor);
    if(limpo) return limpo;
  }
  return "";
}



const BDR_SIENGE_DETALHAMENTO_KEY = "bdr_sienge_detalhamento_campos_v1";

const BDR_SIENGE_CAMPOS_DETALHAMENTO = [
  {id:"marca", label:"Marca", get:p => p.marca},
  {id:"modelo", label:"Modelo", get:p => p.modelo || p.nome_modelo},
  {id:"valor", label:"Valor", get:p => valorSiengeBR(p)},
  {id:"placa", label:"Placa", get:p => p.placa},
  {id:"serie", label:"Série", get:p => p.numero_serie},
  {id:"chassi", label:"Chassi", get:p => p.chassi},
  {id:"ano_fabricacao", label:"Ano Fab", get:p => p.ano_fabricacao},
  {id:"ano_modelo", label:"Ano Mod", get:p => p.ano_modelo},
  {id:"km", label:"KM", get:p => p.km || p.quilometragem},
  {id:"observacao", label:"Observação", get:p => p.observacao}
];

let bdrSiengeCliquesSecretos = 0;
let bdrSiengeTimerSecreto = null;
let bdrSiengeFormatoDetalhamento = carregarFormatoDetalhamentoSienge();

function usuarioPodeEditarDetalhamentoSienge(){
  try{
    const u = JSON.parse(localStorage.getItem("usuario_logado") || "null");
    const nome = String(u?.nome || "").toUpperCase();
    const email = String(u?.email || "").toUpperCase();
    const perfil = String(u?.perfil || "").toUpperCase();

    return perfil === "MASTER" ||
           perfil === "ADMIN" ||
           email.includes("SAULOHENRYSH") ||
           nome.includes("SAULO");
  }catch(e){
    return false;
  }
}

function carregarFormatoDetalhamentoSienge(){
  try{
    const salvo = JSON.parse(localStorage.getItem(BDR_SIENGE_DETALHAMENTO_KEY) || "[]");
    return Array.isArray(salvo) ? salvo : [];
  }catch(e){
    return [];
  }
}

function salvarFormatoDetalhamentoSienge(){
  localStorage.setItem(BDR_SIENGE_DETALHAMENTO_KEY, JSON.stringify(bdrSiengeFormatoDetalhamento));
  renderizarMontagemDetalhamentoSienge();
  alert("✅ Formato do detalhamento Sienge salvo.");
}

function limparFormatoDetalhamentoSienge(){
  if(!confirm("Limpar todos os campos extras? A descrição ficará só com o nome do bem.")) return;
  bdrSiengeFormatoDetalhamento = [];
  localStorage.setItem(BDR_SIENGE_DETALHAMENTO_KEY, JSON.stringify(bdrSiengeFormatoDetalhamento));
  renderizarMontagemDetalhamentoSienge();
}

function toqueSecretoSienge(){
  if(!usuarioPodeEditarDetalhamentoSienge()){
    return;
  }

  bdrSiengeCliquesSecretos++;

  clearTimeout(bdrSiengeTimerSecreto);
  bdrSiengeTimerSecreto = setTimeout(() => {
    bdrSiengeCliquesSecretos = 0;
  }, 1800);

  if(bdrSiengeCliquesSecretos >= 5){
    bdrSiengeCliquesSecretos = 0;
    const box = document.getElementById("siengeDetalhamentoSecretBox");
    if(box){
      box.classList.toggle("ativo");
      renderizarMontagemDetalhamentoSienge();
      box.scrollIntoView({behavior:"smooth", block:"center"});
    }
  }
}

function adicionarCampoDetalhamentoSienge(id){
  if(!bdrSiengeFormatoDetalhamento.includes(id)){
    bdrSiengeFormatoDetalhamento.push(id);
  }
  renderizarMontagemDetalhamentoSienge();
}

function removerCampoDetalhamentoSienge(id){
  bdrSiengeFormatoDetalhamento = bdrSiengeFormatoDetalhamento.filter(x => x !== id);
  renderizarMontagemDetalhamentoSienge();
}

function moverCampoDetalhamentoSienge(id, direcao){
  const i = bdrSiengeFormatoDetalhamento.indexOf(id);
  if(i < 0) return;

  const novo = i + direcao;
  if(novo < 0 || novo >= bdrSiengeFormatoDetalhamento.length) return;

  const arr = [...bdrSiengeFormatoDetalhamento];
  [arr[i], arr[novo]] = [arr[novo], arr[i]];
  bdrSiengeFormatoDetalhamento = arr;
  renderizarMontagemDetalhamentoSienge();
}

function campoDetalhamentoPorId(id){
  return BDR_SIENGE_CAMPOS_DETALHAMENTO.find(c => c.id === id);
}

function renderizarMontagemDetalhamentoSienge(){
  const campos = document.getElementById("siengeCamposDisponiveis");
  const seq = document.getElementById("siengeSequenciaAtual");
  const preview = document.getElementById("siengePreviewDetalhamento");

  if(!campos || !seq) return;

  campos.innerHTML = BDR_SIENGE_CAMPOS_DETALHAMENTO.map(c => `
    <button type="button" class="sienge-field-btn" onclick="adicionarCampoDetalhamentoSienge('${c.id}')">
      + ${c.label}
    </button>
  `).join("");

  const baseHtml = `
    <div class="sienge-order-item">
      <div class="num">1</div>
      <div>
        <strong>Nome do bem</strong>
        <small>campo fixo</small>
      </div>
      <div></div>
    </div>
  `;

  const extrasHtml = bdrSiengeFormatoDetalhamento.map((id, idx) => {
    const c = campoDetalhamentoPorId(id);
    if(!c) return "";

    const num = idx + 2;

    return `
      <div class="sienge-order-item">
        <div class="num">${num}</div>
        <div>
          <strong>${c.label}</strong>
          <small>${id}</small>
        </div>
        <div class="sienge-order-actions">
          <button type="button" class="up" onclick="moverCampoDetalhamentoSienge('${id}', -1)">↑</button>
          <button type="button" class="down" onclick="moverCampoDetalhamentoSienge('${id}', 1)">↓</button>
          <button type="button" class="del" onclick="removerCampoDetalhamentoSienge('${id}')">×</button>
        </div>
      </div>
    `;
  }).join("");

  seq.innerHTML = baseHtml + extrasHtml;

  if(preview){
    const exemplo = {
      nome_bem:"SEMI-REBOQUE SR/NOMA STRAT3E SRCAT",
      marca:"Noma",
      modelo:"SR/NOMA STRAT3E SRCAT",
      valor_bem:200000,
      placa:"FO9H64",
      numero_serie:"SERIE123",
      chassi:"CHASSI123",
      ano_fabricacao:"2021",
      ano_modelo:"2021",
      km:"123000",
      observacao:"OBS EXEMPLO"
    };

    preview.innerHTML = "<b>Exemplo:</b><br>" + montarDetalhamentoSienge(exemplo);
  }
}

function valorSiengeBR(p){
  const bruto = p?.valor_bem ?? p?.valor_aquisicao ?? p?.valor ?? "";
  if(bruto === null || bruto === undefined || bruto === "") return "";

  if(typeof bruto === "number"){
    if(isNaN(bruto) || bruto <= 0) return "";
    return "R$ " + bruto.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  let s = String(bruto).trim();
  if(!s) return "";

  s = s.replace(/R\$/gi, "").replace(/\s/g, "");

  if(s.includes(",") && s.includes(".")){
    s = s.replace(/\./g, "").replace(",", ".");
  }else if(s.includes(",")){
    s = s.replace(",", ".");
  }

  const n = Number(s);
  if(isNaN(n) || n <= 0) return "";

  return "R$ " + n.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
}

function montarDetalhamentoSienge(p){
  const partes = [];

  const nome = p.nome_bem || p.descricao || p.detalhamento || "";
  if(nome) partes.push(nome);

  const campos = Array.isArray(bdrSiengeFormatoDetalhamento)
    ? bdrSiengeFormatoDetalhamento
    : carregarFormatoDetalhamentoSienge();

  campos.forEach(id => {
    const cfg = campoDetalhamentoPorId(id);
    if(!cfg) return;

    const valor = cfg.get(p);
    if(valor === null || valor === undefined || valor === "") return;

    partes.push(valor);
  });

  const unico = [];

  partes.forEach(parte => {
    const txt = campoSienge(parte);
    if(!txt) return;

    if(!unico.some(x => normalizarSiengeBusca(x) === normalizarSiengeBusca(txt))){
      unico.push(txt);
    }
  });

  return unico.join(" - ");
}



function ehVeiculoPatrimonio(p){
  const texto = normalizarSiengeBusca(`
    ${p?.tipo_item || ""}
    ${p?.nome_bem || ""}
    ${p?.placa || ""}
    ${p?.chassi || ""}
  `);

  return texto.includes("VEICULO") ||
         texto.includes("VEÍCULO") ||
         texto.includes("CAMINHAO") ||
         texto.includes("CAMINHÃO") ||
         texto.includes("CARRO") ||
         texto.includes("VW/") ||
         texto.includes("TRATOR") ||
         texto.includes("SEMI REBOQUE") ||
         texto.includes("SEMI-REBOQUE") ||
         !!p?.placa ||
         !!p?.chassi;
}


/* =========================================================
   MOTOR PREMIUM DE INSUMOS SIENGE
   Busca em tabela separada: sienge_insumos
========================================================= */
function normalizarMotorInsumo(txt){
  return String(txt || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/gi, " ").replace(/\s+/g, " ").trim().toUpperCase();
}
function tokensMotorInsumo(txt){
  const stop = new Set(["DE","DA","DO","DAS","DOS","PARA","COM","SEM","POR","EM","E","A","O","OS","AS","UM","UMA","BDR","LTDA","UN","UND","PC","PÇ"]);
  return normalizarMotorInsumo(txt).split(/\s+/).filter(t => t.length >= 2 && !stop.has(t));
}
function expandirSinonimosInsumo(tokens){
  const mapa={"TV":["TELEVISOR","TELEVISAO"],"TELEVISOR":["TV","TELEVISAO"],"REFRIGERADOR":["GELADEIRA"],"GELADEIRA":["REFRIGERADOR"],"CELULAR":["SMARTPHONE","TELEFONE"],"SMARTPHONE":["CELULAR","TELEFONE"],"CARRETA":["SEMI","REBOQUE","SEMIREBOQUE"],"SEMI":["CARRETA","REBOQUE","SEMIREBOQUE"],"REBOQUE":["CARRETA","SEMI","SEMIREBOQUE"],"NOTEBOOK":["LAPTOP","COMPUTADOR"],"LAPTOP":["NOTEBOOK"],"ESMERILADORA":["ESMERILHADEIRA"],"ESMERILHADEIRA":["ESMERILADORA"],"CONDICIONADO":["AR","SPLIT"]};
  const out=new Set(tokens); tokens.forEach(t=>(mapa[t]||[]).forEach(s=>out.add(s))); return Array.from(out);
}
async function carregarSiengeInsumosPremium(mostrarAviso=false){
  if(!db()) return;
  const resultado=document.getElementById("resultadoImportacaoInsumos");
  try{
    let todos=[]; let from=0; const step=1000;
    while(true){
      const resp=await db().from("sienge_insumos").select("codigo,descricao,tabela_insumo,descricao_normalizada,ativo").eq("ativo",true).range(from,from+step-1);
      if(resp.error) throw resp.error;
      const data=resp.data||[]; todos=todos.concat(data);
      if(data.length<step) break; from+=step; if(from>30000) break;
    }
    siengeInsumos=todos; window.siengeInsumos=todos; atualizarStatsInsumosPremium();
    if(resultado) resultado.innerHTML=`✅ Insumos carregados na tela: <b>${todos.length}</b> registros.`;
    if(mostrarAviso) alert(`✅ ${todos.length} insumos carregados do banco.`);
  }catch(e){
    console.warn("Motor Sienge: tabela sienge_insumos indisponível:",e.message);
    if(resultado) resultado.innerHTML=`⚠️ Tabela <b>sienge_insumos</b> ainda não carregou. Rode o SQL de criação e importe a planilha.`;
  }
}

async function carregarInsumosPremium(mostrarAviso=false){
  return await carregarSiengeInsumosPremium(mostrarAviso);
}

function atualizarStatsInsumosPremium(){
  const total=siengeInsumos.length, t2=siengeInsumos.filter(x=>String(x.tabela_insumo)==="2").length, t3=siengeInsumos.filter(x=>String(x.tabela_insumo)==="3").length;
  if(document.getElementById("statInsumosTotal")) document.getElementById("statInsumosTotal").innerText=total;
  if(document.getElementById("statInsumosT2")) document.getElementById("statInsumosT2").innerText=t2;
  if(document.getElementById("statInsumosT3")) document.getElementById("statInsumosT3").innerText=t3;
}
function linhaParaInsumoPremium(row,idx){
  const codigo=String(row[0]??"").trim(); const descricao=String(row[1]??"").trim(); let tabela=String(row[2]??"2").trim();
  if(idx===0){const h0=normalizarMotorInsumo(codigo), h1=normalizarMotorInsumo(descricao); if(h0.includes("COD")||h1.includes("INSUMO")||h1.includes("DESCR")) return null;}
  tabela=tabela.replace(/[^0-9]/g,"")||"2"; if(!codigo||!descricao) return null; if(!/^\d+$/.test(codigo)) return null; if(tabela!=="2"&&tabela!=="3") tabela="2";
  return {codigo,descricao,tabela_insumo:Number(tabela),descricao_normalizada:normalizarMotorInsumo(descricao),ativo:true};
}
async function importarInsumosPremium(){
  const input = document.getElementById("arquivoInsumosPremium");
  const status = document.getElementById("statusImportacaoInsumosPremium");

  if(!input || !input.files || !input.files[0]){
    alert("Selecione a planilha de insumos primeiro.");
    return;
  }

  if(!db()){
    alert("Supabase não carregado.");
    return;
  }

  const arquivo = input.files[0];

  if(status){
    status.innerHTML = "⏳ Lendo planilha...";
  }

  try{
    const dados = await arquivo.arrayBuffer();
    const workbook = XLSX.read(dados, {type:"array"});

    let linhas = [];

    workbook.SheetNames.forEach(nomeAba => {
      const sheet = workbook.Sheets[nomeAba];
      const matriz = XLSX.utils.sheet_to_json(sheet, {header:1, defval:""});

      matriz.forEach((row, index) => {
        if(!row || row.length === 0) return;

        const a = String(row[0] ?? "").trim();
        const b = String(row[1] ?? "").trim();
        const c = String(row[2] ?? "").trim();

        const cabecalho = normalizarSiengeBusca(a + " " + b + " " + c);
        if(index === 0 && cabecalho.includes("CODIGO") && cabecalho.includes("INSUMO")){
          return;
        }

        let codigo = a;
        let descricao = b;
        let tabela = c;

        if(!tabela){
          const abaNorm = normalizarSiengeBusca(nomeAba);
          if(abaNorm.includes("2")) tabela = "2";
          if(abaNorm.includes("3")) tabela = "3";
        }

        tabela = String(tabela || "").replace(/\D/g, "");
        codigo = String(codigo || "").trim();
        descricao = String(descricao || "").trim();

        if(!codigo || !descricao || !tabela) return;
        if(tabela !== "2" && tabela !== "3") return;

        linhas.push({
          codigo,
          descricao,
          tabela_insumo:tabela,
          descricao_normalizada:normalizarSiengeBusca(descricao),
          ativo:true
        });
      });
    });

    if(linhas.length === 0){
      if(status){
        status.innerHTML = `
          ⚠️ Nenhum insumo válido encontrado.<br>
          O arquivo precisa ter:<br>
          Coluna A = Código<br>
          Coluna B = Insumo<br>
          Coluna C = Planilha
        `;
      }
      alert("Nenhum insumo válido encontrado.");
      return;
    }

    const confirmar = confirm(`Importar ${linhas.length} insumos para a tabela premium?`);
    if(!confirmar) return;

    const mapa = new Map();

    linhas.forEach(item => {
      const chave = `${item.codigo}|${item.tabela_insumo}|${item.descricao_normalizada}`;

      if(!mapa.has(chave)){
        mapa.set(chave, item);
      }
    });

    const payload = Array.from(mapa.values());
    const duplicadosExatosIgnorados = linhas.length - payload.length;

    let enviados = 0;
    let erros = 0;
    const loteTamanho = 500;
    const totalLotes = Math.ceil(payload.length / loteTamanho);

    for(let i = 0; i < payload.length; i += loteTamanho){
      const loteAtual = Math.floor(i / loteTamanho) + 1;
      const lote = payload.slice(i, i + loteTamanho);

      atualizarProgressoImportacaoInsumos(
        status,
        loteAtual,
        totalLotes,
        enviados,
        duplicadosExatosIgnorados
      );

      const {error} = await db()
        .from("sienge_insumos")
        .upsert(lote, {
          onConflict:"codigo,tabela_insumo,descricao"
        });

      if(error){
        console.error("Erro ao importar lote sienge_insumos:", error);
        erros += lote.length;
      }else{
        enviados += lote.length;
      }

      atualizarProgressoImportacaoInsumos(
        status,
        loteAtual,
        totalLotes,
        enviados,
        duplicadosExatosIgnorados
      );

      // Pequena pausa para a tela conseguir atualizar visualmente.
      await new Promise(resolve => setTimeout(resolve, 40));
    }

    if(status){
      status.innerHTML = `
        ✅ Importação concluída.<br>
        Lidos no Excel: <b>${linhas.length}</b><br>
        Enviados/atualizados: <b>${enviados}</b><br>
        Duplicados exatos ignorados: <b>${duplicadosExatosIgnorados}</b><br>
        Erros: <b>${erros}</b>
      `;
    }

    alert(`✅ Importação concluída.\nLidos no Excel: ${linhas.length}\nEnviados/atualizados: ${enviados}\nDuplicados exatos ignorados: ${duplicadosExatosIgnorados}\nErros: ${erros}`);

    if(typeof carregarSiengeInsumosPremium === "function"){
      await carregarSiengeInsumosPremium(true);
    }

  }catch(e){
    console.error("Erro geral na importação de insumos:", e);
    if(status){
      status.innerHTML = "❌ Erro ao importar: " + (e.message || e);
    }
    alert("Erro ao importar insumos: " + (e.message || e));
  }
}

function classificarInsumoSiengePremium(texto, tabelaRef="2"){
  const alvo = normalizarSiengeBusca(texto);
  const tabela = String(tabelaRef || "2");

  if(!alvo){
    return {codigo:"", confianca:0, motivo:"Descrição vazia", candidatos:[]};
  }

  const base = (siengeInsumos || []).filter(item =>
    item &&
    item.ativo !== false &&
    String(item.tabela_insumo) === tabela
  );

  const exato = base.find(item =>
    normalizarSiengeBusca(item.descricao) === alvo
  );

  if(exato){
    return {
      codigo:String(exato.codigo),
      descricao:exato.descricao,
      tabela:String(exato.tabela_insumo),
      confianca:99,
      score:9999,
      motivo:"Correspondência exata",
      candidatos:[{
        codigo:String(exato.codigo),
        descricao:exato.descricao,
        tabela:String(exato.tabela_insumo),
        confianca:99,
        score:9999
      }]
    };
  }

  const alvoTokens = alvo.split(" ").filter(Boolean);
  let melhores = [];

  base.forEach(item => {
    const desc = normalizarSiengeBusca(item.descricao);
    const descTokens = desc.split(" ").filter(Boolean);

    let score = 0;

    alvoTokens.forEach(tok => {
      if(descTokens.includes(tok)) score += 10;
      else if(desc.includes(tok)) score += 4;
    });

    if(desc.includes(alvo)) score += 80;
    if(alvo.includes(desc)) score += 60;

    const max = Math.max(alvoTokens.length * 10, 1);
    const confianca = Math.min(98, Math.max(1, Math.round((score / (max + 80)) * 100)));

    if(score > 0){
      melhores.push({
        codigo:String(item.codigo),
        descricao:item.descricao,
        tabela:String(item.tabela_insumo),
        score,
        confianca
      });
    }
  });

  melhores.sort((a,b) =>
    b.score - a.score ||
    b.confianca - a.confianca ||
    a.descricao.length - b.descricao.length
  );

  melhores = melhores.slice(0,5);
  const melhor = melhores[0];

  if(!melhor){
    return {codigo:"", confianca:0, motivo:"Nenhum candidato encontrado", candidatos:[]};
  }

  return {
    codigo:melhor.codigo,
    descricao:melhor.descricao,
    tabela:melhor.tabela,
    confianca:melhor.confianca,
    score:melhor.score,
    motivo:melhor.confianca >= 90 ? "Alta confiança" : melhor.confianca >= 70 ? "Confiança média" : "Baixa confiança - revisar",
    candidatos:melhores
  };
}

function textoClassificacaoPatrimonio(p){return [p?.nome_bem,p?.tipo_item,p?.marca,p?.modelo,p?.observacao,p?.descricao,p?.detalhamento].filter(Boolean).join(" ");}
function testarMotorInsumoPremium(){
  const txt=document.getElementById("testeInsumoDescricao")?.value||""; const tabela=document.getElementById("testeInsumoTabela")?.value||"2"; const box=document.getElementById("resultadoTesteInsumo"); const r=classificarInsumoSiengePremium(txt,tabela); const classe=r.confianca>=90?"alta":r.confianca>=70?"media":"baixa";
  if(!r.codigo){box.innerHTML=`⚠️ ${r.motivo}`;return;}
  box.innerHTML=`<div><b>Código sugerido:</b> ${r.codigo}</div><div><b>Descrição:</b> ${r.descricao}</div><div><b>Confiança:</b> <span class="sienge-confidence ${classe}">${r.confianca}%</span></div><hr><b>Top candidatos:</b><br>${r.candidatos.map(c=>`• ${c.codigo} - ${c.descricao} <b>(${c.confianca}%)</b>`).join("<br>")}`;
}

function normalizarSiengeBusca(txt){
  return String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function obraDoPatrimonio(p){
  return obras.find(o => String(o.id) === String(p.obra_id)) || null;
}

function empresaDaObra(obra){
  if(!obra) return null;

  return empresas.find(e =>
    String(e.id) === String(obra.empresa_id) ||
    String(e.codigo_empresa || "") === String(obra.codigo_empresa || "") ||
    String(e.codigo_empresa || "") === String(obra.codigo_obra || "")
  ) || null;
}

function tabelaInsumoDaObra(obra){
  // Conforme padrão informado no modelo: o código do produto vem sempre da Tabela 2.
  return "2";
}

function buscarCodigoSienge(tipo, descricao, tabelaRef="PADRAO"){
  const desc = normalizarSiengeBusca(descricao);
  if(!desc) return "";

  const tabela = String(tabelaRef || "PADRAO");

  let item = siengeCodigos.find(c =>
    String(c.tipo) === String(tipo) &&
    String(c.tabela_ref || "PADRAO") === tabela &&
    normalizarSiengeBusca(c.descricao) === desc
  );

  if(item) return item.codigo || "";

  item = siengeCodigos.find(c =>
    String(c.tipo) === String(tipo) &&
    String(c.tabela_ref || "PADRAO") === tabela &&
    (
      normalizarSiengeBusca(c.descricao).includes(desc) ||
      desc.includes(normalizarSiengeBusca(c.descricao))
    )
  );

  return item?.codigo || "";
}

/*
  BUSCA DE INSUMO SIENGE - versão melhorada
  1) Usa código digitado no patrimônio, se existir
  2) Procura na tabela sienge_codigos do sistema
  3) Procura na lista local importada do Excel tabela 2 e 3
  4) Usa palavras-chave comuns para não deixar "Código do insumo" vazio
*/
function textosBuscaInsumo(p){
  return [
    p.codigo_insumo,
    p.insumo,
    p.nome_bem,
    p.descricao,
    p.detalhamento,
    p.observacao,
    p.tipo_item,
    p.marca,
    p.modelo
  ].filter(Boolean);
}

function tokensSienge(txt){
  const stop = new Set([
    "DE","DA","DO","DAS","DOS","PARA","COM","SEM","POR","EM","E","A","O",
    "UM","UMA","OS","AS","BDR","PATRIMONIO","PATRIMONIO","ULTRA","HULL"
  ]);

  return normalizarSiengeBusca(txt)
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !stop.has(t));
}

function buscarInsumoFallbackLocal(descricao, tabelaRef="2"){
  const lista = window.SIENGE_INSUMOS_FALLBACK || [];
  if(!lista.length) return "";

  const alvo = normalizarSiengeBusca(descricao);
  if(!alvo) return "";

  const tabela = String(tabelaRef || "2");

  const candidatosTabela = lista.filter(x => String(x.t) === tabela);
  const candidatosOutraTabela = lista.filter(x => String(x.t) !== tabela);
  const grupos = [candidatosTabela, candidatosOutraTabela];

  for(const grupo of grupos){
    let item = grupo.find(x => normalizarSiengeBusca(x.d) === alvo);
    if(item) return String(item.c || "").trim();

    item = grupo.find(x => {
      const desc = normalizarSiengeBusca(x.d);
      return desc && (desc.includes(alvo) || alvo.includes(desc));
    });
    if(item) return String(item.c || "").trim();
  }

  const alvoTokens = tokensSienge(alvo);
  if(alvoTokens.length === 0) return "";

  let melhor = null;
  let melhorScore = 0;

  for(const grupo of grupos){
    for(const item of grupo){
      const desc = normalizarSiengeBusca(item.d);
      const descTokens = tokensSienge(desc);
      if(descTokens.length === 0) continue;

      let score = 0;

      alvoTokens.forEach(tok => {
        if(descTokens.includes(tok)) score += 8;
        else if(desc.includes(tok)) score += 4;
      });

      if(descTokens[0] && alvoTokens.includes(descTokens[0])) score += 6;
      if(alvoTokens[0] && desc.includes(alvoTokens[0])) score += 5;

      if(score > melhorScore){
        melhorScore = score;
        melhor = item;
      }
    }

    if(melhor && melhorScore >= 8){
      return String(melhor.c || "").trim();
    }
  }

  return "";
}

function buscarInsumoPorPalavraChave(p, tabelaRef="2"){
  const texto = normalizarSiengeBusca(textosBuscaInsumo(p).join(" "));

  const regras = [
    {chaves:["GELADEIRA","REFRIGERADOR"], busca:"REFRIGERADOR"},
    {chaves:["BEBEDOURO"], busca:"BEBEDOURO"},
    {chaves:["AR CONDICIONADO","CONDICIONADO"], busca:"AR CONDICIONADO"},
    {chaves:["NOTEBOOK","LAPTOP"], busca:"NOTEBOOK"},
    {chaves:["TABLET","REDMI PAD","IPAD"], busca:"TABLET"},
    {chaves:["IPHONE"], busca:"CELULAR IPHONE"},
    {chaves:["SMARTPHONE","CELULAR","SAMSUNG"], busca:"CELULAR"},
    {chaves:["TELEVISOR","TV "," TV","TELEVISAO","TELEVISÃO"], busca:"TELEVISOR"},
    {chaves:["IMPRESSORA","MULTIFUNCIONAL"], busca:"IMPRESSORA"},
    {chaves:["TENDA"], busca:"TENDA"},
    {chaves:["FURADEIRA"], busca:"FURADEIRA"},
    {chaves:["ESMERILHADEIRA","ESMERILADORA","LIXADEIRA"], busca:"ESMERILHADEIRA"},
    {chaves:["BEBEDOURO"], busca:"BEBEDOURO"},
    {chaves:["MESA"], busca:"MESA"},
    {chaves:["CADEIRA"], busca:"CADEIRA"},
    {chaves:["ARMARIO","ARMÁRIO"], busca:"ARMARIO"},
    {chaves:["PALETEIRA"], busca:"PALETEIRA"},
    {chaves:["CARRINHO"], busca:"CARRINHO"}
  ];

  for(const regra of regras){
    if(regra.chaves.some(chave => texto.includes(normalizarSiengeBusca(chave)))){
      const codigo = buscarCodigoSienge("INSUMO", regra.busca, tabelaRef) ||
        buscarInsumoFallbackLocal(regra.busca, tabelaRef);

      if(codigo) return codigo;
    }
  }

  return "";
}

function codigoInsumoPadraoFinal(p, tabelaRef="2"){
  /*
    Última segurança para não sair coluna "Código do insumo" vazia.
    Primeiro tenta algo genérico de equipamento/ferramenta. Se não existir,
    usa 4440, que está na tabela 2 como peça de reposição para equipamentos e ferramentas.
  */
  const texto = normalizarSiengeBusca(textosBuscaInsumo(p).join(" "));

  if(texto.includes("FERRAMENTA") || texto.includes("MAQUINA") || texto.includes("EQUIPAMENTO")){
    return buscarInsumoFallbackLocal("PEÇA DE REPOSIÇÃO PARA EQUIPAMENTOS E FERRAMENTAS", tabelaRef) || "4440";
  }

  return buscarInsumoFallbackLocal("PEÇA DE REPOSIÇÃO PARA EQUIPAMENTOS E FERRAMENTAS", tabelaRef) || "4440";
}

function buscarInsumoSienge(p, obra){
  const tabela = tabelaInsumoDaObra(obra);
  const tentativas = textosBuscaInsumo(p);

  for(const t of tentativas){
    const limpo = String(t || "").trim();
    if(limpo && /^\d+$/.test(limpo)) return limpo;
  }

  const motor = classificarInsumoSiengePremium(textoClassificacaoPatrimonio(p), tabela);
  if(motor.codigo && motor.confianca >= 70) return motor.codigo;

  for(const t of tentativas){
    const limpo = String(t || "").trim();
    const codigoBanco = buscarCodigoSienge("INSUMO", limpo, tabela);
    if(codigoBanco) return codigoBanco;
    const codigoLocal = buscarInsumoFallbackLocal(limpo, tabela);
    if(codigoLocal) return codigoLocal;
  }

  const codigoPorChave = buscarInsumoPorPalavraChave(p, tabela);
  if(codigoPorChave) return codigoPorChave;

  return codigoInsumoPadraoFinal(p, tabela);
}

function codigoCentroCustoSienge(p){
  const obra = obraDoPatrimonio(p);
  const empresa = empresaDaObra(obra);

  /*
    Padrão do modelo: centro de custo deve sair preenchido.
    Primeiro tenta os campos cadastrados; se não encontrar, usa 10011.
  */
  return primeiroCodigoNumerico(
    p.centro_custo,
    p.codigo_centro_custo,
    obra?.codigo_centro_custo,
    empresa?.codigo_centro_custo,
    empresa?.centro_custo,
    obra?.centro_custo,
    "10011"
  );
}

function codigoSetorObraInicialSienge(p){
  const obra = obraDoPatrimonio(p);
  const empresa = empresaDaObra(obra);

  /*
    CORREÇÃO SIENGE:
    Código setor/obra inicial deve ser o código da OBRA/SETOR,
    não o código da empresa.
  */
  return primeiroCodigoNumerico(
    p.codigo_setor_obra,
    p.codigo_setor_obra_sienge,
    p.codigo_obra_sienge,

    obra?.codigo_setor_obra,
    obra?.codigo_setor_obra_sienge,
    obra?.codigo_obra_sienge,
    obra?.codigo_sienge_obra,
    obra?.codigo_sienge,
    obra?.codigo_obra,

    empresa?.codigo_setor_obra,
    empresa?.codigo_setor_obra_sienge,
    empresa?.codigo_obra_sienge,
    empresa?.codigo_sienge_obra,

    p.obra_id
  );
}

function codigoModeloSienge(p){
  if(p.codigo_modelo && /^\d+$/.test(String(p.codigo_modelo).trim())){
    return String(p.codigo_modelo).trim();
  }

  return buscarCodigoSienge("MODELO", p.modelo || p.nome_modelo || "");
}

function codigoMarcaSienge(p){
  if(p.codigo_marca && /^\d+$/.test(String(p.codigo_marca).trim())){
    return String(p.codigo_marca).trim();
  }

  return buscarCodigoSienge("MARCA", p.marca || "");
}

function codigoCorSienge(p){
  if(p.codigo_cor && /^\d+$/.test(String(p.codigo_cor).trim())){
    return String(p.codigo_cor).trim();
  }

  return buscarCodigoSienge("COR", p.cor || "");
}

function codigoEstadoConservacaoSienge(p){
  /*
    REGRA OFICIAL BDR:
    O Sienge precisa receber código numérico.
    Nunca exportar texto como BOM, RUIM, REGULAR, ÓTIMO.
  */

  if(p.codigo_estado_conservacao && /^\d+$/.test(String(p.codigo_estado_conservacao).trim())){
    return String(p.codigo_estado_conservacao).trim();
  }

  const textoEstado =
    p.estado_conservacao ||
    p.estado_material ||
    p.estado ||
    "";

  const codigoCadastrado =
    buscarCodigoSienge("ESTADO_CONSERVACAO", textoEstado) ||
    buscarCodigoSienge("ESTADO", textoEstado) ||
    buscarCodigoSienge("ESTADO DE CONSERVACAO", textoEstado);

  if(/^\d+$/.test(String(codigoCadastrado || "").trim())){
    return String(codigoCadastrado).trim();
  }

  return estadoConservacaoSienge(textoEstado) || "2";
}

function codigoCombustivelSienge(p){
  if(p.codigo_combustivel && /^\d+$/.test(String(p.codigo_combustivel).trim())){
    return String(p.codigo_combustivel).trim();
  }

  return buscarCodigoSienge("COMBUSTIVEL", p.combustivel || "");
}

function adicionarPendencia(pendencias, tipo, p){
  const codigo = codigoManualBDR(p) || p.codigo_qr || p.id || "-";
  pendencias.push(`${tipo}: ${codigo} - ${p.nome_bem || "-"}`);
}

function estadoConservacaoSienge(valor){
  const v = String(valor || "").toUpperCase().trim();

  // O Sienge pede código. Mantém código quando vier numérico.
  if(/^\d+$/.test(v)) return v;
  if(!v) return "";
  if(v.includes("NOVO") || v.includes("NOVA")) return "1";
  if(v.includes("BOM") || v.includes("BOA")) return "2";
  if(v.includes("REGULAR")) return "3";
  if(v.includes("RUIM")) return "4";

  return v;
}

function prefixoSienge(p){
  return "BDR";
}

function exportarSiengeCSV(){

  if(!exigirPermissaoRelatoriosBDR("SIENGE_EXPORTAR", "Você não tem permissão para exportar Sienge.")) return;

  if(filtradosAtuais.length === 0){
    alert("Nenhum bem filtrado para exportar ao Sienge.");
    return;
  }

  if((!siengeCodigos || siengeCodigos.length === 0) && !(window.SIENGE_INSUMOS_FALLBACK || []).length){
    alert("Atenção: códigos Sienge não foram carregados. Abra novamente a página ou confira a tabela sienge_codigos.");
    return;
  }

  const linhas = [];
  const pendencias = [];

  linhas.push([
    "Prefixo",
    "Codigo manual",
    "Codigo centro de custo",
    "Codigo do insumo",
    "Marca",
    "Codigo do modelo",
    "Detalhamento",
    "Estado de conservacao",
    "Codigo setor/obra inicial",
    "Cor",
    "Combustivel",
    "Numero de serie/chassi",
    "Ano de fabricacao",
    "Ano do modelo",
    "Placa"
  ]);

  filtradosAtuais.forEach(p => {
    const obra = obraDoPatrimonio(p);

    const prefixo = "BDR";
    const codigoManual = codigoManualBDR(p);
    const centroCusto = codigoCentroCustoSienge(p);
    const codigoInsumo = buscarInsumoSienge(p, obra);

    // Marca pode ficar vazia conforme seu modelo.
    // Código do modelo agora sai no campo correto do Sienge.
    const marca = "";
    const modelo = codigoModeloSienge(p);

    // Detalhamento = descrição + marca + modelo, separado por hífen.
    const detalhamento = montarDetalhamentoSienge(p);

    // Estado, setor/obra, cor e combustível saem por código.
    const estado = codigoEstadoConservacaoSienge(p);
    const setorObra = codigoSetorObraInicialSienge(p);
    const cor = codigoCorSienge(p);
    const combustivel = codigoCombustivelSienge(p);

    const serieChassi = campoSienge(p.numero_serie || p.chassi || "");
    const anoFabricacao = anoSienge(p.ano_fabricacao || p.ano || "");
    const anoModelo = anoSienge(p.ano_modelo || "");
    const placa = campoSienge(p.placa || "");

    const ehVeiculo = ehVeiculoPatrimonio(p);

    if(!codigoManual) adicionarPendencia(pendencias, "Sem código manual", p);
    if(String(codigoManual).length > 10) adicionarPendencia(pendencias, "Código manual acima de 10 caracteres", p);
    if(!centroCusto) adicionarPendencia(pendencias, "Sem centro de custo", p);
    if(!codigoInsumo) adicionarPendencia(pendencias, "Sem código do insumo", p);
    if((p.modelo || p.nome_modelo) && !modelo) adicionarPendencia(pendencias, "Modelo informado sem código Sienge", p);
    if(!detalhamento) adicionarPendencia(pendencias, "Sem detalhamento", p);
    // Estado de conservação agora nunca sai vazio: se não achar cadastro, usa 2 = BOM.
    // if(!estado) adicionarPendencia(pendencias, "Sem estado de conservação por código", p);
    if(!setorObra) adicionarPendencia(pendencias, "Sem código setor/obra", p);
    if(!cor && p.cor) adicionarPendencia(pendencias, "Cor sem código Sienge", p);

    if(ehVeiculo){
      if(!combustivel) adicionarPendencia(pendencias, "Veículo sem combustível", p);
      if(!anoFabricacao) adicionarPendencia(pendencias, "Veículo sem ano de fabricação", p);
      if(!anoModelo) adicionarPendencia(pendencias, "Veículo sem ano do modelo", p);
      if(!placa) adicionarPendencia(pendencias, "Veículo sem placa", p);
    }

    linhas.push([
      prefixo,
      codigoManual,
      centroCusto,
      codigoInsumo,
      marca,
      modelo,
      detalhamento,
      estado,
      setorObra,
      cor,
      combustivel,
      serieChassi,
      anoFabricacao,
      anoModelo,
      placa
    ]);
  });

  if(pendencias.length > 0){
    const amostra = pendencias.slice(0, 18).join("\n");
    const continuar = confirm(
      `Exportação com pendências: ${pendencias.length}\n\n${amostra}${pendencias.length > 18 ? "\n..." : ""}\n\nDeseja exportar mesmo assim?`
    );

    if(!continuar) return;
  }

  const csv = linhas
    .map(linha => linha.map(campoSienge).join(";"))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  const agora = new Date();
  const dataBR = agora.toLocaleDateString("pt-BR").replaceAll("/", "-");

  a.href = url;
  a.download = `sienge_importar_bens_${dataBR}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}



function gerarNotificacoesRelatorio(){
  const semValor = patrimonios.filter(p => !Number(p.valor_bem || 0)).length;
  const manutencao = patrimonios.filter(p => p.status === "MANUTENCAO").length;
  const baixados = patrimonios.filter(p => p.status === "BAIXADO").length;

  const semSerie = patrimonios.filter(p =>
    ehVeiculoPatrimonio(p) && !p.numero_serie && !p.placa && !p.chassi
  ).length;

  const lista = [];

  if(semValor > 0){
    lista.push({
      titulo:"⚠️ Patrimônios sem valor",
      texto:`${semValor} item(ns) estão sem valor informado.`,
      acao:"atlasLimparStatus();"
    });
  }

  if(manutencao > 0){
    lista.push({
      titulo:"🛠 Itens em manutenção",
      texto:`${manutencao} patrimônio(s) estão em manutenção.`,
      acao:"atlasDefinirStatus('MANUTENCAO');"
    });
  }

  if(baixados > 0){
    lista.push({
      titulo:"🗑 Itens baixados",
      texto:`${baixados} patrimônio(s) estão baixados.`,
      acao:"atlasDefinirStatus('BAIXADO');"
    });
  }

  if(semSerie > 0){
    lista.push({
      titulo:"🔎 Veículo sem série/placa",
      texto:`${semSerie} veículo(s)/máquina(s) estão sem placa, chassi ou série.`,
      acao:"document.getElementById('busca').value=''; renderizarRelatorio();"
    });
  }

  if(movimentacoes.length > 0){
    lista.push({
      titulo:"🔁 Movimentações recentes",
      texto:`Existem ${movimentacoes.length} movimentação(ões) recentes carregadas no relatório.`,
      acao:"document.querySelector('.card-movimentacoes')?.scrollIntoView({behavior:'smooth'});"
    });
  }

  atualizarNotificacoesRelatorioAntigo(lista);
}




/* Clique secreto seguro: funciona no título do modal Códigos Sienge */
document.addEventListener("click", function(e){
  if(e.target?.id === "tituloSiengeSecret"){
    toqueSecretoSienge();
  }
});

function abrirModalSienge(){
  if(!exigirPermissaoRelatoriosBDR("SIENGE_EXPORTAR", "Você não tem permissão para acessar Códigos Sienge.")) return;
  document.getElementById("modalSiengeCodigos")?.classList.add("ativo");
  setTimeout(() => {
    if(typeof renderizarMontagemDetalhamentoSienge === "function"){
      renderizarMontagemDetalhamentoSienge();
    }
    if(typeof atualizarStatsInsumosPremium === "function") atualizarStatsInsumosPremium();
  }, 100);
  if(typeof selecionarTipoSienge === "function"){
    selecionarTipoSienge(typeof tipoAtual !== "undefined" ? tipoAtual : "COR");
  }
}

function fecharModalSienge(){
  document.getElementById("modalSiengeCodigos")?.classList.remove("ativo");
}

document.addEventListener("keydown", e => {
  if(e.key === "Escape") fecharModalSienge();
});


/* =========================================================
   PATCH FINAL BDR - SALVAR INSUMO DIRETO NO MOTOR PREMIUM
   Tipo INSUMO salva somente em sienge_insumos.
   Faz a mesma lógica do SQL:
   ON CONFLICT (codigo, tabela_insumo, descricao)
========================================================= */

function normalizarDescricaoInsumoPremiumBDR(txt){
  return normalizarSiengeBusca(txt);
}

async function upsertInsumoPremiumBDR(codigo, descricao, tabela){
  codigo = String(codigo || "").trim();
  descricao = String(descricao || "").trim();
  tabela = String(tabela || "").replace(/\D/g, "").trim();

  if(!codigo || !descricao){
    alert("Preencha Código Sienge e Descrição / referência.");
    return false;
  }

  if(tabela !== "2" && tabela !== "3"){
    alert("Para INSUMO, selecione Tabela 2 ou Tabela 3.");
    return false;
  }

  const payload = {
    codigo: codigo,
    descricao: descricao,
    tabela_insumo: tabela,
    descricao_normalizada: normalizarDescricaoInsumoPremiumBDR(descricao),
    ativo: true
  };

  const { error } = await db()
    .from("sienge_insumos")
    .upsert([payload], {
      onConflict: "codigo,tabela_insumo,descricao"
    });

  if(error){
    console.error("Erro ao salvar insumo no Motor Premium:", error);
    alert("Erro ao salvar insumo no Motor Premium: " + error.message);
    return false;
  }

if(typeof carregarSiengeInsumosPremium === "function"){
  siengeInsumos = [];
  await carregarSiengeInsumosPremium(true);
}

  return true;
}

async function salvarCodigoSienge(){
  const id = valor("codigo_id");
  const tipo = String(valor("tipo_atual") || tipoSiengeAtual || "").toUpperCase().trim();
  const tabelaRef = String(valor("tabela_ref") || "PADRAO").trim();
  const codigo = String(valor("codigo_sienge") || "").trim();
  const descricao = String(valor("descricao_sienge") || "").trim();

  if(!tipo){
    alert("Selecione um tipo primeiro.");
    return;
  }

  if(!codigo || !descricao){
    alert("Preencha Código Sienge e Descrição / referência.");
    return;
  }

  // INSUMO agora NÃO vai para sienge_codigos. Vai só para sienge_insumos.
  if(tipo === "INSUMO"){
    const ok = await upsertInsumoPremiumBDR(codigo, descricao, tabelaRef);
    if(!ok) return;

    limparFormularioSiengeBDR();
    alert("✅ Insumo salvo no Motor Premium.");
    return;
  }

  // Demais tipos continuam na tabela auxiliar.
  const payload = {
    tipo: tipo,
    tabela_ref: tabelaRef,
    codigo: codigo,
    descricao: descricao,
    ativo: true
  };

  let resp;

  if(id){
    resp = await db()
      .from("sienge_codigos")
      .update(payload)
      .eq("id", id)
      .select();
  }else{
    resp = await db()
      .from("sienge_codigos")
      .insert([payload])
      .select();
  }

  if(resp.error){
    console.error("Erro ao salvar código auxiliar:", resp.error);
    alert("Erro ao salvar código Sienge: " + resp.error.message);
    return;
  }

  const {data, error} = await db()
    .from("sienge_codigos")
    .select("*")
    .eq("ativo", true);

  if(!error){
    siengeCodigos = data || [];
  }

  limparFormularioSiengeBDR();
  alert("✅ Código Sienge salvo.");
}

function limparFormularioSiengeBDR(){
  const id = document.getElementById("codigo_id");
  const codigo = document.getElementById("codigo_sienge");
  const descricao = document.getElementById("descricao_sienge");

  if(id) id.value = "";
  if(codigo) codigo.value = "";
  if(descricao) descricao.value = "";

  const titulo = document.getElementById("tituloCadastro");
  if(titulo){
    titulo.innerText = "➕ Cadastrar " + (tipoSiengeAtual || "código");
  }
}

carregarDados();
