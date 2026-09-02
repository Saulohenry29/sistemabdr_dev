-- =========================================================
-- ATLAS / BDR - REMESSAS PATRIMONIAIS
-- Estrutura canônica para transferência em lote entre obras.
-- Executar uma única vez no SQL Editor do Supabase.
-- =========================================================

create table if not exists public.atlas_patrimonio_remessas (
  id bigserial primary key,
  codigo text not null unique,
  empresa_id bigint,
  obra_origem_id bigint not null,
  obra_destino_id bigint not null,
  obra_origem_nome text,
  obra_destino_nome text,
  status text not null default 'EM_TRANSITO',
  status_destino text,
  enviado_por_id bigint,
  enviado_por_nome text,
  enviado_em timestamptz not null default now(),
  recebido_por_id bigint,
  recebido_por_nome text,
  recebido_em timestamptz,
  motorista text,
  veiculo text,
  placa text,
  observacao text,
  total_itens integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_pat_remessa_status_ck check (status in ('EM_TRANSITO','RECEBIDA','RECEBIDA_DIVERGENCIA','CANCELADA')),
  constraint atlas_pat_remessa_obras_ck check (obra_origem_id <> obra_destino_id)
);

create table if not exists public.atlas_patrimonio_remessa_itens (
  id bigserial primary key,
  remessa_id bigint not null references public.atlas_patrimonio_remessas(id) on delete cascade,
  patrimonio_id bigint not null,
  codigo_qr text,
  nome_bem text,
  status_origem text,
  status_recebimento text,
  recebido boolean not null default false,
  localizacao_destino text,
  recebido_por_id bigint,
  recebido_por_nome text,
  recebido_em timestamptz,
  created_at timestamptz not null default now(),
  unique(remessa_id, patrimonio_id)
);

create index if not exists idx_atlas_pat_remessas_status on public.atlas_patrimonio_remessas(status, enviado_em desc);
create index if not exists idx_atlas_pat_remessas_origem on public.atlas_patrimonio_remessas(obra_origem_id, status);
create index if not exists idx_atlas_pat_remessas_destino on public.atlas_patrimonio_remessas(obra_destino_id, status);
create index if not exists idx_atlas_pat_remessa_itens_remessa on public.atlas_patrimonio_remessa_itens(remessa_id);
create index if not exists idx_atlas_pat_remessa_itens_patrimonio on public.atlas_patrimonio_remessa_itens(patrimonio_id, created_at desc);

-- Mantém compatibilidade com o modelo de acesso atual do Atlas.
-- Quando o login migrar para Supabase Auth, estas tabelas devem entrar
-- na revisão global de RLS do projeto, junto com patrimonio/movimentacoes.
alter table public.atlas_patrimonio_remessas disable row level security;
alter table public.atlas_patrimonio_remessa_itens disable row level security;

create or replace function public.atlas_criar_remessa_patrimonial(
  p_codigo text,
  p_empresa_id bigint,
  p_obra_origem_id bigint,
  p_obra_destino_id bigint,
  p_obra_origem_nome text,
  p_obra_destino_nome text,
  p_status_destino text,
  p_enviado_por_id bigint,
  p_enviado_por_nome text,
  p_motorista text,
  p_veiculo text,
  p_placa text,
  p_observacao text,
  p_itens jsonb
) returns bigint
language plpgsql
as $$
declare
  v_remessa_id bigint;
  v_item jsonb;
  v_pat_id bigint;
  v_pat public.patrimonio%rowtype;
