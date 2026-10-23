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
        auth_ativado_em: new Date().toISOString(),
        senha_provisoria: false, senha_temporaria: false, trocar_senha: false
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



// Administração delegada: identidade, permissões e obras vêm do banco, nunca do corpo da requisição.
const ATLAS_ADMIN_TOKENS = new Set([
  'USUARIOS_VER','USUARIOS_CRIAR','USUARIOS_EDITAR','USUARIOS_BLOQUEAR',
  'USUARIOS_PERMISSOES','USUARIOS_OBRAS','USUARIOS_HISTORICO'
]);
const listaTokens = valor => new Set(String(valor || '').split(',').map(x => x.trim()).filter(Boolean));
const listaObras = valor => new Set(String(valor || '').split(',').map(x => Number(x.trim())).filter(Number.isSafeInteger));
const idValido = valor => Number.isSafeInteger(Number(valor)) && Number(valor) > 0;

async function contextoAdministrativo(req, res, next) {
  if (!supabaseAdmin) return res.status(503).json({ok:false,error:'Backend seguro não configurado.'});
  const {data: executor, error} = await supabaseAdmin.from('usuarios_sistema')
    .select('id,empresa_id,perfil,ativo,owner_sistema,permissoes,obra_id,obras_liberadas')
    .eq('id',req.usuarioAtlas.id).eq('auth_user_id',req.authUser.id).maybeSingle();
  if(error || !executor || executor.ativo !== true) return res.status(403).json({ok:false,error:'Executor não autorizado.'});
  const {data: vinculos, error:erroVinculos} = await supabaseAdmin.from('usuario_obras')
    .select('obra_id').eq('usuario_id',executor.id);
  if(erroVinculos) return res.status(503).json({ok:false,error:'Não foi possível validar as obras do executor.'});
  const obras = new Set((vinculos || []).map(v=>Number(v.obra_id)));
  // Se não há vínculos normalizados, não autorizar obras apenas pelo cadastro legado.
  req.adminAtlas = {executor, obras, perms:listaTokens(executor.permissoes), owner:executor.owner_sistema === true};
  next();
}
function podeAdmin(req,token){
  if(req.adminAtlas?.owner) return true;
  const perfil=String(req.adminAtlas?.executor?.perfil||'').toUpperCase();
  return ['MASTER','GESTOR'].includes(perfil) && req.adminAtlas.perms.has(token);
}
function negarPermissao(res){return res.status(403).json({ok:false,error:'Permissão administrativa insuficiente.'})}
function semElevacao(req, tokens){
  return req.adminAtlas.owner || [...tokens].every(t=>req.adminAtlas.perms.has(t));
}
function obrasPermitidas(req, obras){return req.adminAtlas.owner || obras.every(id=>req.adminAtlas.obras.has(id))}
async function alvoAdministravel(req, res, usuarioId, permissao) {
  if(!podeAdmin(req,permissao)) { negarPermissao(res); return null; }
  const {data:alvo,error} = await supabaseAdmin.from('usuarios_sistema')
    .select('id,nome,usuario,email,perfil,perfil_rapido,empresa_id,ativo,permissoes,owner_sistema,auth_user_id,auth_status,obra_id,obras_liberadas,telefone,cargo,observacao_acesso,created_at,updated_at,ultimo_acesso,gestor_id')
    .eq('id',usuarioId).maybeSingle();
  if(error) {res.status(500).json({ok:false,error:'Erro ao consultar funcionário.'});return null}
  if(!alvo) {res.status(404).json({ok:false,error:'Funcionário não encontrado.'});return null}
  if(!req.adminAtlas.owner && (alvo.owner_sistema || alvo.id === req.adminAtlas.executor.id ||
      String(alvo.perfil||'').toUpperCase()==='MASTER')) {
    negarPermissao(res);return null;
  }
  const {data:vinculos,error:erroVinculos} = await supabaseAdmin.from('usuario_obras')
    .select('obra_id').eq('usuario_id',usuarioId);
  if(erroVinculos) {res.status(500).json({ok:false,error:'Erro ao consultar vínculos.'});return null}
  const obras=(vinculos||[]).map(v=>Number(v.obra_id));
  const perfilExecutor=String(req.adminAtlas.executor.perfil||'').toUpperCase();
  if(!req.adminAtlas.owner && perfilExecutor==='GESTOR'){
    // Não basta compartilhar obra: o subordinado precisa estar atribuído
    // diretamente ao gestor autenticado, na mesma empresa e no perfil permitido.
    if(Number(alvo.gestor_id)!==Number(req.adminAtlas.executor.id) ||
       Number(alvo.empresa_id)!==Number(req.adminAtlas.executor.empresa_id) ||
       !['ADMIN','ALMOXARIFE'].includes(String(alvo.perfil||'').toUpperCase())){
      negarPermissao(res);return null;
    }
  }else if(!req.adminAtlas.owner && !obras.some(id=>req.adminAtlas.obras.has(id))){
    negarPermissao(res);return null;
  }
  const {gestor_id: _gestorId, ...dadosPublicos}=alvo;
  return {...dadosPublicos,_obras_vinculadas:obras};
}

