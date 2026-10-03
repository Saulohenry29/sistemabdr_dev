const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');

const app = express();

const PORT = 3334;
const HOST = '127.0.0.1';

const AVATAR_DIR = '/srv/sathdata/atlas/uploads/avatars';
const REFERENCIA_DIR = '/srv/sathdata/atlas/uploads/referencias';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const ATLAS_INVITE_REDIRECT_URL = process.env.ATLAS_INVITE_REDIRECT_URL || 'https://bdrgestao.com.br/alterar-senha.html';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('Configuração do Supabase ausente.');
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);


const supabaseAdmin = SUPABASE_SECRET_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    })
  : null;

fs.mkdirSync(AVATAR_DIR, { recursive: true });
fs.mkdirSync(REFERENCIA_DIR, { recursive: true });

app.use(helmet());

const ORIGENS_PERMITIDAS = new Set([
  'https://bdrgestao.com.br',
  'https://www.bdrgestao.com.br',
  'https://sathtech.com.br',
  'https://www.sathtech.com.br',
  'http://127.0.0.1:5501'
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ORIGENS_PERMITIDAS.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origem não permitida pelo CORS.'));
  }
}));

app.use(express.json());

async function exigirAutenticacao(req, res, next) {
  try {
    const authorization = req.headers.authorization || '';

    if (!authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        error: 'Autenticação obrigatória.'
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: 'Autenticação obrigatória.'
      });
    }

    const {
      data: { user },
      error
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        ok: false,
        error: 'Sessão inválida ou expirada.'
      });
    }

    req.authUser = user;
    req.accessToken = token;
    next();
  } catch (error) {
    console.error('Erro ao validar autenticação:', error.message);

    return res.status(401).json({
      ok: false,
      error: 'Não foi possível validar a sessão.'
    });
  }
}

function criarClienteDoUsuario(token) {
  return createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
}

async function exigirUsuarioAtlas(req, res, next) {
  try {
    const dbUsuario = criarClienteDoUsuario(req.accessToken);

    const { data, error } = await dbUsuario
      .from('usuarios_sistema')
      .select('id, nome, email, ativo, foto_url, auth_user_id, auth_status, owner_sistema')
      .eq('auth_user_id', req.authUser.id)
      .eq('ativo', true)
      .maybeSingle();

    if (error) {
      console.error('Erro ao localizar usuário Atlas:', error.message);

      return res.status(403).json({
        ok: false,
        error: 'Não foi possível validar o usuário no Atlas.'
      });
    }

    if (!data) {
      return res.status(403).json({
        ok: false,
        error: 'Usuário autenticado não está vinculado a uma conta ativa do Atlas.'
      });
    }

    req.dbUsuario = dbUsuario;
    req.usuarioAtlas = data;
    next();
  } catch (error) {
    console.error('Erro ao validar usuário Atlas:', error.message);

    return res.status(403).json({
      ok: false,
      error: 'Não foi possível validar o usuário no Atlas.'
    });
  }
}


async function exigirOwnerAtlas(req, res, next) {
  if (!req.usuarioAtlas?.owner_sistema) {
    return res.status(403).json({
      ok: false,
      error: 'Somente o OWNER do Atlas pode ativar o acesso seguro.'
    });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({
      ok: false,
      error: 'O backend seguro ainda não foi configurado.'
    });
  }

  next();
}

