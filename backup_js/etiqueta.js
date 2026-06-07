const params = new URLSearchParams(window.location.search);
const id = params.get("id");

const url = "https://docs.google.com/spreadsheets/d/1r1K8A6RwkGXBrHWLKc3otE5G3SWHBmFSXCWfNLDs7rQ/gviz/tq?tqx=out:json";

fetch(url)
  .then(res => res.text())
  .then(data => {
    const json = JSON.parse(data.substring(47).slice(0, -2));
    const rows = json.table.rows;

    rows.forEach(r => {
      if (r.c[0] && r.c[0].v == id) {
        document.getElementById("produto").innerText = r.c[3]?.v || "";
        document.getElementById("codigo").innerText = r.c[0]?.v || "";
        document.getElementById("nfe").innerText = r.c[2]?.v || "";
        document.getElementById("marca").innerText = r.c[4]?.v || "";
        document.getElementById("modelo").innerText = r.c[5]?.v || "";
        document.getElementById("serie").innerText = r.c[6]?.v || "";
        document.getElementById("local").innerText = r.c[9]?.v || "";
        document.getElementById("status").innerText = r.c[12]?.v || "";

        // Corrige data
        if (r.c[1] && r.c[1].v) {
          let valorData = r.c[1].f || r.c[1].v;
          let dataGoogle = new Date(valorData);
          if (!isNaN(dataGoogle)) {
            const dia = String(dataGoogle.getDate()).padStart(2, '0');
            const mes = String(dataGoogle.getMonth() + 1).padStart(2, '0');
            const ano = dataGoogle.getFullYear();
            document.getElementById("data").innerText = `${dia}/${mes}/${ano}`;
          } else {
            document.getElementById("data").innerText = valorData;
          }
        }

        // ✅ QR Code vinculado
        document.getElementById("qr").src =
          `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://saulohenry29.github.io/sistema_web_BDR/etiqueta.html?id=${id}`;
      }
    });
  })
  .catch(err => console.error("Erro ao carregar dados:", err));