// Detalhes completos: nunca retorna senha nem outras credenciais.
app.get('/api/admin/usuarios/:id',exigirAutenticacao,exigirUsuarioAtlas,contextoAdministrativo,async(req,res)=>{
  if(!podeAdmin(req,'USUARIOS_VER')) return negarPermissao(res);
  const id=Number(req.params.id);
  if(!idValido(id)) return res.status(400).json({ok:false,error:'ID inválido.'});
  // Consulta do próprio registro é permitida; a edição segue regras separadas.
  const alvo=await alvoAdministravel(req,res,id,'USUARIOS_VER');
  if(!alvo)return;
  return res.json({ok:true,user:alvo});
});

// Alterações parciais. Nunca aceita senha, identidade Auth ou owner_sistema.
app.patch('/api/admin/usuarios/:id',exigirAutenticacao,exigirUsuarioAtlas,contextoAdministrativo,async(req,res)=>{
  const id=Number(req.params.id);
  if(!idValido(id)) return res.status(400).json({ok:false,error:'ID inválido.'});
  const dados=req.body || {};
  const permitidos=new Set(['nome','usuario','email','telefone','cargo','ativo','permissoes','perfil_rapido','obras']);
  if(Object.keys(dados).length===0 || Object.keys(dados).some(k=>!permitidos.has(k)))
    return res.status(400).json({ok:false,error:'Campos não permitidos.'});
  const cadastrais=['nome','usuario','email','telefone','cargo'];
  const alteraDados=cadastrais.some(k=>Object.hasOwn(dados,k));
  const alteraStatus=Object.hasOwn(dados,'ativo');
  const alteraAcesso=['permissoes','perfil_rapido','obras'].some(k=>Object.hasOwn(dados,k));
  if((alteraDados&&!podeAdmin(req,'USUARIOS_EDITAR')) ||
     (alteraStatus&&!podeAdmin(req,'USUARIOS_BLOQUEAR')) ||
     (alteraAcesso&&!podeAdmin(req,'USUARIOS_PERMISSOES'))) return negarPermissao(res);
  if(Object.hasOwn(dados,'obras')&&!podeAdmin(req,'USUARIOS_OBRAS')) return negarPermissao(res);
  const alvo=await alvoAdministravel(req,res,id,alteraAcesso?'USUARIOS_PERMISSOES':alteraStatus?'USUARIOS_BLOQUEAR':'USUARIOS_EDITAR');
  if(!alvo)return;
  const update={};
  for(const campo of cadastrais){
    if(!Object.hasOwn(dados,campo))continue;
    if(dados[campo]!==null && typeof dados[campo]!=='string') return res.status(400).json({ok:false,error:'Dados inválidos.'});
    const valor=String(dados[campo]||'').trim();
    if(valor.length>180 || (['nome','usuario'].includes(campo)&&!valor)) return res.status(400).json({ok:false,error:'Dados inválidos.'});
    if(campo==='email'&&valor&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) return res.status(400).json({ok:false,error:'E-mail inválido.'});
    update[campo]=valor||null;
  }
  if(alteraStatus){if(typeof dados.ativo!=='boolean')return res.status(400).json({ok:false,error:'Status inválido.'});update.ativo=dados.ativo}
  if(Object.hasOwn(dados,'permissoes')){
    if(!Array.isArray(dados.permissoes)||dados.permissoes.length>150||dados.permissoes.some(t=>typeof t!=='string'||!/^[A-Z0-9_]{2,80}$/.test(t)))
      return res.status(400).json({ok:false,error:'Permissões inválidas.'});
    const novo=new Set(dados.permissoes);
    const antigo=listaTokens(alvo.permissoes);
    const modificados=new Set([...novo,...antigo].filter(t=>novo.has(t)!==antigo.has(t)));
    if(!semElevacao(req,modificados))return negarPermissao(res);
    update.permissoes=[...novo].join(',');
  }
  if(Object.hasOwn(dados,'perfil_rapido')){
    if(dados.perfil_rapido!==null && (typeof dados.perfil_rapido!=='string'||dados.perfil_rapido.length>100))return res.status(400).json({ok:false,error:'Perfil inválido.'});
    update.perfil_rapido=dados.perfil_rapido;
  }
  // Alteração de vínculos exige transação no banco. Até existir RPC atômica,
  // não fazemos delete/insert separados que possam remover obras de terceiros.
  if(Object.hasOwn(dados,'obras'))return res.status(409).json({ok:false,error:'Alteração de obras aguarda operação transacional segura.'});
  const {data:salvo,error:erroSalvar}=await supabaseAdmin.from('usuarios_sistema').update(update)
    .eq('id',id).select('id,nome,usuario,email,perfil,perfil_rapido,empresa_id,ativo,permissoes,telefone,cargo').single();
  if(erroSalvar)return res.status(500).json({ok:false,error:'Não foi possível salvar a alteração.'});
  return res.json({ok:true,user:salvo});
});