app.post(
  '/api/auth/usuarios/:id/ativar',
  exigirAutenticacao,
  exigirUsuarioAtlas,
  exigirOwnerAtlas,
  async (req, res) => {
    const usuarioId = Number(req.params.id);

    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res.status(400).json({ ok: false, error: 'Usuário inválido.' });
    }

    const { data: alvo, error: erroAlvo } = await supabaseAdmin
      .from('usuarios_sistema')
      .select('id, nome, email, ativo, auth_user_id, auth_status')
      .eq('id', usuarioId)
      .maybeSingle();

    if (erroAlvo) {
      console.error('Erro ao consultar usuário para ativação segura:', erroAlvo.message);
      return res.status(500).json({
        ok: false,
        error: 'Não foi possível consultar o usuário no BDR Gestão. Tente novamente.'
      });
    }

    if (!alvo) {
      return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
    }

    if (alvo.ativo === false) {
      return res.status(409).json({ ok: false, error: 'Não é possível ativar acesso seguro para um usuário inativo.' });
    }

    if (alvo.auth_user_id) {
      return res.status(409).json({ ok: false, error: 'Este usuário já possui uma identidade segura vinculada.' });
    }

    const email = String(alvo.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Cadastre um e-mail válido antes de ativar o acesso seguro.' });
    }

    const { data: criacao, error: erroCriacao } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        atlas_usuario_id: alvo.id,
        atlas_nome: alvo.nome,
        origem: 'BDR_GESTAO'
      }
    });

    if (erroCriacao || !criacao?.user?.id) {
      console.error('Falha ao preparar usuário Auth:', erroCriacao?.message || 'Usuário Auth não retornado.');
      return res.status(409).json({
        ok: false,
        error: 'Não foi possível preparar o acesso seguro. Verifique se este e-mail já existe no Supabase Auth.'
      });
    }

    const authUserId = criacao.user.id;
    const { data: atualizado, error: erroVinculo } = await supabaseAdmin
      .from('usuarios_sistema')
      .update({
        auth_user_id: authUserId,
        auth_status: 'AGUARDANDO_ATIVACAO',
        auth_ativado_por: req.usuarioAtlas.id,
        auth_ativado_em: new Date().toISOString()
      })
      .eq('id', alvo.id)
      .is('auth_user_id', null)
      .select('id, nome, email, auth_user_id, auth_status, auth_ativado_em, auth_ativado_por')
      .maybeSingle();

    if (erroVinculo || !atualizado) {
      const { error: erroRollback } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
      if (erroRollback) console.error('Falha ao desfazer usuário Auth após erro de vínculo:', erroRollback.message);
      console.error('Falha ao vincular usuário Atlas ao Auth:', erroVinculo?.message || 'Registro não atualizado.');
      return res.status(500).json({ ok: false, error: 'O acesso seguro não pôde ser vinculado ao usuário no BDR Gestão. A operação foi cancelada.' });
    }

    return res.status(201).json({
      ok: true,
      user: atualizado,
      message: 'Acesso seguro preparado sem encerrar a sessão atual do usuário.'
    });
  }
);



const tentativasMigracao = new Map();
function permitirTentativaMigracao(req, usuarioId) {
  const chave = `${req.ip || 'ip'}:${usuarioId}`;
  const agora = Date.now();
  const janela = 10 * 60 * 1000;
  const limite = 8;
  const registro = tentativasMigracao.get(chave) || { inicio: agora, total: 0 };
  if (agora - registro.inicio > janela) {
    tentativasMigracao.set(chave, { inicio: agora, total: 1 });
    return true;
  }
  registro.total += 1;
  tentativasMigracao.set(chave, registro);
  return registro.total <= limite;
}

app.post('/api/auth/concluir-migracao-legada', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, error: 'O backend seguro ainda não foi configurado.' });
  }

  const usuarioId = Number(req.body?.usuario_id);
  const senhaAtual = String(req.body?.senha_atual || '');
  const novaSenha = String(req.body?.nova_senha || '');

  if (!Number.isInteger(usuarioId) || usuarioId <= 0 || !senhaAtual || novaSenha.length < 8) {
    return res.status(400).json({ ok: false, error: 'Dados de ativação inválidos.' });
  }

  if (!permitirTentativaMigracao(req, usuarioId)) {
    return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  }

  const { data: alvo, error: erroAlvo } = await supabaseAdmin
    .from('usuarios_sistema')
    .select('id,nome,usuario,email,senha,ativo,auth_user_id,auth_status')
    .eq('id', usuarioId)
    .maybeSingle();

  if (erroAlvo) {
    console.error('Erro ao consultar conta durante migração:', erroAlvo.message);
    return res.status(500).json({ ok: false, error: 'Não foi possível consultar sua conta no BDR Gestão. Tente novamente.' });
  }

  if (!alvo || alvo.ativo === false) {
    return res.status(403).json({ ok: false, error: 'Não foi possível validar a conta.' });
  }

  if (String(alvo.auth_status || '').toUpperCase() !== 'AGUARDANDO_ATIVACAO' || !alvo.auth_user_id) {
    return res.status(409).json({ ok: false, error: 'Esta conta não possui uma atualização de segurança pendente.' });
  }

  if (String(alvo.senha || '') !== senhaAtual) {
    return res.status(401).json({ ok: false, error: 'Senha atual incorreta.' });
  }

  const { error: erroSenha } = await supabaseAdmin.auth.admin.updateUserById(alvo.auth_user_id, {
    password: novaSenha,
    email_confirm: true
  });

  if (erroSenha) {
    console.error('Falha ao definir senha segura:', erroSenha.message);
    return res.status(500).json({ ok: false, error: 'Não foi possível criar a nova senha segura.' });
  }

  const { data: atualizado, error: erroAtualizacao } = await supabaseAdmin
    .from('usuarios_sistema')
    .update({ auth_status: 'ATIVO', auth_ativado_em: new Date().toISOString() })
    .eq('id', alvo.id)
    .eq('auth_user_id', alvo.auth_user_id)
    .eq('auth_status', 'AGUARDANDO_ATIVACAO')
    .select('id,nome,usuario,email,perfil,empresa_id,obra_id,ativo,permissoes,obras_liberadas,foto_url,telefone,cargo,senha_provisoria,trocar_senha,senha_temporaria,auth_user_id,auth_status,owner_sistema')
    .maybeSingle();

  if (erroAtualizacao || !atualizado) {
    console.error('Falha ao finalizar migração no BDR Gestão:', erroAtualizacao?.message || 'Registro não atualizado.');
    return res.status(500).json({
      ok: false,
      error: 'A nova senha foi definida, mas a ativação ainda não foi concluída. Sua conta continua no modo de transição; tente concluir novamente.'
    });
  }

  return res.status(200).json({ ok: true, user: atualizado, message: 'Acesso seguro ativado com sucesso.' });
});

