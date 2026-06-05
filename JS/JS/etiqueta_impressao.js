const params = new URLSearchParams(window.location.search);
const id = params.get("id");

const url = "https://docs.google.com/spreadsheets/d/1r1K8A6RwkGXBrHWLKc3otE5G3SWHBmFSXCWfNLDs7rQ/gviz/tq?tqx=out:json";

fetch(url)
  .then(res => res.text())
  .then(data => {

    const json = JSON.parse(data.substring(47).slice(0, -2));
    const rows = json.table.rows;

    let encontrado = false;

    rows.forEach(r => {

      if (r.c[0] && r.c[0].v == id) {

        encontrado = true;

        document.getElementById("idProduto").innerText = "Patrimônio: " + (r.c[0]?.v || "");
        document.getElementById("produto").innerText = "Produto: " + (r.c[3]?.v || "");
        document.getElementById("codigo").innerText = "Código: " + (r.c[2]?.v || "");
        document.getElementById("marca").innerText = "Marca: " + (r.c[4]?.v || "");
        document.getElementById("modelo").innerText = "Modelo: " + (r.c[5]?.v || "");
        document.getElementById("serie").innerText = "Nº Série: " + (r.c[6]?.v || "");

        // 🔥 QR CODE MAIS ESTÁVEL
        document.getElementById("qr").src =
          "https://quickchart.io/qr?size=150&text=" +
          encodeURIComponent(
            "https://saulohenry29.github.io/sistemaBDR/etiqueta_impressao.html?id=" + id
          );
      }
    });

    if (!encontrado) {
      document.getElementById("produto").innerText = "Patrimônio não encontrado";
    }

  })
  .catch(err => {
    console.error(err);
    document.getElementById("produto").innerText = "Erro ao carregar dados";
  });