// Cadastro de NOVOS funcionários: nunca cria credenciais no legado.
// Primeira etapa limitada ao OWNER autenticado; delegação MASTER exige
// validação de escopo no servidor e não pode usar o RPC legado.
app.post('/api/auth/usuarios', exigirAutenticacao, exigirUsuarioAtlas, contextoAdministrativo, async (req, res) => {
  if(!podeAdmin(req,'USUARIOS_CRIAR')) return negarPermissao(res);
  // Cadastro GESTOR exige vínculo gestor_id atômico na RPC/Edge Function.
  if(String(req.adminAtlas.executor.perfil||'').toUpperCase()==='GESTOR')
    return res.status(409).json({ok:false,error:'Cadastro pelo GESTOR aguarda fluxo transacional seguro.'});
  const dados = req.body || {};
  const nome = String(dados.nome || '').trim();
  const usuario = String(dados.usuario || '').trim();
  const email = String(dados.email || '').trim().toLowerCase();
  const perfil = String(dados.perfil || '').trim().toUpperCase();
  const empresaId = Number(dados.empresa_id);
  const permissoes = Array.isArray(dados.permissoes) ? dados.permissoes : [];
  const obras = Array.isArray(dados.obras) ? dados.obras.map(Number) : [];
  const obraOperacional = dados.obra_operacional_id == null ? null : Number(dados.obra_operacional_id);
  const perfilValido = /^[A-Z0-9_ -]{2,80}$/.test(perfil);
  if(!req.adminAtlas.owner && (perfil === 'MASTER' || perfil === 'OWNER' || !obrasPermitidas(req,obras) ||
      !semElevacao(req,new Set(permissoes)))) return negarPermissao(res);
  if (!nome || nome.length > 180 || !/^[a-zA-Z0-9._@-]{3,120}$/.test(usuario) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !perfilValido ||
      !Number.isSafeInteger(empresaId) || empresaId <= 0 ||
      obras.length === 0 || obras.length > 100 ||
      obras.some(id => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(obras).size !== obras.length ||
      permissoes.length > 150 || permissoes.some(p => typeof p !== 'string' || !/^[A-Z0-9_]{2,80}$/.test(p)) ||
      (obraOperacional !== null && (!Number.isSafeInteger(obraOperacional) || !obras.includes(obraOperacional)))) {
    return res.status(400).json({ ok: false, error: 'Revise nome, usuário, e-mail, perfil, empresa, obras e permissões.' });
  }
  if (dados.senha || dados.owner_sistema || dados.auth_user_id) {
    return res.status(400).json({ ok: false, error: 'Senhas e identidade Auth não podem ser informadas no cadastro.' });
  }
  // Conferir obras e empresa no banco, em vez de confiar no navegador.
  const { data: obrasValidas, error: erroObras } = await supabaseAdmin.from('obras')
    .select('id, empresa_id').in('id', obras);
  if (erroObras || !obrasValidas || obrasValidas.length !== obras.length ||
      obrasValidas.some(o => Number(o.empresa_id) !== empresaId)) {
    return res.status(400).json({ ok: false, error: 'Obras não encontradas ou incompatíveis com a empresa.' });
  }
  if(!req.adminAtlas.owner && Number(req.adminAtlas.executor.empresa_id)!==empresaId) return negarPermissao(res);
  const { data: existente, error: erroExistente } = await supabaseAdmin.from('usuarios_sistema')
    .select('id').or(`email.eq.${email},usuario.eq.${usuario}`).limit(1);
  if (erroExistente) return res.status(500).json({ ok: false, error: 'Não foi possível verificar duplicidades.' });
  if (existente?.length) return res.status(409).json({ ok: false, error: 'E-mail ou usuário já cadastrado no Atlas.' });

  let authId = null;
  let atlasId = null;
  try {
    const { data: identidade, error: erroAuth } = await supabaseAdmin.auth.admin.createUser({
      email, email_confirm: true,
      user_metadata: { atlas_nome: nome, origem: 'BDR_GESTAO' }
    });
    if (erroAuth || !identidade?.user?.id) {
      return res.status(409).json({ ok: false, error: 'Não foi possível criar o acesso seguro. Verifique se o e-mail já está em uso.' });
    }
    authId = identidade.user.id;
    const { data: cadastrado, error: erroCadastro } = await supabaseAdmin.from('usuarios_sistema')
      .insert({
        nome, usuario, email, perfil, empresa_id: empresaId, ativo: true,
        permissoes: [...new Set(permissoes)].join(','),
        obras_liberadas: obras.join(','),
        perfil_rapido: String(dados.perfil_rapido || perfil).slice(0, 100),
        auth_user_id: authId, auth_status: 'AGUARDANDO_ATIVACAO',
        auth_ativado_por: req.usuarioAtlas.id, auth_ativado_em: new Date().toISOString(),
        owner_sistema: false, senha_provisoria: false, senha_temporaria: false, trocar_senha: false
      }).select('id, nome, email, auth_status').single();
    if (erroCadastro || !cadastrado) throw new Error('cadastro');
    atlasId = cadastrado.id;
    const { error: erroVinculos } = await supabaseAdmin.from('usuario_obras')
      .insert(obras.map(obra_id => ({ usuario_id: atlasId, obra_id })));
    if (erroVinculos) throw new Error('vinculos');
    if (obraOperacional !== null) {
      const { error: erroOperacional } = await supabaseAdmin.from('atlas_usuario_obras')
        .insert({ usuario_id: atlasId, obra_id: obraOperacional });
      if (erroOperacional) throw new Error('operacional');
    }
    // Só envia após os vínculos estarem persistidos.
    const { error: erroConvite } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: ATLAS_INVITE_REDIRECT_URL
    });
    if (erroConvite) {
      console.error('Convite de novo usuário não enviado:', erroConvite.message);
      return res.status(201).json({ ok: true, user: cadastrado, convite_enviado: false,
        message: 'Usuário criado no Auth e Atlas, mas o e-mail de ativação não foi enviado. Não recrie a conta; solicite novo envio.' });
    }
    return res.status(201).json({ ok: true, user: cadastrado, convite_enviado: true,
      message: 'Usuário criado com acesso seguro. Instruções de definição de senha enviadas por e-mail.' });
  } catch (erro) {
    console.error('Falha no cadastro seguro:', erro.message);
    // Não apagar conta Auth se o cadastro Atlas persistiu e o rollback falhar.
    let bancoLimpo = true;
    if (atlasId) {
      const { error: erroLimpaVinculos } = await supabaseAdmin.from('usuario_obras').delete().eq('usuario_id', atlasId);
      const { error: erroLimpaOperacional } = await supabaseAdmin.from('atlas_usuario_obras').delete().eq('usuario_id', atlasId);
      const { error: erroLimpaCadastro } = await supabaseAdmin.from('usuarios_sistema').delete().eq('id', atlasId);
      bancoLimpo = !erroLimpaVinculos && !erroLimpaOperacional && !erroLimpaCadastro;
    }
    if (authId && bancoLimpo) {
      const { error: erroLimpaAuth } = await supabaseAdmin.auth.admin.deleteUser(authId);
      if (erroLimpaAuth) console.error('Falha no rollback Auth:', erroLimpaAuth.message);
    }
    return res.status(500).json({ ok: false,
      error: bancoLimpo ? 'Não foi possível concluir o cadastro seguro. Verifique os logs antes de tentar novamente.' :
        'Cadastro parcialmente persistido. NÃO tente novamente antes de reconciliar os dados.' });
  }
});


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