app.post(
  '/api/auth/concluir-ativacao',
  exigirAutenticacao,
  async (req, res) => {
    if (!supabaseAdmin) {
      return res.status(503).json({
        ok: false,
        error: 'O backend seguro ainda não foi configurado.'
      });
    }

    const authUserId = req.authUser?.id;
    const emailAuth = String(req.authUser?.email || '').trim().toLowerCase();

    const { data: alvo, error: erroAlvo } = await supabaseAdmin
      .from('usuarios_sistema')
      .select('id, nome, email, ativo, auth_user_id, auth_status')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (erroAlvo) {
      console.error('Erro ao localizar ativação pendente:', erroAlvo.message);
      return res.status(500).json({ ok: false, error: 'Não foi possível concluir a ativação.' });
    }

    if (!alvo || alvo.ativo === false) {
      return res.status(403).json({ ok: false, error: 'Conta Atlas ativa não encontrada para esta identidade.' });
    }

    const emailAtlas = String(alvo.email || '').trim().toLowerCase();
    if (!emailAtlas || !emailAuth || emailAtlas !== emailAuth) {
      return res.status(403).json({ ok: false, error: 'O e-mail autenticado não corresponde ao cadastro Atlas.' });
    }

    if (String(alvo.auth_status || '').toUpperCase() === 'ATIVO') {
      return res.status(200).json({ ok: true, user: alvo, message: 'Acesso seguro já está ativo.' });
    }

    if (String(alvo.auth_status || '').toUpperCase() !== 'AGUARDANDO_ATIVACAO') {
      return res.status(409).json({ ok: false, error: 'Esta conta não possui uma ativação pendente.' });
    }

    const { data: atualizado, error: erroAtualizacao } = await supabaseAdmin
      .from('usuarios_sistema')
      .update({
        auth_status: 'ATIVO',
        auth_ativado_em: new Date().toISOString()
      })
      .eq('id', alvo.id)
      .eq('auth_user_id', authUserId)
      .eq('auth_status', 'AGUARDANDO_ATIVACAO')
      .select('id, nome, email, auth_user_id, auth_status, auth_ativado_em, auth_ativado_por')
      .maybeSingle();

    if (erroAtualizacao || !atualizado) {
      console.error('Falha ao concluir ativação Atlas:', erroAtualizacao?.message || 'Registro não atualizado.');
      return res.status(500).json({ ok: false, error: 'Não foi possível concluir a ativação.' });
    }

    return res.status(200).json({
      ok: true,
      user: atualizado,
      message: 'Acesso seguro ativado com sucesso.'
    });
  }
);

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },

  fileFilter: (req, file, cb) => {
    const permitidos = new Set([
      'image/jpeg',
      'image/png',
      'image/webp'
    ]);

    if (!permitidos.has(file.mimetype)) {
      return cb(new Error('Formato de imagem não permitido.'));
    }

    cb(null, true);
  }
});

function caminhoAvatarSeguro(fotoUrl) {
  if (!fotoUrl || typeof fotoUrl !== 'string') {
    return null;
  }

  const normalizado = fotoUrl.replace(/\\/g, '/');

  if (!normalizado.startsWith('avatars/')) {
    return null;
  }

  const nomeArquivo = path.basename(normalizado);

  if (!nomeArquivo || nomeArquivo !== normalizado.slice('avatars/'.length)) {
    return null;
  }

  if (!nomeArquivo.toLowerCase().endsWith('.webp')) {
    return null;
  }

  return path.join(AVATAR_DIR, nomeArquivo);
}

