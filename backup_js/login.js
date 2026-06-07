document.getElementById("formLogin").addEventListener("submit", async function(e) {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const senha = document.getElementById("senha").value;

  const resp = await fetch("http://localhost:3000/login", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ username, senha })
  });

  if(resp.ok) {
    const data = await resp.json();
    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.role);

    if(data.role === "admin") {
      window.location.href = "patrimonio.html";
    } else {
      window.location.href = "estoque.html";
    }
  } else {
    document.getElementById("mensagem").textContent = "Usuário ou senha inválidos!";
  }
});