// Redefinição administrativa: a identidade do executor vem exclusivamente do token Auth.
app.post('/api/auth/usuarios/:id/redefinir-senha', exigirAutenticacao, exigirUsuarioAtlas, exigirOwnerAtlas, async (req, res) => {
  const id = Number(req.params.id);
  const senha = req.body?.senha;
  if (!Number.isSafeInteger(id) || id <= 0 || typeof senha !== 'string' || senha.length < 8 || senha.length > 128) {
    return res.status(400).json({ ok: false, error: 'Usuário ou senha provisória inválidos (8 a 128 caracteres).' });
  }
  if (id === req.usuarioAtlas.id) return res.status(409).json({ ok: false, error: 'Use a troca de senha pessoal para alterar sua própria senha.' });
  const { data: alvo, error: erroBusca } = await supabaseAdmin.from('usuarios_sistema')
    .select('id,ativo,auth_user_id,auth_status,owner_sistema').eq('id', id).maybeSingle();
  if (erroBusca) return res.status(500).json({ ok: false, error: 'Falha ao consultar funcionário.' });
  if (!alvo || alvo.ativo === false) return res.status(404).json({ ok: false, error: 'Funcionário ativo não encontrado.' });
  if (alvo.owner_sistema) return res.status(403).json({ ok: false, error: 'Não é permitido redefinir a senha do OWNER por esta operação.' });
  const status = String(alvo.auth_status || 'LEGADO').toUpperCase();
  if (status === 'AGUARDANDO_ATIVACAO') return res.status(409).json({ ok: false, error: 'Conclua a ativação segura pendente antes de redefinir a senha.' });
  if (status === 'ATIVO' && alvo.auth_user_id) {
    // Primeiro bloqueia o acesso normal, depois troca a credencial no Auth.
    const { error: erroMarcacao } = await supabaseAdmin.from('usuarios_sistema')
      .update({ senha_temporaria: true, senha_provisoria: true, trocar_senha: true })
      .eq('id', id).eq('auth_user_id', alvo.auth_user_id).eq('auth_status', 'ATIVO');
    if (erroMarcacao) return res.status(500).json({ ok: false, error: 'Não foi possível marcar a troca obrigatória.' });
    const { error: erroAuth } = await supabaseAdmin.auth.admin.updateUserById(alvo.auth_user_id, { password: senha });
    if (erroAuth) {
      console.error('Falha na redefinição Auth:', erroAuth.message);
      return res.status(500).json({ ok: false, error: 'Troca obrigatória marcada, mas não foi possível redefinir a senha Auth. Tente novamente.' });
    }
    return res.json({ ok: true, message: 'Senha provisória definida no Auth. A troca será obrigatória.' });
  }
  if (status !== 'LEGADO' || alvo.auth_user_id) return res.status(409).json({ ok: false, error: 'Estado de autenticação incompatível; nenhuma senha foi alterada.' });
  const { data: atualizado, error: erroLegado } = await supabaseAdmin.from('usuarios_sistema')
    .update({ senha, senha_temporaria: true, senha_provisoria: true, trocar_senha: true })
    .eq('id', id).or('auth_status.eq.LEGADO,auth_status.is.null').is('auth_user_id', null).select('id').maybeSingle();
  if (erroLegado || !atualizado) return res.status(500).json({ ok: false, error: 'Não foi possível redefinir a senha legada.' });
  return res.json({ ok: true, message: 'Senha provisória legada definida. A troca será obrigatória.' });
});

