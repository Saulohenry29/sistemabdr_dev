let produtos = [];

window.onload = async () => {
    await carregarEmpresas();
    await carregarProdutos();
    adicionarLinha();
};

/* =========================
   EMPRESAS
========================= */
async function carregarEmpresas() {

    const { data, error } = await client
        .from("empresas")
        .select("*")
        .order("nome");

    if (error) return console.error(error);

    const select = document.getElementById("empresa");
    select.innerHTML = "";

    data.forEach(emp => {

        const option = document.createElement("option");
        option.value = emp.id;
        option.textContent = emp.nome;

        select.appendChild(option);

    });
}

/* =========================
   PRODUTOS
========================= */
async function carregarProdutos() {

    const { data, error } = await client
        .from("produtos")
        .select("*")
        .eq("ativo", true)
        .order("descricao");

    if (error) return console.error(error);

    produtos = data;
}

/* =========================
   ADICIONAR LINHA
========================= */
function adicionarLinha() {

    const tbody = document.getElementById("itensBody");

    const tr = document.createElement("tr");

    let options = "";

    produtos.forEach(p => {
        options += `
        <option value="${p.id}">
            ${p.codigo_produto} - ${p.descricao}
        </option>`;
    });

    tr.innerHTML = `
        <td>
            <select class="produto">
                ${options}
            </select>
        </td>

        <td>
            <input type="number" class="quantidade" value="1" min="1" oninput="calcularLinha(this)">
        </td>

        <td>
            <input type="number" class="valor" step="0.01" value="0" oninput="calcularLinha(this)">
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
            <input type="text" class="lote" placeholder="LOT-2026-000001">
        </td>

        <td>
            <input type="date" class="validade">
        </td>

        <td>
            <span class="totalLinha">R$ 0,00</span>
        </td>

        <td>
            <button onclick="removerLinha(this)">❌</button>
        </td>
    `;

    tbody.appendChild(tr);
}

/* =========================
   REMOVER LINHA
========================= */
function removerLinha(btn) {
    btn.closest("tr").remove();
    calcularTotalGeral();
}

/* =========================
   CALCULAR LINHA
========================= */
function calcularLinha(el) {

    const tr = el.closest("tr");

    const qtd = Number(tr.querySelector(".quantidade").value);
    const valor = Number(tr.querySelector(".valor").value);

    const total = qtd * valor;

    tr.querySelector(".totalLinha").innerText =
        total.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });

    calcularTotalGeral();
}

/* =========================
   TOTAL GERAL
========================= */
function calcularTotalGeral() {

    let total = 0;

    document.querySelectorAll("#itensBody tr").forEach(tr => {

        const qtd = Number(tr.querySelector(".quantidade").value);
        const valor = Number(tr.querySelector(".valor").value);

        total += qtd * valor;

    });

    document.getElementById("totalGeral").innerText =
        "Total NF: " + total.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
}

/* =========================
   SALVAR ENTRADA
========================= */
async function salvarEntrada() {

    try {

        const empresa_id = document.getElementById("empresa").value;
        const numero_nf = document.getElementById("numero_nf").value;
        const fornecedor = document.getElementById("fornecedor").value;
        const responsavel = document.getElementById("responsavel").value;
        const chave_nfe = document.getElementById("chave_nfe").value;
        const observacao = document.getElementById("observacao").value;

        const { data: entrada, error } = await client
            .from("entradas")
            .insert([{
                empresa_id,
                numero_nf,
                fornecedor,
                responsavel,
                chave_nfe,
                observacao,
                status: "PENDENTE_TRIAGEM"
            }])
            .select()
            .single();

        if (error) throw error;

        const itens = [];

        document.querySelectorAll("#itensBody tr").forEach(tr => {

            itens.push({

                entrada_id: entrada.id,
                produto_id: tr.querySelector(".produto").value,
                quantidade: tr.querySelector(".quantidade").value,
                valor_unitario: tr.querySelector(".valor").value,

                valor_total:
                    Number(tr.querySelector(".quantidade").value) *
                    Number(tr.querySelector(".valor").value),

                estado_produto: tr.querySelector(".estado").value,
                lote: tr.querySelector(".lote").value,
                validade: tr.querySelector(".validade").value

            });

        });

        const { error: erroItens } = await client
            .from("entrada_itens")
            .insert(itens);

        if (erroItens) throw erroItens;

        alert("Entrada salva com sucesso!");
        location.reload();

    } catch (err) {
        console.error(err);
        alert("Erro ao salvar entrada");
    }
}