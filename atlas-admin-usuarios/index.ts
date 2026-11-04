import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(URL, SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const ORIGENS = new Set([
  "https://bdrgestao.com.br",
  "https://www.bdrgestao.com.br",
  "https://sathtech.com.br",
  "https://www.sathtech.com.br",
  "http://localhost:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:5501",
]);

// A RPC mantém o catálogo definitivo e valida as permissões por obra.
// Aqui rejeitamos entradas malformadas, sem restringir o cadastro aos cinco tokens administrativos.
const FORMATO_PERMISSAO = /^[A-Z0-9_]{2,100}$/;

function responder(
  req: Request,
  status: number,
  dados: Record<string, unknown>,
): Response {
  const origem = req.headers.get("origin") ?? "";

  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      ...(ORIGENS.has(origem)
        ? { "Access-Control-Allow-Origin": origem }
        : {}),
    },
  });
}

function aleatorioHex(bytes = 32): string {
  const valores = crypto.getRandomValues(
    new Uint8Array(bytes),
  );

  return Array.from(valores)
    .map((valor) => valor.toString(16).padStart(2, "0"))
    .join("");
}

function permissoesDoBanco(valor: unknown): string[] {
  return String(valor ?? "")
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
}

function validarPermissoes(valor: unknown): string[] {
  if (!Array.isArray(valor)) {
    throw new Error("PERMISSOES_INVALIDAS");
  }

  const resultado: string[] = [];

  for (const item of valor) {
    if (typeof item !== "string") {
      throw new Error("PERMISSOES_INVALIDAS");
    }

    const permissao = item.trim().toUpperCase();

    if (!FORMATO_PERMISSAO.test(permissao)) {
      throw new Error("PERMISSAO_DESCONHECIDA");
    }

    resultado.push(permissao);
  }

  return [...new Set(resultado)];
}

function validarObras(valor: unknown): number[] {
  if (!Array.isArray(valor) || valor.length === 0) {
    throw new Error("OBRAS_INVALIDAS");
  }

  const resultado: number[] = [];

  for (const item of valor) {
    if (
      (typeof item !== "number" &&
        typeof item !== "string") ||
      String(item).trim() === ""
    ) {
      throw new Error("OBRAS_INVALIDAS");
    }

    const id = Number(item);

    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error("OBRAS_INVALIDAS");
    }

    resultado.push(id);
  }

  return [...new Set(resultado)];
}

function senhaAtlasValida(valor: unknown): valor is string {
  if (typeof valor !== "string" || valor.length < 8 || valor.length > 128 || /[\u0000-\u001f\u007f]/.test(valor)) return false;
  return [/[a-z]/.test(valor), /[A-Z]/.test(valor), /[0-9]/.test(valor), /[^A-Za-z0-9]/.test(valor)].filter(Boolean).length >= 2;
}