// Troca de senha de conta Auth ativa: prova da senha atual antes de liberar o acesso.
app.post('/api/auth/trocar-senha', exigirAutenticacao, exigirUsuarioAtlas, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ ok: false, error: 'Backend seguro indisponível.' });
  const atual = req.body?.senha_atual;
  const nova = req.body?.nova_senha;
  if (typeof atual !== 'string' || typeof nova !== 'string' || nova.length < 8 || nova.length > 128 || atual === nova) {
    return res.status(400).json({ ok: false, error: 'Informe a senha atual e uma nova senha diferente (8 a 128 caracteres).' });
  }
  const alvo = req.usuarioAtlas;
  if (String(alvo.auth_status).toUpperCase() !== 'ATIVO') return res.status(409).json({ ok: false, error: 'Esta conta não está ativa no Auth.' });
  if (!permitirTentativaMigracao(req, alvo.id)) return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde alguns minutos.' });
  const verificador = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data: prova, error: erroProva } = await verificador.auth.signInWithPassword({ email: req.authUser.email, password: atual });
  if (erroProva || prova?.user?.id !== req.authUser.id) return res.status(401).json({ ok: false, error: 'Senha atual incorreta.' });
  const { error: erroSenha } = await supabaseAdmin.auth.admin.updateUserById(req.authUser.id, { password: nova });
  if (erroSenha) return res.status(500).json({ ok: false, error: 'Não foi possível atualizar a senha Auth.' });
  const { data: atualizado, error: erroBanco } = await supabaseAdmin.from('usuarios_sistema')
    .update({ senha_provisoria: false, senha_temporaria: false, trocar_senha: false })
    .eq('id', alvo.id).eq('auth_user_id', req.authUser.id).eq('auth_status', 'ATIVO')
    .select('id').maybeSingle();
  if (erroBanco || !atualizado) return res.status(500).json({ ok: false, error: 'Senha Auth alterada, mas a liberação ainda está pendente. Procure o administrador.' });
  return res.json({ ok: true, message: 'Senha pessoal alterada. Faça login novamente.' });
});