function caminhoReferenciaSeguro(fotoUrl) {
  if (!fotoUrl || typeof fotoUrl !== 'string') {
    return null;
  }

  const normalizado = fotoUrl.replace(/\\/g, '/');

  if (!normalizado.startsWith('referencias/')) {
    return null;
  }

  const nomeArquivo = path.basename(normalizado);

  if (!nomeArquivo || nomeArquivo !== normalizado.slice('referencias/'.length)) {
    return null;
  }

  if (!nomeArquivo.toLowerCase().endsWith('.webp')) {
    return null;
  }

  return path.join(REFERENCIA_DIR, nomeArquivo);
}

async function apagarArquivoSeExistir(caminhoArquivo) {
  if (!caminhoArquivo) {
    return;
  }

  try {
    await fs.promises.unlink(caminhoArquivo);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Não foi possível remover arquivo:', error.message);
    }
  }
}

app.use(
  '/files/avatars',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(AVATAR_DIR, {
    fallthrough: false,
    maxAge: '1d'
  })
);

app.use(
  '/files/referencias',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(REFERENCIA_DIR, {
    fallthrough: false,
    maxAge: '1d'
  })
);

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'atlas-files-api'
  });
});

app.post(
  '/api/avatars',
  exigirAutenticacao,
  exigirUsuarioAtlas,
  upload.single('avatar'),
  async (req, res, next) => {
    let caminhoArquivoNovo = null;

    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: 'Nenhuma imagem recebida.'
        });
      }

      const nomeArquivo = `${Date.now()}-${crypto.randomUUID()}.webp`;
      caminhoArquivoNovo = path.join(AVATAR_DIR, nomeArquivo);
      const caminhoRelativo = `avatars/${nomeArquivo}`;

      let imagem;

      try {
        imagem = sharp(req.file.buffer, {
          failOn: 'error',
          limitInputPixels: 40_000_000
        });

        const metadata = await imagem.metadata();

        if (!metadata.width || !metadata.height) {
          throw new Error('Imagem sem dimensões válidas.');
        }
      } catch {
        return res.status(400).json({
          ok: false,
          error: 'Arquivo de imagem inválido ou corrompido.'
        });
      }

      const info = await imagem
        .rotate()
        .resize({
          width: 512,
          height: 512,
          fit: 'cover',
          position: 'centre',
          withoutEnlargement: true
        })
        .webp({
          quality: 82,
          effort: 4
        })
        .toFile(caminhoArquivoNovo);

      const fotoAnterior = req.usuarioAtlas.foto_url || null;

      const { data: resultadoRpc, error: erroAtualizacao } =
        await req.dbUsuario.rpc('atualizar_meu_avatar', {
          p_foto_url: caminhoRelativo
        });

      const usuarioAtualizado = Array.isArray(resultadoRpc)
        ? resultadoRpc[0]
        : resultadoRpc;

      if (erroAtualizacao || !usuarioAtualizado) {
        await apagarArquivoSeExistir(caminhoArquivoNovo);
        caminhoArquivoNovo = null;

        console.error(
          'Erro ao salvar foto_url:',
          erroAtualizacao?.message || 'Usuário não atualizado.'
        );

        return res.status(403).json({
          ok: false,
          error: 'O Atlas não autorizou a atualização da foto do perfil.'
        });
      }

      const caminhoAnterior = caminhoAvatarSeguro(fotoAnterior);

      if (caminhoAnterior && caminhoAnterior !== caminhoArquivoNovo) {
        await apagarArquivoSeExistir(caminhoAnterior);
      }

      return res.status(201).json({
        ok: true,
        file: {
          name: nomeArquivo,
          path: caminhoRelativo,
          size: info.size,
          mime: 'image/webp',
          width: info.width,
          height: info.height
        },
        user: {
          id: usuarioAtualizado.id,
          foto_url: usuarioAtualizado.foto_url
        }
      });
    } catch (error) {
      if (caminhoArquivoNovo) {
        await apagarArquivoSeExistir(caminhoArquivoNovo);
      }

      next(error);
    }
  }
);

