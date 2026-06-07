let patrimonio = [
  {id: "PAT-0001", produto: "Tablet Redmi", marca: "Xiaomi", modelo: "Pad 6", local: "Escritório", status: "Em uso"},
  {id: "PAT-0002", produto: "Notebook Dell", marca: "Dell", modelo: "Inspiron 15", local: "Sala TI", status: "Em manutenção"}
];

// Gerar ID automático
function gerarID() {
  return "PAT-" + String(patrimonio.length + 1).padStart(4, "0");
}

// Montar tabela
function carregarEstoque() {
  const tabela = document.querySelector("#tabelaEstoque tbody");
  tabela.innerHTML = "";

  patrimonio.forEach(item => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.produto}</td>
      <td>${item.marca}</td>
      <td>${item.modelo}</td>
      <td>${item.local}</td>
      <td>
        <select onchange="alterarStatus('${item.id}', this.value)">
          <option ${item.status==="Em uso"?"selected":""}>Em uso</option>
          <option ${item.status==="Em manutenção"?"selected":""}>Em manutenção</option>
          <option ${item.status==="Disponível"?"selected":""}>Disponível</option>
          <option ${item.status==="Descartado"?"selected":""}>Descartado</option>
        </select>
      </td>
      <td>
        <button onclick="gerarEtiqueta('${item.id}', '${item.produto}')">🎫 Imprimir</button>
      </td>
    `;

    tabela.appendChild(tr);
  });
}

// Alterar status
function alterarStatus(id, novoStatus) {
  const item = patrimonio.find(p => p.id === id);
  if(item) {
    item.status = novoStatus;
    alert(`Status do ${id} alterado para: ${novoStatus}`);
  }
}

// Cadastro de produto
document.getElementById("formEstoque").addEventListener("submit", function(e) {
  e.preventDefault();

  const novoItem = {
    id: gerarID(),
    produto: document.getElementById("produto").value,
    marca: document.getElementById("marca").value,
    modelo: document.getElementById("modelo").value,
    local: document.getElementById("local").value,
    status: "Disponível"
  };

  patrimonio.push(novoItem);
  carregarEstoque();

  // Gera etiqueta automaticamente
  gerarEtiqueta(novoItem.id, novoItem.produto);
});

// Função para gerar etiqueta com QR Code
function gerarEtiqueta(id, produto) {
  const win = window.open("", "_blank");
  win.document.write(`
    <html>
    <head>
      <title>Etiqueta</title>
      <script src="https://cdn.jsdelivr.net/npm/qrcodejs/qrcode.min.js"></script>
    </head>
    <body>
      <h2>${produto}</h2>
      <p>ID: ${id}</p>
      <div id="qrcode"></div>
      <script>
        new QRCode(document.getElementById("qrcode"), "${id}");
        window.print();
      </script>
    </body>
    </html>
  `);
}

carregarEstoque();
