function destruir(id){
  if(charts[id]){
    charts[id].destroy();
    charts[id] = null;
  }
}

function bar(id, labels, data, horizontal=false, color="#d71920", meta={}){
  destruir(id);
  const canvas = document.getElementById(id);
  if(!canvas) return;

  charts[id] = new Chart(canvas,{
    type:"bar",
    data:{
      labels,
      datasets:[{
        data,
        backgroundColor:color,
        borderRadius:6,
        hoverBackgroundColor:"#a4161a"
      }]
    },
    options:{
      indexAxis:horizontal ? "y" : "x",
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:(ctx)=> meta.tipo === "valor" ? moeda(ctx.raw) : (ctx.raw + " item(ns)")}}
      },
      onClick:(evt, elements)=>{
        if(!elements || !elements.length) return;
        const index = elements[0].index;
        if(typeof meta.onClick === "function") meta.onClick(index, labels[index], data[index]);
      },
      scales:{
        x:{beginAtZero:true,grid:{color:"#eef2f7"},ticks:{font:{size:10}}},
        y:{beginAtZero:true,grid:{color:"#eef2f7"},ticks:{font:{size:10}}}
      }
    }
  });
}

function doughnut(id, labels, data, meta={}){
  destruir(id);
  const canvas = document.getElementById(id);
  if(!canvas) return;

  charts[id] = new Chart(canvas,{
    type:"doughnut",
    data:{
      labels,
      datasets:[{
        data,
        backgroundColor:["#2563eb","#16a34a","#f97316","#d71920","#7c3aed","#f59e0b","#0d9488"]
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      cutout:"58%",
      onClick:(evt, elements)=>{
        if(!elements || !elements.length) return;
        const index = elements[0].index;
        if(typeof meta.onClick === "function") meta.onClick(index, labels[index], data[index]);
      },
      plugins:{
        legend:{position:"right",labels:{boxWidth:12,font:{size:11}}},
        tooltip:{callbacks:{label:(ctx)=> `${ctx.label}: ${ctx.raw} item(ns)`}}
      }
    }
  });
}

function gerarGraficos(){
  const ranking = rankingObrasPatrimonio();

  const qtdObra = [...ranking]
    .sort((a,b) => b.qtd - a.qtd)
    .slice(0,10);

  bar(
    "graficoObras",
    qtdObra.map(o => o.nome),
    qtdObra.map(o => o.qtd),
    true,
    "#d71920",
    {
      tipo:"quantidade",
      onClick:(index)=> aplicarFiltroObraDashboard(qtdObra[index]?.obra_id)
    }
  );

  const porStatus = contarPor(filtrados, p => p.status || "-");
  const statusLabels = Object.keys(porStatus);
  doughnut("graficoStatus", statusLabels, Object.values(porStatus), {
    onClick:(index)=> aplicarFiltroKPI(statusLabels[index] || "TODOS")
  });

  const valorObra = [...ranking]
    .filter(o => o.valor > 0)
    .sort((a,b) => b.valor - a.valor)
    .slice(0,10);

  bar(
    "graficoValorObra",
    valorObra.map(o => o.nome),
    valorObra.map(o => Number(o.valor.toFixed(2))),
    false,
    "#7c3aed",
    {
      tipo:"valor",
      onClick:(index)=> aplicarFiltroObraDashboard(valorObra[index]?.obra_id)
    }
  );

  const tipos = contarPor(filtrados, p => p.tipo_item || "SEM TIPO");
  const tipoLabels = Object.keys(tipos);
  doughnut("graficoTipos", tipoLabels, Object.values(tipos), {
    onClick:(index)=> aplicarFiltroTipoDashboard(tipoLabels[index] || "SEM TIPO")
  });
}
