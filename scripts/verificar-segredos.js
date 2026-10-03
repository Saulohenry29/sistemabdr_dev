'use strict';

const { execFileSync } = require('child_process');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
  .split(/\r?\n/)
  .filter(Boolean);

const nomesBloqueados = /(^|\/)(senha|segredos|secrets|credentials|credenciais)(\/|$)|(^|\/)\.env($|\.)|\.(pem|key|p12|pfx)$/i;
const padroes = [
  { nome: 'Supabase secret key', re: /sb_secret_[A-Za-z0-9_-]{20,}/g },
  { nome: 'Supabase service_role JWT', re: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g },
  { nome: 'Private key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { nome: 'AWS access key', re: /AKIA[0-9A-Z]{16}/g }
];

const problemas = [];
for (const arquivo of staged) {
  if (nomesBloqueados.test(arquivo)) {
    problemas.push(`${arquivo}: caminho/arquivo sensível não pode ser versionado`);
    continue;
  }

  let conteudo = '';
  try { conteudo = git(['show', `:${arquivo}`]); } catch { continue; }
  for (const padrao of padroes) {
    padrao.re.lastIndex = 0;
    if (padrao.re.test(conteudo)) problemas.push(`${arquivo}: possível ${padrao.nome}`);
  }
}

if (problemas.length) {
  console.error('\nBLOQUEADO: possível segredo detectado antes do commit.\n');
  for (const problema of problemas) console.error(` - ${problema}`);
  console.error('\nRemova o segredo do arquivo e tente novamente.\n');
  process.exit(1);
}

console.log('Verificação de segredos: OK');