app.post(
  '/api/referencias',
  exigirAutenticacao,
  exigirUsuarioAtlas,
  upload.single('imagem'),
  async (req, res, next) => {
    let caminhoArquivoNovo = null;

    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: 'Nenhuma imagem recebida.'
        });
      }

      const nomeReferencia = String(req.body?.nome_referencia || '').trim();
      const marca = String(req.body?.marca || '').trim();
      const modelo = String(req.body?.modelo || '').trim();

      if (!nomeReferencia || !marca || !modelo) {
        return res.status(400).json({
          ok: false,
          error: 'Nome da referência, marca e modelo são obrigatórios.'
        });
      }

      const nomeArquivo = `${Date.now()}-${crypto.randomUUID()}.webp`;
      caminhoArquivoNovo = path.join(REFERENCIA_DIR, nomeArquivo);
      const caminhoRelativo = `referencias/${nomeArquivo}`;

      let imagem;

      try {
        imagem = sharp(req.file.buffer, {
          failOn: 'error',
          limitInputPixels: 40_000_000
        });

        const metadata = await imagem.metadata();

        if (!metadata.width || !metadata.height) {
          throw new Error('Imagem sem dimensões válidas.');
        }
      } catch {
        return res.status(400).json({
          ok: false,
          error: 'Arquivo de imagem inválido ou corrompido.'
        });
      }

      const info = await imagem
        .rotate()
        .resize({
          width: 1200,
          height: 1200,
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({
          quality: 82,
          effort: 4
        })
        .toFile(caminhoArquivoNovo);

      const { data: referenciaExistente, error: erroConsulta } =
        await req.dbUsuario
          .from('atlas_imagens_referencia')
          .select('id, foto_url')
          .ilike('marca', marca)
          .ilike('modelo', modelo)
          .maybeSingle();

      if (erroConsulta) {
        await apagarArquivoSeExistir(caminhoArquivoNovo);
        caminhoArquivoNovo = null;

        console.error('Erro ao consultar imagem de referência:', erroConsulta.message);

        return res.status(403).json({
          ok: false,
          error: 'O Atlas não autorizou a consulta da imagem de referência.'
        });
      }

      let referenciaSalva;
      let erroBanco;

      if (referenciaExistente) {
        const resultado = await req.dbUsuario
          .from('atlas_imagens_referencia')
          .update({
            nome_referencia: nomeReferencia,
            marca,
            modelo,
            foto_url: caminhoRelativo,
            ativo: true,
            usuario_cadastro: req.usuarioAtlas.nome,
            updated_at: new Date().toISOString()
          })
          .eq('id', referenciaExistente.id)
          .select('id, nome_referencia, marca, modelo, foto_url, ativo, usuario_cadastro, created_at, updated_at')
          .single();

        referenciaSalva = resultado.data;
        erroBanco = resultado.error;
      } else {
        const resultado = await req.dbUsuario
          .from('atlas_imagens_referencia')
          .insert({
            nome_referencia: nomeReferencia,
            marca,
            modelo,
            foto_url: caminhoRelativo,
            ativo: true,
            usuario_cadastro: req.usuarioAtlas.nome
          })
          .select('id, nome_referencia, marca, modelo, foto_url, ativo, usuario_cadastro, created_at, updated_at')
          .single();

        referenciaSalva = resultado.data;
        erroBanco = resultado.error;
      }

      if (erroBanco || !referenciaSalva) {
        await apagarArquivoSeExistir(caminhoArquivoNovo);
        caminhoArquivoNovo = null;

        console.error(
          'Erro ao salvar imagem de referência:',
          erroBanco?.message || 'Referência não salva.'
        );

        return res.status(403).json({
          ok: false,
          error: 'O Atlas não autorizou a gravação da imagem de referência.'
        });
      }

      const caminhoAnterior = caminhoReferenciaSeguro(
        referenciaExistente?.foto_url || null
      );

      if (caminhoAnterior && caminhoAnterior !== caminhoArquivoNovo) {
        await apagarArquivoSeExistir(caminhoAnterior);
      }

      return res.status(referenciaExistente ? 200 : 201).json({
        ok: true,
        file: {
          name: nomeArquivo,
          path: caminhoRelativo,
          size: info.size,
          mime: 'image/webp',
          width: info.width,
          height: info.height
        },
        reference: referenciaSalva
      });
    } catch (error) {
      if (caminhoArquivoNovo) {
        await apagarArquivoSeExistir(caminhoArquivoNovo);
      }

      next(error);
    }
  }
);

app.use((err, req, res, next) => {
  console.error(err.message);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        ok: false,
        error: 'A imagem excede o limite de 5 MB.'
      });
    }

    return res.status(400).json({
      ok: false,
      error: 'Não foi possível receber a imagem.'
    });
  }

  return res.status(400).json({
    ok: false,
    error: err.message || 'Erro ao processar a solicitação.'
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Atlas Files API: http://${HOST}:${PORT}`);
});
