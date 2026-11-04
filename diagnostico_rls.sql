-- ATLAS SENTINELA | DIAGNÓSTICO SOMENTE LEITURA
-- Consulta metadados; NÃO altera tabelas, permissões ou políticas.
-- Exportar resultado no Supabase SQL Editor como CSV e importar em sentinela.html.
WITH tabelas AS (
  SELECT c.oid, n.nspname AS esquema, c.relname AS tabela, c.relrowsecurity AS rls_ativo
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
), regras AS (
  SELECT t.esquema,t.tabela,t.rls_ativo,p.policyname,p.cmd,
         array_to_string(p.roles, ',') AS papeis,
         coalesce(p.qual,'') AS condicao,
         coalesce(p.with_check,'') AS verificacao,
         has_table_privilege('anon',t.oid,'SELECT') AS anon_select,
         has_table_privilege('anon',t.oid,'INSERT') AS anon_insert,
         has_table_privilege('anon',t.oid,'UPDATE') AS anon_update,
         has_table_privilege('anon',t.oid,'DELETE') AS anon_delete
  FROM tabelas t LEFT JOIN pg_policies p ON p.schemaname=t.esquema AND p.tablename=t.tabela
)
SELECT esquema,tabela,rls_ativo,coalesce(policyname,'') AS politica,
       coalesce(cmd,'') AS operacao,coalesce(papeis,'') AS papeis,
       condicao,verificacao,anon_select,anon_insert,anon_update,anon_delete
FROM regras ORDER BY tabela,politica;
