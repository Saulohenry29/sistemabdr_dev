const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors"); // permite acesso do navegador
const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(cors());

// Lista de usuários (simples, pode virar banco depois)
let usuarios = [
  { username: "Saulo", senha: "Sa@123456", role: "admin" },
  { username: "Joao", senha: "123", role: "user" }
];

// Solicitações de redefinição de senha
let solicitacoesSenha = [];

// ===== LOGIN =====
app.post("/login", (req, res) => {
  const { username, senha } = req.body;
  const usuario = usuarios.find(u => u.username === username && u.senha === senha);

  if (usuario) {
    // token fictício só pra teste
    const token = "token-" + Date.now();
    res.json({ success: true, token, role: usuario.role });
  } else {
    res.status(401).json({ success: false, message: "Usuário ou senha inválidos" });
  }
});

// ===== CADASTRO DE USUÁRIO =====
app.post("/cadastro", (req, res) => {
  const { username, senha, role } = req.body;

  if (usuarios.find(u => u.username === username)) {
    return res.json({ success: false, message: "Usuário já existe" });
  }

  usuarios.push({ username, senha, role: role || "user" });
  res.json({ success: true, message: "Usuário cadastrado com sucesso" });
});

// ===== ESQUECI A SENHA =====
app.post("/esqueci-senha", (req, res) => {
  const { username } = req.body;

  if (!usuarios.find(u => u.username === username)) {
    return res.json({ success: false, message: "Usuário não encontrado" });
  }

  solicitacoesSenha.push({ username, data: new Date() });
  res.json({ success: true, message: "Solicitação enviada ao administrador" });
});

// ===== ADMIN VISUALIZA SOLICITAÇÕES =====
app.get("/solicitacoes", (req, res) => {
  res.json(solicitacoesSenha);
});

// ===== ADMIN REDEFINE SENHA =====
app.post("/redefinir-senha", (req, res) => {
  const { username, novaSenha } = req.body;
  const usuario = usuarios.find(u => u.username === username);

  if (!usuario) {
    return res.json({ success: false, message: "Usuário não encontrado" });
  }

  usuario.senha = novaSenha;
  res.json({ success: true, message: "Senha redefinida com sucesso" });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
