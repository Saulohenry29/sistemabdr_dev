async function carregarPatrimonio() {
  const resp = await fetch("http://localhost:3000/patrimonio");
  const dados = await resp.json();

  const tbody = document.querySelector("#tabelaPatrimonio tbody");
  tbody.innerHTML = "";

  dados.forEach(item => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.produto}</td>
      <td>${item.marca}</td>
      <td>${item.modelo}</td>
      <td>${item.local}</td>
      <td>${item.status}</td>
      <td><button onclick="imprimirEtiquetaPadrao('${item.id}')">🎫 Padrão</button></td>
      <td><button onclick="imprimirEtiquetaQRCode('${item.id}')">📱 QRCode</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// Etiqueta padrão
function imprimirEtiquetaPadrao(id) {
  const conteudo = `
    <div style="font-family:Arial; text-align:center; border:1px solid #000; padding:10px; width:250px;">
      <h3>Etiqueta Patrimônio</h3>
      <p><b>ID:</b> ${id}</p>
      <p><b>Sistema BDR</b></p>
    </div>
  `;
  abrirJanelaImpressao(conteudo);
}

// Etiqueta com QRCode
function imprimirEtiquetaQRCode(id) {
  const conteudo = `
    <div style="font-family:Arial; text-align:center; border:1px solid #000; padding:10px; width:250px;">
      <h3>Etiqueta QRCode</h3>
      <p><b>ID:</b> ${id}</p>
      <div id="qrcode"></div>
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script>
      new QRCode(document.getElementById("qrcode"), "http://localhost:3000/patrimonio?id=${id}");
    </script>
  `;
  abrirJanelaImpressao(conteudo);
}

// Função auxiliar para abrir janela de impressão
function abrirJanelaImpressao(conteudo) {
  const janela = window.open("", "", "width=400,height=400");
  janela.document.write("<html><head><title>Imprimir Etiqueta</title></head><body>");
  janela.document.write(conteudo);
  janela.document.write("</body></html>");
  janela.document.close();
  janela.print();
}

carregarPatrimonio();
