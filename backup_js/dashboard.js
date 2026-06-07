// Dados simulados (depois podem vir do JSON ou banco)
const statusData = {
  labels: ["Em uso", "Em manutenção", "Disponível", "Descartado"],
  datasets: [{
    data: [12, 5, 8, 2],
    backgroundColor: ["#0077b6", "#ffb703", "#06d6a0", "#ef476f"]
  }]
};

const movData = {
  labels: ["Entradas", "Saídas"],
  datasets: [{
    data: [15, 10],
    backgroundColor: ["#118ab2", "#ffd166"]
  }]
};

// Gráfico de status
new Chart(document.getElementById("graficoStatus"), {
  type: "pie",
  data: statusData,
  options: {
    responsive: true,
    plugins: {
      legend: { position: "bottom" }
    }
  }
});

// Gráfico de movimentações
new Chart(document.getElementById("graficoMov"), {
  type: "bar",
  data: movData,
  options: {
    responsive: true,
    plugins: {
      legend: { display: false }
    }
  }
});