serve(async (req: Request): Promise<Response> => {
  const origemRequisicao = req.headers.get("origin");
  if (origemRequisicao && !ORIGENS.has(origemRequisicao)) {
    return responder(req, 403, { erro: "Origem não autorizada." });
  }

  if (req.method === "OPTIONS") {
    return responder(req, 200, { sucesso: true });
  }

  if (req.method !== "POST") {
    return responder(req, 405, {
      erro: "Método não permitido.",
    });
  }

  const origem = req.headers.get("origin");

  if (origem && !ORIGENS.has(origem)) {
    return responder(req, 403, {
      erro: "Origem não autorizada.",
    });
  }

  if (!URL || !SERVICE_KEY) {
    return responder(req, 503, {
      erro: "Configuração administrativa indisponível.",
    });
  }

  const authorization =
    req.headers.get("authorization") ?? "";

  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return responder(req, 401, {
      erro: "Autenticação obrigatória.",
    });
  }

  // A identidade do executor vem do token validado.
  const { data: identidade, error: erroIdentidade } =
    await admin.auth.getUser(token);

  if (erroIdentidade || !identidade.user) {
    return responder(req, 401, {
      erro: "Sessão inválida ou expirada.",
    });
  }

  const executorAuthId = identidade.user.id;

  const { data: executor, error: erroExecutor } =
    await admin
      .from("usuarios_sistema")
      .select(
        "id,ativo,owner_sistema,perfil,permissoes,empresa_id",
      )
      .eq("auth_user_id", executorAuthId)
      .eq("ativo", true)
      .maybeSingle();

  if (erroExecutor || !executor) {
    return responder(req, 403, {
      erro: "Administrador não autorizado no Atlas.",
    });
  }

  const owner =
    executor.owner_sistema === true &&
    Number(executor.id) === 1;

  const permissoesExecutor = new Set(
    permissoesDoBanco(executor.permissoes),
  );

  // Consulta administrativa: autorizacao no servidor, nunca apenas no filtro da tela.
  // A chamada usa POST para manter a mesma Edge Function e seu controle de CORS.
  let consulta: Record<string, unknown> | null = null;
  try {
    const entrada = await req.clone().json();
    if (entrada && typeof entrada === "object" && !Array.isArray(entrada) && ["consultar", "editar", "redefinir_senha", "concluir_senha_provisoria"].includes(String(entrada.acao))) {
      consulta = entrada as Record<string, unknown>;
    }
  } catch { /* O cadastro existente trata seu corpo abaixo. */ }

  // Troca pessoal: token autenticado, senha atual comprovada e indicador protegido em app_metadata.
  if (consulta?.acao === "concluir_senha_provisoria") {
    const atual = consulta.senha_atual;
    const nova = consulta.nova_senha;
    if (typeof atual !== "string" || !senhaAtlasValida(nova) || atual === nova)
      return responder(req, 400, { erro: "Informe a senha atual e uma nova senha de 8 a 128 caracteres, com pelo menos 2 tipos de caracteres." });
    const { data: conta, error: erroConta } = await admin.auth.admin.getUserById(executorAuthId);
    if (erroConta || !conta?.user || conta.user.app_metadata?.atlas_troca_senha_pendente !== true)
      return responder(req, 403, { erro: "Não há troca obrigatória pendente nesta conta." });
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!anonKey || !conta.user.email) return responder(req, 503, { erro: "Verificação de senha indisponível." });
    const verificador = createClient(URL, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: validacao, error: erroAtual } = await verificador.auth.signInWithPassword({ email: conta.user.email, password: atual });
    if (erroAtual || validacao?.user?.id !== executorAuthId)
      return responder(req, 401, { erro: "Senha provisória incorreta." });
    const { error: erroTroca } = await admin.auth.admin.updateUserById(executorAuthId, {
      password: nova,
      app_metadata: { ...(conta.user.app_metadata ?? {}), atlas_troca_senha_pendente: false },
    });
    if (erroTroca) return responder(req, 503, { erro: "Não foi possível concluir a troca de senha." });
    return responder(req, 200, { sucesso: true, ok: true, mensagem: "Senha pessoal cadastrada." });
  }

  // Redefinição de senha por administrador delegado: autorização integral no servidor.
  if (consulta?.acao === "redefinir_senha") {
    const id = Number(consulta.usuario_id);
    const senha = consulta.senha;
    if (!Number.isSafeInteger(id) || id <= 0 || typeof senha !== "string" ||
        !senhaAtlasValida(senha)) {
      return responder(req, 400, { erro: "Informe usuário válido e senha de 8 a 128 caracteres, com pelo menos 2 tipos de caracteres." });
    }
    if (!owner && (!permissoesExecutor.has("ADMINISTRACAO_DELEGADA") ||
        !permissoesExecutor.has("USUARIOS_EDITAR") ||
        !["MASTER", "GESTOR"].includes(String(executor.perfil).toUpperCase()))) {
      return responder(req, 403, { erro: "Administração delegada não autorizada." });
    }
    const { data: alvo, error: erroAlvo } = await admin.from("usuarios_sistema")
      .select("id,ativo,owner_sistema,empresa_id,auth_user_id,perfil")
      .eq("id", id).maybeSingle();
    if (erroAlvo || !alvo) return responder(req, 404, { erro: "Funcionário não encontrado." });
    if (alvo.owner_sistema || Number(alvo.id) === 1 || Number(alvo.id) === Number(executor.id)) {
      return responder(req, 403, { erro: "Esta conta não pode ser redefinida por esta operação." });
    }
    if (!alvo.auth_user_id) return responder(req, 409, { erro: "Funcionário ainda não possui acesso Supabase Auth ativo." });
    if (alvo.ativo !== true) return responder(req, 403, { erro: "Não é permitido redefinir senha de funcionário inativo." });
    if (!owner && ["MASTER", "GESTOR"].includes(String(alvo.perfil ?? "").toUpperCase()))
      return responder(req, 403, { erro: "A redefinição de senha de MASTER ou GESTOR exige o OWNER." });
    if (!owner) {
      if (Number(alvo.empresa_id) !== Number(executor.empresa_id))
        return responder(req, 403, { erro: "Empresa fora do alcance administrativo." });
      const [{data: obrasAlvo, error: erroObrasAlvo}, {data: obrasExecutor, error: erroObrasExecutor}] = await Promise.all([
        admin.from("usuario_obras").select("obra_id").eq("usuario_id", id),
        admin.from("usuario_obras").select("obra_id").eq("usuario_id", executor.id),
      ]);
      if (erroObrasAlvo || erroObrasExecutor) return responder(req, 503, { erro: "Não foi possível validar as obras." });
      const autorizadas = new Set((obrasExecutor ?? []).map(o => Number(o.obra_id)));
      const vinculadas = (obrasAlvo ?? []).map(o => Number(o.obra_id));
      if (!vinculadas.length || vinculadas.some(obra => !autorizadas.has(obra)))
        return responder(req, 403, { erro: "Funcionário possui obras fora do alcance administrativo." });
    }
    const { data: contaAlvo, error: erroContaAlvo } = await admin.auth.admin.getUserById(String(alvo.auth_user_id));
    if (erroContaAlvo || !contaAlvo?.user) return responder(req, 503, { erro: "Conta Auth indisponível." });
    const { error: erroSenha } = await admin.auth.admin.updateUserById(String(alvo.auth_user_id), {
      password: senha,
      app_metadata: { ...(contaAlvo.user.app_metadata ?? {}), atlas_troca_senha_pendente: true },
    });
    if (erroSenha) {
      console.error("ATLAS_REDEFINICAO_SENHA_ERRO", { codigo: erroSenha.code, mensagem: erroSenha.message });
      return responder(req, 503, { erro: "Não foi possível redefinir a senha." });
    }
    return responder(req, 200, { sucesso: true, ok: true, mensagem: "Senha redefinida no Supabase Auth." });
  }

  if (consulta) {
    if (!owner && (
      !["MASTER", "GESTOR"].includes(String(executor.perfil).toUpperCase()) ||
      !permissoesExecutor.has("USUARIOS_VER")
    )) return responder(req, 403, { erro: "Sem permissão para consultar funcionários." });

    const id = Number(consulta.usuario_id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return responder(req, 400, { erro: "Identificador inválido." });
    }
    const { data: alvo, error: erroAlvo } = await admin.from("usuarios_sistema")
      .select("id,nome,usuario,email,perfil,perfil_rapido,empresa_id,ativo,permissoes,owner_sistema,auth_user_id,auth_status,obra_id,obras_liberadas,telefone,cargo,observacao_acesso,criado_em,updated_at,ultimo_login,gestor_id")
      .eq("id", id).maybeSingle();
    if (erroAlvo) {
      const codigo = String(erroAlvo.code ?? "SEM_CODIGO");
      console.error("ATLAS_CONSULTA_USUARIO_ERRO", {
        codigo,
        mensagem: erroAlvo.message,
        detalhes: erroAlvo.details,
        dica: erroAlvo.hint
      });

      return responder(req, 500, {
        erro: "Falha ao consultar funcionário."
      });
    }
    if (!alvo) return responder(req, 404, { erro: "Funcionário não encontrado." });

    if (!owner) {
      if (alvo.owner_sistema || Number(alvo.id) === Number(executor.id) ||
        ["MASTER", "GESTOR"].includes(String(alvo.perfil ?? "").toUpperCase())) {
        return responder(req, 403, { erro: "Funcionário fora do alcance administrativo." });
      }
      if (Number(alvo.empresa_id) !== Number(executor.empresa_id)) {
        return responder(req, 403, { erro: "Empresa não autorizada." });
      }
    }
    // Segurança: qualquer leitura/edição administrativa exige que TODAS as obras
    // do funcionário estejam dentro das obras explicitamente autorizadas.
    if (!owner) {
      const [{ data: obrasAlvo, error: erroObrasAlvo },
             { data: obrasExecutor, error: erroObrasExecutor }] = await Promise.all([
        admin.from("usuario_obras").select("obra_id").eq("usuario_id", id),
        admin.from("usuario_obras").select("obra_id").eq("usuario_id", executor.id),
      ]);
      if (erroObrasAlvo || erroObrasExecutor) {
        return responder(req, 500, { erro: "Falha ao validar obras do funcionário." });
      }
      const autorizadas = new Set((obrasExecutor ?? []).map(v => Number(v.obra_id)));
      const vinculadas = (obrasAlvo ?? []).map(v => Number(v.obra_id));
      if (!vinculadas.length || vinculadas.some(obra => !autorizadas.has(obra))) {
        return responder(req, 403, { erro: "Funcionário possui obra fora do alcance administrativo." });
      }
    }

    // Edição de dados: escopo e privilégios são validados novamente no servidor.
    if (consulta.acao === "editar") {
      if (!owner && !permissoesExecutor.has("USUARIOS_EDITAR") &&
          !permissoesExecutor.has("USUARIOS_PERMISSOES")) {
        return responder(req, 403, { erro: "Sem permissão para editar funcionários." });
      }
      if (!owner && String(executor.perfil).toUpperCase() === "GESTOR" &&
          !["ADMIN", "ALMOXARIFE"].includes(String(alvo.perfil ?? "").toUpperCase())) {
        return responder(req, 403, { erro: "Perfil fora do alcance do gestor." });
      }
      if (!owner && String(executor.perfil).toUpperCase() === "MASTER") {
        const { data: comuns, error: erroComuns } = await admin.from("usuario_obras")
          .select("obra_id").eq("usuario_id", id);
        const { data: minhas, error: erroMinhas } = await admin.from("usuario_obras")
          .select("obra_id").eq("usuario_id", executor.id);
        if (erroComuns || erroMinhas) return responder(req, 500, { erro: "Falha ao validar obras." });
        const minhasIds = new Set((minhas ?? []).map(o => Number(o.obra_id)));
        if (!(comuns ?? []).some(o => minhasIds.has(Number(o.obra_id))))
          return responder(req, 403, { erro: "Funcionário fora das obras autorizadas." });
      }
      const entrada = consulta.alteracoes;
      if (!entrada || typeof entrada !== "object" || Array.isArray(entrada))
        return responder(req, 400, { erro: "Alterações inválidas." });
      const mudancas = entrada as Record<string, unknown>;
      const campos = Object.keys(mudancas);
      const permitidos = new Set(["nome", "usuario", "email", "ativo", "permissoes", "perfil_rapido"]);
      if (!campos.length || campos.some(c => !permitidos.has(c)))
        return responder(req, 400, { erro: "Campo não permitido para edição." });
      const alteracoes: Record<string, unknown> = {};
      const alteraAcesso = campos.some(c => ["permissoes", "perfil_rapido"].includes(c));
      const alteraCadastro = campos.some(c => ["nome", "usuario", "email", "ativo"].includes(c));
      if (!owner && alteraAcesso && !permissoesExecutor.has("USUARIOS_PERMISSOES"))
        return responder(req, 403, { erro: "Sem permissão para alterar acessos." });
      if (!owner && alteraCadastro && !permissoesExecutor.has("USUARIOS_EDITAR"))
        return responder(req, 403, { erro: "Sem permissão para alterar cadastro." });
      for (const campo of ["nome", "usuario", "email"] as const) {
        if (Object.prototype.hasOwnProperty.call(mudancas, campo)) {
          if (typeof mudancas[campo] !== "string" && !(campo === "email" && mudancas[campo] === null))
            return responder(req, 400, { erro: `Campo ${campo} inválido.` });
          const valor = String(mudancas[campo] ?? "").trim();
          if ((campo !== "email" && (valor.length < 3 || valor.length > 150)) ||
              (campo === "email" && valor.length > 254))
            return responder(req, 400, { erro: `Campo ${campo} inválido.` });
          alteracoes[campo] = campo === "email" ? (valor.toLowerCase() || null) : valor;
        }
      }
      if (Object.prototype.hasOwnProperty.call(mudancas, "ativo")) {
        if (typeof mudancas.ativo !== "boolean")
          return responder(req, 400, { erro: "Status inválido." });
        if (!owner && !permissoesExecutor.has("USUARIOS_BLOQUEAR"))
          return responder(req, 403, { erro: "Sem permissão para bloquear ou reativar." });
        alteracoes.ativo = mudancas.ativo;
      }
      if (Object.prototype.hasOwnProperty.call(mudancas, "perfil_rapido")) {
        if (mudancas.perfil_rapido !== null &&
            (typeof mudancas.perfil_rapido !== "string" || mudancas.perfil_rapido.length > 100))
          return responder(req, 400, { erro: "Perfil rápido inválido." });
        alteracoes.perfil_rapido = mudancas.perfil_rapido;
      }
      if (Object.prototype.hasOwnProperty.call(mudancas, "permissoes")) {
        if (!Array.isArray(mudancas.permissoes) || mudancas.permissoes.length > 250 ||
            mudancas.permissoes.some(p => typeof p !== "string" || !/^[A-Z0-9_]{2,100}$/.test(p)))
          return responder(req, 400, { erro: "Permissões inválidas." });
        if (!owner && (mudancas.permissoes as string[]).includes("ADMINISTRACAO_DELEGADA")) {
          return responder(req, 403, { erro: "Somente o OWNER pode conceder administração delegada." });
        }
        const novas = new Set(mudancas.permissoes as string[]);
        const antigas = new Set(permissoesDoBanco(alvo.permissoes));
        // Delegação vale para permissões operacionais, não para privilégios
        // administrativos nem para acesso a obras não autorizadas.
        const protegidas = new Set([
          "ADMINISTRACAO_DELEGADA", "USUARIOS_VER", "USUARIOS_CRIAR",
          "USUARIOS_EDITAR", "USUARIOS_BLOQUEAR", "USUARIOS_PERMISSOES",
          "USUARIOS_OBRAS", "USUARIOS_HISTORICO", "EMPRESAS_CRIAR",
          "EMPRESAS_EDITAR", "EMPRESAS_INATIVAR", "EMPRESAS_EXCLUIR",
          "TODAS_OBRAS_VER", "RELATORIOS_TODAS_OBRAS",
        ]);
        const alteradas = [...new Set([...novas, ...antigas])]
          .filter(p => novas.has(p) !== antigas.has(p));
        const delegada = permissoesExecutor.has("ADMINISTRACAO_DELEGADA");
        if (!owner && alteradas.some(p => {
          if (permissoesExecutor.has(p)) return false;
          if (!delegada || protegidas.has(p)) return true;
          if (p.startsWith("EXPEDICAO_OBRA_")) return true;
          return false;
        })) return responder(req, 403, {
          erro: "Permissão administrativa ou obra fora do alcance delegado."
        });
        alteracoes.permissoes = [...novas].join(",");
      }
      alteracoes.updated_at = new Date().toISOString();
      const { data: salvo, error: erroSalvar } = await admin.from("usuarios_sistema")
        .update(alteracoes).eq("id", id).eq("empresa_id", alvo.empresa_id)
        .select("id,nome,usuario,email,perfil,empresa_id,ativo,permissoes,perfil_rapido,updated_at")
        .single();
      if (erroSalvar) {
        console.error("ATLAS_EDICAO_USUARIO_ERRO", { codigo: erroSalvar.code, mensagem: erroSalvar.message });
        return responder(req, 500, { erro: "Falha ao salvar alterações do funcionário.", codigo_diagnostico: erroSalvar.code });
      }
      return responder(req, 200, { sucesso: true, funcionario: salvo });
    }

    const { data: vinculos, error: erroVinculos } = await admin.from("usuario_obras")
      .select("obra_id").eq("usuario_id", id);
    if (erroVinculos) return responder(req, 500, { erro: "Falha ao consultar obras." });
    const obrasAlvo = (vinculos ?? []).map(v => Number(v.obra_id));
    if (!owner) {
      if (String(executor.perfil).toUpperCase() === "GESTOR") {
        if (!["ADMIN", "ALMOXARIFE"].includes(String(alvo.perfil ?? "").toUpperCase())) {
          return responder(req, 403, { erro: "Funcionário não subordinado ao gestor." });
        }
      } else {
        const { data: obrasExecutor, error: erroObras } = await admin.from("usuario_obras")
          .select("obra_id").eq("usuario_id", executor.id);
        if (erroObras) return responder(req, 500, { erro: "Falha ao validar obras do administrador." });
        const ids = new Set((obrasExecutor ?? []).map(v => Number(v.obra_id)));
        if (!obrasAlvo.some(obra => ids.has(obra))) {
          return responder(req, 403, { erro: "Funcionário fora das obras autorizadas." });
        }
      }
    }
    const { gestor_id: _gestorId, ...dadosPublicos } = alvo;
    return responder(req, 200, { sucesso: true, funcionario: { ...dadosPublicos, _obras_vinculadas: obrasAlvo } });
  }

  if (
    !owner &&
    (!["MASTER", "GESTOR"].includes(String(executor.perfil).toUpperCase()) || !permissoesExecutor.has("USUARIOS_CRIAR"))
  ) {
    return responder(req, 403, {
      erro: "Sem permissão para cadastrar funcionários.",
    });
  }

  let corpo: Record<string, unknown>;

  try {
    corpo = await req.json();

    if (
      !corpo ||
      typeof corpo !== "object" ||
      Array.isArray(corpo)
    ) {
      throw new Error("CORPO_INVALIDO");
    }
  } catch {
    return responder(req, 400, {
      erro: "Dados da solicitação inválidos.",
    });
  }

  let nome: string;
  let usuario: string;
  let email: string;
  let perfil: string;
  let empresaId: number;
  let obras: number[];
  let baseOperacionalId: number;
  let permissoes: string[];

  try {
    nome = String(corpo.nome ?? "").trim();
    usuario = String(corpo.usuario ?? "").trim();
    email = String(corpo.email ?? "").trim().toLowerCase();
    perfil = String(corpo.perfil ?? "ALMOXARIFE")
      .trim()
      .toUpperCase();

    empresaId = Number(corpo.empresa_id);
    obras = validarObras(corpo.obras);
    baseOperacionalId = Number(corpo.obra_operacional_id);
    if (!Number.isSafeInteger(baseOperacionalId) || !obras.includes(baseOperacionalId)) {
      throw new Error("BASE_OPERACIONAL_INVALIDA");
    }
    permissoes = validarPermissoes(corpo.permissoes ?? []);

    if (
      nome.length < 3 ||
      nome.length > 150 ||
      usuario.length < 3 ||
      usuario.length > 100 ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !Number.isSafeInteger(empresaId) ||
      empresaId <= 0
    ) {
      throw new Error("DADOS_INVALIDOS");
    }

    if (!["ADMIN", "ALMOXARIFE", "MASTER", "GESTOR"].includes(perfil)) {
      throw new Error("PERFIL_INVALIDO");
    }
  } catch {
    return responder(req, 400, {
      erro: "Verifique nome, usuário, e-mail, perfil, empresa, obras e permissões.",
    });
  }

  if (!owner && ["MASTER", "GESTOR"].includes(perfil)) {
    return responder(req, 403, {
      erro: "Somente o OWNER pode criar MASTER ou GESTOR.",
    });
  }

  if (!owner && permissoes.includes("ADMINISTRACAO_DELEGADA")) {
    return responder(req, 403, { erro: "Somente o OWNER pode conceder administração delegada." });
  }

  if (
    !owner &&
    permissoes.some(
      (permissao) => !permissoesExecutor.has(permissao),
    )
  ) {
    return responder(req, 403, {
      erro: "Não é permitido conceder permissões superiores às próprias.",
    });
  }

  if (
    !owner &&
    empresaId !== Number(executor.empresa_id)
  ) {
    return responder(req, 403, {
      erro: "Empresa não autorizada.",
    });
  }

  // Validação antecipada: a RPC repetirá a autorização.
  const { data: obrasValidas, error: erroObras } =
    await admin
      .from("obras")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .in("id", obras);

  if (erroObras) {
  console.error("ATLAS_CADASTRO_VALIDACAO_OBRAS_ERRO", {
    codigo: erroObras.code,
    mensagem: erroObras.message,
    detalhes: erroObras.details,
    dica: erroObras.hint,
  });

  return responder(req, 500, {
    erro: "Não foi possível validar as obras.",
  });
}

  const idsValidos = new Set(
    (obrasValidas ?? []).map((o) => Number(o.id)),
  );

  if (obras.some((id) => !idsValidos.has(id))) {
    return responder(req, 400, {
      erro: "Uma ou mais obras são inválidas ou inativas.",
    });
  }

  if (!owner) {
    const { data: vinculos, error: erroVinculos } =
      await admin
        .from("usuario_obras")
        .select("obra_id")
        .eq("usuario_id", executor.id);

    if (erroVinculos) {
      return responder(req, 500, {
        erro: "Não foi possível validar o acesso às obras.",
      });
    }

    const autorizadas = new Set(
      (vinculos ?? []).map((v) => Number(v.obra_id)),
    );

    if (obras.some((id) => !autorizadas.has(id))) {
      return responder(req, 403, {
        erro: "Obra fora do alcance do administrador.",
      });
    }
  }

  const { data: existentes, error: erroExistentes } =
    await admin
      .from("usuarios_sistema")
      .select("id")
      .eq("usuario", usuario)
      .limit(1);

  if (erroExistentes) {
    return responder(req, 500, {
      erro: "Não foi possível verificar o usuário.",
    });
  }

  if (existentes?.length) {
    return responder(req, 409, {
      erro: "Este nome de usuário já existe.",
    });
  }

  // Senha opcional informada no formulario. Nunca persiste no cadastro legado.
  // Se omitida, preserva o comportamento anterior: geracao segura no servidor.
  const senhaInformada = corpo.senha_provisoria;
  if (senhaInformada !== undefined &&
      (typeof senhaInformada !== "string" ||
       !senhaAtlasValida(senhaInformada))) {
    return responder(req, 400, {
      erro: "A senha provisória deve ter de 8 a 128 caracteres e combinar pelo menos 2 tipos: maiúsculas, minúsculas, números ou símbolos.",
    });
  }
  const senhaProvisoria = typeof senhaInformada === "string"
    ? senhaInformada
    : `At-${aleatorioHex(24)}`;
  const marcadorLegado = `AUTH_BLOQUEADO_${aleatorioHex(48)}`;

  // 1. Cria a identidade no Supabase Auth.
  const { data: criado, error: erroCriacaoAuth } =
    await admin.auth.admin.createUser({
      email,
      password: senhaProvisoria,
      email_confirm: true,
      app_metadata: { atlas_troca_senha_pendente: true },
      user_metadata: {
        nome,
      },
    });

  if (erroCriacaoAuth || !criado.user) {
    return responder(req, 409, {
      erro: "Não foi possível criar a identidade no Supabase Auth. Verifique se o e-mail já está em uso.",
    });
  }

  const novoAuthId = criado.user.id;

  // 2. A RPC dedicada recebe a base explicitamente e valida sua associação.
  // A RPC legada permanece disponível durante a implantação coordenada.
  const { data: cadastro, error: erroCadastro } =
    await admin.rpc("atlas_admin_criar_usuario_com_base", {
      p_executor_auth_id: executorAuthId,
      p_auth_user_id: novoAuthId,
      p_nome: nome,
      p_usuario: usuario,
      p_email: email,
      p_perfil: perfil,
      p_empresa_id: empresaId,
      p_obras: obras,
      p_obra_operacional_id: baseOperacionalId,
      p_permissoes: permissoes,
      p_marcador_senha: marcadorLegado,
    });

  if (erroCadastro || cadastro?.sucesso !== true) {
    console.error("Atlas: falha na RPC de cadastro", {
      authId: novoAuthId,
      erro: erroCadastro?.message ?? "Retorno inválido",
    });

    // A RPC falhou: tenta desfazer a identidade Auth.
    const { error: erroLimpeza } =
      await admin.auth.admin.deleteUser(novoAuthId);

    if (erroLimpeza) {
      console.error(
        "Atlas: revisão manual necessária",
        novoAuthId,
        erroLimpeza.message,
      );

      return responder(req, 500, {
        erro: "Cadastro incompleto. Contate o administrador antes de tentar novamente.",
      });
    }

    return responder(req, 500, {
      erro: "Cadastro não concluído. Nenhum funcionário foi liberado.",
    });
  }

  return responder(req, 201, {
    sucesso: true,
    funcionario: {
      id: cadastro.id,
      nome,
      usuario,
      email,
      perfil,
      empresa_id: empresaId,
      obras,
      obra_operacional_id: baseOperacionalId,
      permissoes,
    },
    senha_provisoria: senhaProvisoria,
    trocar_senha: true,
    mensagem:
      "Funcionário criado no Supabase Auth e vinculado ao Atlas.",
  });
});