// Troca legada: valida a senha atual no servidor, sem abrir UPDATE anônimo.
app.post('/api/auth/trocar-senha-legada', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ ok: false, error: 'Backend seguro indisponível.' });
  const id = Number(req.body?.usuario_id);
  const atual = req.body?.senha_atual;
  const nova = req.body?.nova_senha;
  if (!Number.isSafeInteger(id) || id <= 0 || typeof atual !== 'string' || typeof nova !== 'string' || nova.length < 8 || nova.length > 128 || atual === nova) {
    return res.status(400).json({ ok: false, error: 'Dados de troca de senha inválidos.' });
  }
  if (!permitirTentativaMigracao(req, id)) return res.status(429).json({ ok: false, error: 'Muitas tentativas. Aguarde alguns minutos.' });
  const { data: alvo, error: erroBusca } = await supabaseAdmin.from('usuarios_sistema')
    .select('id,senha,ativo,auth_status,auth_user_id,senha_provisoria,senha_temporaria,trocar_senha')
    .eq('id', id).maybeSingle();
  if (erroBusca || !alvo || alvo.ativo === false || String(alvo.auth_status || 'LEGADO').toUpperCase() !== 'LEGADO' || alvo.auth_user_id) {
    return res.status(403).json({ ok: false, error: 'Conta legada indisponível.' });
  }
  if (String(alvo.senha || '') !== atual) return res.status(401).json({ ok: false, error: 'Senha atual incorreta.' });
  if (!alvo.senha_provisoria && !alvo.senha_temporaria && !alvo.trocar_senha) return res.status(409).json({ ok: false, error: 'Não há troca obrigatória pendente.' });
  const { data: atualizado, error: erroAtualizacao } = await supabaseAdmin.from('usuarios_sistema')
    .update({ senha: nova, senha_provisoria: false, senha_temporaria: false, trocar_senha: false })
    .eq('id', id).eq('senha', atual).is('auth_user_id', null).select('id').maybeSingle();
  if (erroAtualizacao || !atualizado) return res.status(500).json({ ok: false, error: 'Não foi possível concluir a troca legada.' });
  return res.json({ ok: true, message: 'Senha alterada com sucesso.' });
});

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
    .update({ auth_status: 'ATIVO', auth_ativado_em: new Date().toISOString(), senha_provisoria: false, senha_temporaria: false, trocar_senha: false })
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
      return res.status(409).json({ ok: false, error: 'Conta já ativada. Use a troca de senha pessoal.' });
    }

    if (String(alvo.auth_status || '').toUpperCase() !== 'AGUARDANDO_ATIVACAO') {
      return res.status(409).json({ ok: false, error: 'Esta conta não possui uma ativação pendente.' });
    }

    const novaSenha = req.body?.nova_senha;
    if (typeof novaSenha !== 'string' || novaSenha.length < 8 || novaSenha.length > 128) {
      return res.status(400).json({ ok: false, error: 'Informe uma senha válida (8 a 128 caracteres).' });
    }
    const { error: erroSenha } = await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: novaSenha });
    if (erroSenha) return res.status(500).json({ ok: false, error: 'Não foi possível definir a nova senha.' });

    const { data: atualizado, error: erroAtualizacao } = await supabaseAdmin
      .from('usuarios_sistema')
      .update({
        auth_status: 'ATIVO',
        auth_ativado_em: new Date().toISOString(),
        senha_provisoria: false, senha_temporaria: false, trocar_senha: false
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