begin
  if coalesce(jsonb_array_length(p_itens),0) = 0 then
    raise exception 'A remessa precisa ter pelo menos um patrimônio.';
  end if;

  if p_obra_origem_id = p_obra_destino_id then
    raise exception 'Origem e destino precisam ser diferentes.';
  end if;

  insert into public.atlas_patrimonio_remessas (
    codigo, empresa_id, obra_origem_id, obra_destino_id,
    obra_origem_nome, obra_destino_nome, status, status_destino,
    enviado_por_id, enviado_por_nome, enviado_em,
    motorista, veiculo, placa, observacao, total_itens
  ) values (
    p_codigo, p_empresa_id, p_obra_origem_id, p_obra_destino_id,
    p_obra_origem_nome, p_obra_destino_nome, 'EM_TRANSITO', nullif(p_status_destino,''),
    p_enviado_por_id, p_enviado_por_nome, now(),
    nullif(p_motorista,''), nullif(p_veiculo,''), nullif(p_placa,''), nullif(p_observacao,''),
    jsonb_array_length(p_itens)
  ) returning id into v_remessa_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_pat_id := (v_item->>'patrimonio_id')::bigint;

    select * into v_pat
      from public.patrimonio
     where id = v_pat_id
     for update;

    if not found then
      raise exception 'Patrimônio % não encontrado.', v_pat_id;
    end if;

    if v_pat.ativo is false then
      raise exception 'Patrimônio % está inativo.', coalesce(v_pat.codigo_qr, v_pat_id::text);
    end if;

    if v_pat.obra_id is distinct from p_obra_origem_id then
      raise exception 'Patrimônio % não pertence mais à obra de origem.', coalesce(v_pat.codigo_qr, v_pat_id::text);
    end if;

    if upper(coalesce(v_pat.status,'')) = 'EM_TRANSITO' then
      raise exception 'Patrimônio % já está em trânsito.', coalesce(v_pat.codigo_qr, v_pat_id::text);
    end if;

    insert into public.atlas_patrimonio_remessa_itens (
      remessa_id, patrimonio_id, codigo_qr, nome_bem, status_origem
    ) values (
      v_remessa_id, v_pat.id, v_pat.codigo_qr, v_pat.nome_bem, v_pat.status
    );

    update public.patrimonio
       set status = 'EM_TRANSITO'
     where id = v_pat.id;

    insert into public.movimentacoes (
      patrimonio_id, empresa_id, obra_origem_id, obra_destino_id,
      tipo, status_anterior, status_novo, observacao, usuario, data_movimentacao
    ) values (
      v_pat.id, coalesce(p_empresa_id, v_pat.empresa_id), p_obra_origem_id, p_obra_destino_id,
      'REMESSA_PATRIMONIAL_ENVIO', v_pat.status, 'EM_TRANSITO',
      'Remessa ' || p_codigo || coalesce(' - ' || nullif(p_observacao,''), ''),
      coalesce(nullif(p_enviado_por_nome,''),'Usuário não identificado'),
      (now() at time zone 'America/Cuiaba')
    );
  end loop;

  return v_remessa_id;
end;
$$;

create or replace function public.atlas_receber_remessa_patrimonial(
  p_remessa_id bigint,
  p_recebido_por_id bigint,
  p_recebido_por_nome text,
  p_localizacao_destino text default null
) returns integer
language plpgsql
as $$
declare
  v_rem public.atlas_patrimonio_remessas%rowtype;
  v_item public.atlas_patrimonio_remessa_itens%rowtype;
  v_status_final text;
  v_total integer := 0;
begin
  select * into v_rem
    from public.atlas_patrimonio_remessas
   where id = p_remessa_id
   for update;

  if not found then raise exception 'Remessa não encontrada.'; end if;
  if v_rem.status <> 'EM_TRANSITO' then raise exception 'Esta remessa não está em trânsito.'; end if;

  for v_item in
    select * from public.atlas_patrimonio_remessa_itens
     where remessa_id = p_remessa_id and recebido = false
     for update
  loop
    v_status_final := case
      when upper(coalesce(v_rem.status_destino,'')) in ('ESTOQUE','EM_USO') then upper(v_rem.status_destino)
      when upper(coalesce(v_item.status_origem,'')) = 'EM_TRANSITO' then 'EM_USO'
      else coalesce(v_item.status_origem,'EM_USO')
    end;

    update public.patrimonio
       set obra_id = v_rem.obra_destino_id,
           empresa_id = coalesce(v_rem.empresa_id, empresa_id),
           localizacao = coalesce(v_rem.obra_destino_nome, localizacao),
           status = v_status_final,
           endereco_estoque = coalesce(nullif(p_localizacao_destino,''), endereco_estoque)
     where id = v_item.patrimonio_id;

    update public.atlas_patrimonio_remessa_itens
       set recebido = true,
           status_recebimento = v_status_final,
           localizacao_destino = nullif(p_localizacao_destino,''),
           recebido_por_id = p_recebido_por_id,
           recebido_por_nome = p_recebido_por_nome,
           recebido_em = now()
     where id = v_item.id;

    insert into public.movimentacoes (
      patrimonio_id, empresa_id, obra_origem_id, obra_destino_id,
      tipo, status_anterior, status_novo, observacao, usuario, data_movimentacao
    ) values (
      v_item.patrimonio_id, v_rem.empresa_id, v_rem.obra_origem_id, v_rem.obra_destino_id,
      'REMESSA_PATRIMONIAL_RECEBIMENTO', 'EM_TRANSITO', v_status_final,
      'Remessa ' || v_rem.codigo || coalesce(' - Localização: ' || nullif(p_localizacao_destino,''), ''),
      coalesce(nullif(p_recebido_por_nome,''),'Usuário não identificado'),
      (now() at time zone 'America/Cuiaba')
    );

    v_total := v_total + 1;
  end loop;

  update public.atlas_patrimonio_remessas
     set status = 'RECEBIDA',
         recebido_por_id = p_recebido_por_id,
         recebido_por_nome = p_recebido_por_nome,
         recebido_em = now(),
         updated_at = now()
   where id = p_remessa_id;

  return v_total;
end;
$$;
