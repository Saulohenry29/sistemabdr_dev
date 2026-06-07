const params = new URLSearchParams(window.location.search);
const id = params.get("id");

const url = "https://docs.google.com/spreadsheets/d/1r1K8A6RwkGXBrHWLKc3otE5G3SWHBmFSXCWfNLDs7rQ/gviz/tq?tqx=out:json";

function formatarPatrimonio(valor) {
  // garante que seja número e aplica máscara PAT-000X
  return "PAT-" + String(valor).padStart(4, "0");
}

fetch(url)
  .then(res => res.text())
  .then(data => {
    const json = JSON.parse(data.substring(47).slice(0, -2));
    const rows = json.table.rows;

    rows.forEach(r => {
      if (r.c[0] && r.c[0].v == id) {
        // Patrimônio formatado
        document.getElementById("idProduto").innerText = 
          "Patrimônio: " + formatarPatrimonio(r.c[0]?.v || "");

        document.getElementById("produto").innerText = "Produto: " + (r.c[3]?.v || "");
        document.getElementById("codigo").innerText = "Código: " + (r.c[2]?.v || "");
        document.getElementById("marca").innerText = "Marca: " + (r.c[4]?.v || "");
        document.getElementById("modelo").innerText = "Modelo: " + (r.c[5]?.v || "");
        document.getElementById("serie").innerText = "Nº Série: " + (r.c[6]?.v || "");

        // ✅ QR Code vinculado ao sistema
        document.getElementById("qr").src =
          `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://saulohenry29.github.io/sistema_web_BDR/etiqueta.html?id=${id}`;
      }
    });
  })
  .catch(err => console.error("Erro ao carregar dados:", err));
