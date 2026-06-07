let entradas = [];

window.onload = async () => {
    await carregarTriagem();
};

/* =========================
   CARREGAR TRIAGEM
========================= */
async function carregarTriagem() {

    const { data, error } = await client
        .from("entradas")
        .select(`
            id,
            numero_nf,
            fornecedor,
            responsavel,
            status,
            entrada_itens (
                id,
                quantidade,
                valor_unitario,
                estado_produto,
                lote,
                validade,
                produto_id,
                produtos (
                    descricao,
                    tipo_produto,
                    classificacao,
                    valor_referencia,
                    marca
                )
            )
        `)
        .eq("status", "PENDENTE_TRIAGEM");

    if (error) {
        console.error(error);
        return;
    }

    entradas = data || [];
    renderizar();
}

/* =========================
   RENDER
========================= */
function renderizar() {

    const div = document.getElementById("listaTriagem");
    if (!div) return;

    div.innerHTML = "";

    entradas.forEach(e => {

        let htmlItens = "";

        e.entrada_itens.forEach(item => {

            const produto = item.produtos || {};

            const destino = sugerirDestino(produto);

            htmlItens += `
            <div class="card">

                <h3>${produto.descricao || "-"}</h3>

                <p><b>Qtd:</b> ${item.quantidade}</p>
                <p><b>Estado:</b> ${item.estado_produto || "-"}</p>
                <p><b>Lote:</b> ${item.lote || "-"}</p>

                <p><b>Destino:</b> ${destino}</p>

                <button onclick="confirmarItem(${item.id}, '${destino}')">
                    Confirmar
                </button>

            </div>
            `;
        });

        div.innerHTML += `
        <div class="card">
            <h2>NF: ${e.numero_nf}</h2>
            <p>Fornecedor: ${e.fornecedor}</p>
            <p>Responsável: ${e.responsavel}</p>
            ${htmlItens}
        </div>
        `;
    });
}

/* =========================
   IA DESTINO INTELIGENTE
========================= */
function sugerirDestino(produto) {

    if (!produto) return "ESTOQUE";

    if (produto.classificacao === "Patrimonio") return "PATRIMONIO";

    if (produto.tipo_produto === "Eletronico") return "PATRIMONIO";

    if (produto.tipo_produto === "Veiculo") return "PATRIMONIO";

    if (produto.valor_referencia >= 1200) return "PATRIMONIO";

    return "ESTOQUE";
}

/* =========================
   CONFIRMAR TRIAGEM
========================= */
async function confirmarItem(item_id, destino) {

    try {

        const { data: item, error } = await client
            .from("entrada_itens")
            .select(`
                id,
                produto_id,
                quantidade,
                lote,
                entradas (empresa_id),
                produtos (
                    descricao,
                    marca
                )
            `)
            .eq("id", item_id)
            .single();

        if (error) throw error;

        // =========================
        // TRIAGEM REGISTRO
        // =========================
        await client
            .from("triagem")
            .insert([{
                entrada_item_id: item_id,
                destino,
                responsavel: "SISTEMA",
                status: "CONCLUIDO"
            }]);

        // =========================
        // ESTOQUE
        // =========================
        if (destino === "ESTOQUE") {

            await client.from("estoque").insert([{
                produto_id: item.produto_id,
                empresa_id: item.entradas.empresa_id,
                quantidade: item.quantidade,
                lote: item.lote,
                codigo_qr: `EST-${Date.now()}-${item_id}`
            }]);

            alert("Enviado para ESTOQUE");
        }

        // =========================
        // PATRIMÔNIO (VEÍCULOS + MÁQUINAS)
        // =========================
        if (destino === "PATRIMONIO") {

            await client.from("patrimonio").insert([{
                produto_id: item.produto_id,
                empresa_id: item.entradas.empresa_id,

                nome_bem: item.produtos.descricao,
                marca: item.produtos.marca,

                status: "ESTOQUE",
                codigo_qr: `PAT-${Date.now()}-${item_id}`,

                triagem_id: item_id
            }]);

            alert("Enviado para PATRIMÔNIO");
        }

        await carregarTriagem();

    } catch (err) {
        console.error(err);
        alert("Erro na triagem");
    }
}