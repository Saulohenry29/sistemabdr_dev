-- ATLAS / BDR — MIGRAÇÃO PROPOSTA PARA HOMOLOGAÇÃO, NÃO EXECUTADA.
-- ⚠️ RISCO: cria estruturas e funções SECURITY DEFINER / RPC para assinaturas.
-- Executar SOMENTE após revisão de RLS, backup e aprovação expressa no Supabase DEV.
-- Não aplicar em produção sem testes de usuários com e sem acesso e tokens inválidos.
-- A autenticação segura Supabase Auth é obrigatória para assinatura do funcionário.
-- A assinatura visual não é, por si, assinatura eletrônica qualificada.

BEGIN;

CREATE TABLE IF NOT EXISTS public.atlas_romaneio_assinaturas (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 documento_tipo text NOT NULL CHECK (documento_tipo IN ('RP','PED')),
 documento_id bigint NOT NULL CHECK (documento_id > 0),
 papel text NOT NULL CHECK (papel IN ('SAIDA','MOTORISTA')),
 usuario_id bigint,
 nome text NOT NULL CHECK (length(nome) BETWEEN 2 AND 160),
 assinatura_png text NOT NULL,
 documento_hash text NOT NULL,
 assinado_em timestamptz NOT NULL DEFAULT now(),
 metodo text NOT NULL CHECK (metodo IN ('AUTH_ATLAS','TOKEN_UNICO')),
 UNIQUE (documento_tipo,documento_id,papel,documento_hash)
);
CREATE TABLE IF NOT EXISTS public.atlas_romaneio_links_motorista (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 documento_tipo text NOT NULL CHECK (documento_tipo IN ('RP','PED')),
 documento_id bigint NOT NULL CHECK (documento_id > 0),
 token_hash text UNIQUE NOT NULL,
 documento_hash text NOT NULL,
 criado_por bigint NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now(),
 expira_em timestamptz NOT NULL DEFAULT (now()+interval '12 hours'),
 usado_em timestamptz
);
CREATE TABLE IF NOT EXISTS public.atlas_romaneio_assinaturas_perfil (
 usuario_id bigint PRIMARY KEY REFERENCES public.usuarios_sistema(id),
 assinatura_png text NOT NULL,
 atualizada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_atlas_romaneio_links_doc ON public.atlas_romaneio_links_motorista(documento_tipo,documento_id);

ALTER TABLE public.atlas_romaneio_assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_romaneio_links_motorista ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_romaneio_assinaturas_perfil ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atlas_romaneio_assinaturas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.atlas_romaneio_links_motorista FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.atlas_romaneio_assinaturas_perfil FROM PUBLIC, anon, authenticated;

-- Normalização limitada do tipo de documento; nenhum acesso direto do cliente.
CREATE OR REPLACE FUNCTION public.atlas_romaneio_documento_hash(p_tipo text, p_id bigint)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_cab jsonb; v_itens jsonb; v_result text;
BEGIN
  IF p_tipo = 'RP' THEN
    SELECT jsonb_build_object('id',r.id,'orig',r.obra_origem_id,'dest',r.obra_destino_id,'codigo',r.codigo,'motorista',r.motorista,'veiculo',r.veiculo,'placa',r.placa)
      INTO v_cab FROM public.atlas_patrimonio_remessas r WHERE r.id=p_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'pat',i.patrimonio_id,'codigo',i.codigo_qr,'descricao',coalesce(i.nome_bem,p.nome_bem),'serie',p.numero_serie,'valor',p.valor_bem,'ncm',p.ncm,'nf',p.numero_nfe) ORDER BY i.id),'[]'::jsonb)
      INTO v_itens FROM public.atlas_patrimonio_remessa_itens i LEFT JOIN public.patrimonio p ON p.id=i.patrimonio_id WHERE i.remessa_id=p_id;
  ELSIF p_tipo = 'PED' THEN
    SELECT jsonb_build_object('id',p.id,'orig',p.obra_origem_id,'dest',coalesce(p.obra_destino_id,p.obra_id),'codigo',p.codigo,'motorista',p.motorista_nome,'placa',p.veiculo_placa,'transportadora',p.transportadora)
      INTO v_cab FROM public.pedidos_retirada p WHERE p.id=p_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'pat',i.patrimonio_id,'produto',i.produto_id,'qtd',coalesce(i.quantidade_separada,i.quantidade)) ORDER BY i.id),'[]'::jsonb)
      INTO v_itens FROM public.itens_retirada i WHERE i.pedido_id=p_id;
  ELSE
    RAISE EXCEPTION 'Tipo de documento inválido.';
  END IF;
  IF v_cab IS NULL THEN RAISE EXCEPTION 'Documento não encontrado.'; END IF;
  v_result := md5(v_cab::text||'|'||v_itens::text);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.atlas_romaneio_documento_hash(text,bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.atlas_romaneio_autorizar_funcionario(p_tipo text,p_id bigint)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid bigint; v_owner boolean; v_orig bigint;v_dest bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'É necessário acesso seguro do Supabase Auth.'; END IF;
  SELECT u.id,coalesce(u.owner_sistema,false) INTO v_uid,v_owner
   FROM public.usuarios_sistema u WHERE u.auth_user_id=auth.uid() AND u.ativo IS TRUE LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Usuário autenticado não vinculado a cadastro ativo.'; END IF;
  IF p_tipo='RP' THEN
    SELECT obra_origem_id,obra_destino_id INTO v_orig,v_dest FROM public.atlas_patrimonio_remessas WHERE id=p_id;
  ELSIF p_tipo='PED' THEN
    SELECT obra_origem_id,coalesce(obra_destino_id,obra_id) INTO v_orig,v_dest FROM public.pedidos_retirada WHERE id=p_id;
  ELSE
    RAISE EXCEPTION 'Tipo inválido.';
  END IF;
  IF v_orig IS NULL AND v_dest IS NULL THEN RAISE EXCEPTION 'Documento sem escopo de obra válido.'; END IF;
  IF v_owner IS TRUE THEN RETURN v_uid; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuario_obras uo
                WHERE uo.usuario_id=v_uid AND (uo.obra_id=v_orig OR uo.obra_id=v_dest)) THEN
    RAISE EXCEPTION 'Usuário sem acesso às obras deste romaneio.';
  END IF;
  RETURN v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.atlas_romaneio_autorizar_funcionario(text,bigint) FROM PUBLIC,anon,authenticated;

-- Assinar a saída e criar link são ações de ORIGEM; consultar/imprimir exige apenas origem OU destino.
CREATE OR REPLACE FUNCTION public.atlas_romaneio_autorizar_saida(p_tipo text,p_id bigint)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid bigint;v_orig bigint;v_owner boolean;
BEGIN
  v_uid:=public.atlas_romaneio_autorizar_funcionario(p_tipo,p_id);
  SELECT coalesce(owner_sistema,false) INTO v_owner FROM public.usuarios_sistema WHERE id=v_uid;
  IF v_owner THEN RETURN v_uid; END IF;
  IF p_tipo='RP' THEN
    SELECT obra_origem_id INTO v_orig FROM public.atlas_patrimonio_remessas WHERE id=p_id;
  ELSE
    SELECT obra_origem_id INTO v_orig FROM public.pedidos_retirada WHERE id=p_id;
  END IF;
  IF v_orig IS NULL OR NOT EXISTS(SELECT 1 FROM public.usuario_obras WHERE usuario_id=v_uid AND obra_id=v_orig) THEN
    RAISE EXCEPTION 'A assinatura de saída é permitida somente a responsável autorizado da obra de origem.';
  END IF;
  RETURN v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.atlas_romaneio_autorizar_saida(text,bigint) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.atlas_romaneio_assinatura_pessoal()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid bigint;
BEGIN
  SELECT id INTO v_uid FROM public.usuarios_sistema WHERE auth_user_id=auth.uid() AND ativo IS TRUE LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão segura necessária.'; END IF;
  RETURN (SELECT assinatura_png FROM public.atlas_romaneio_assinaturas_perfil WHERE usuario_id=v_uid);
END;
$$;
REVOKE ALL ON FUNCTION public.atlas_romaneio_assinatura_pessoal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atlas_romaneio_assinatura_pessoal() TO authenticated;

CREATE OR REPLACE FUNCTION public.atlas_romaneio_assinaturas_listar(p_tipo text,p_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_json jsonb;v_hash text;
BEGIN
  PERFORM public.atlas_romaneio_autorizar_funcionario(p_tipo,p_id);
  v_hash:=public.atlas_romaneio_documento_hash(p_tipo,p_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'papel',a.papel,'nome',a.nome,'assinatura_png',CASE WHEN a.documento_hash=v_hash THEN a.assinatura_png ELSE NULL END,
    'assinado_em',a.assinado_em,'valida',a.documento_hash=v_hash
  ) ORDER BY a.id),'[]'::jsonb) INTO v_json
  FROM public.atlas_romaneio_assinaturas a WHERE a.documento_tipo=p_tipo AND a.documento_id=p_id;
  RETURN v_json;
END;
$$;
REVOKE ALL ON FUNCTION public.atlas_romaneio_assinaturas_listar(text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atlas_romaneio_assinaturas_listar(text,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.atlas_romaneio_assinar_saida(p_tipo text,p_id bigint,p_png text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid bigint;v_nome text;v_hash text;v_png text;v_status text;
BEGIN
  v_uid:=public.atlas_romaneio_autorizar_saida(p_tipo,p_id);
  IF p_tipo='RP' THEN SELECT status INTO v_status FROM public.atlas_patrimonio_remessas WHERE id=p_id;
  ELSE SELECT status INTO v_status FROM public.pedidos_retirada WHERE id=p_id; END IF;
  IF upper(coalesce(v_status,'')) IN ('RECEBIDO','CANCELADO','RECUSADO') THEN RAISE EXCEPTION 'Operação encerrada: assinatura não permitida.'; END IF;
  SELECT nome INTO v_nome FROM public.usuarios_sistema WHERE id=v_uid;
  v_png:=coalesce(nullif(p_png,''),(SELECT assinatura_png FROM public.atlas_romaneio_assinaturas_perfil WHERE usuario_id=v_uid));
  IF v_png IS NULL OR length(v_png)>180000 OR v_png !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' THEN
    RAISE EXCEPTION 'Assinatura PNG inválida ou muito grande.';
  END IF;
  v_hash:=public.atlas_romaneio_documento_hash(p_tipo,p_id);
  IF EXISTS (SELECT 1 FROM public.atlas_romaneio_assinaturas WHERE documento_tipo=p_tipo AND documento_id=p_id AND papel='SAIDA' AND documento_hash=v_hash) THEN
    RAISE EXCEPTION 'Esta saída já está assinada.';
  END IF;
  -- Mudança no conteúdo invalida logicamente assinaturas antigas; novo registro substitui versão vencida.
  INSERT INTO public.atlas_romaneio_assinaturas(documento_tipo,documento_id,papel,usuario_id,nome,assinatura_png,documento_hash,metodo)
    VALUES(p_tipo,p_id,'SAIDA',v_uid,v_nome,v_png,v_hash,'AUTH_ATLAS')
  ON CONFLICT(documento_tipo,documento_id,papel,documento_hash) DO NOTHING;
  IF p_png IS NOT NULL THEN
    INSERT INTO public.atlas_romaneio_assinaturas_perfil(usuario_id,assinatura_png)
      VALUES(v_uid,v_png) ON CONFLICT(usuario_id) DO UPDATE SET assinatura_png=excluded.assinatura_png,atualizada_em=now();
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.atlas_romaneio_assinar_saida(text,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atlas_romaneio_assinar_saida(text,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.atlas_romaneio_criar_link_motorista(p_tipo text,p_id bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid bigint; v_token text;v_status text;
BEGIN
  v_uid:=public.atlas_romaneio_autorizar_saida(p_tipo,p_id);
  IF p_tipo='RP' THEN SELECT status INTO v_status FROM public.atlas_patrimonio_remessas WHERE id=p_id;
  ELSE SELECT status INTO v_status FROM public.pedidos_retirada WHERE id=p_id; END IF;
  IF upper(coalesce(v_status,'')) IN ('RECEBIDO','CANCELADO','RECUSADO') THEN RAISE EXCEPTION 'Operação encerrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.atlas_romaneio_assinaturas a
     WHERE a.documento_tipo=p_tipo AND a.documento_id=p_id AND a.papel='MOTORISTA'
      AND a.documento_hash=public.atlas_romaneio_documento_hash(p_tipo,p_id)) THEN
    RAISE EXCEPTION 'O motorista já confirmou esta retirada.';
  END IF;
  v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  -- Anula links antigos não utilizados, impedindo múltiplos links ativos.
  UPDATE public.atlas_romaneio_links_motorista SET usado_em=now()
    WHERE documento_tipo=p_tipo AND documento_id=p_id AND usado_em IS NULL;
  INSERT INTO public.atlas_romaneio_links_motorista(documento_tipo,documento_id,token_hash,documento_hash,criado_por)
    VALUES(p_tipo,p_id,md5(v_token),public.atlas_romaneio_documento_hash(p_tipo,p_id),v_uid);
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.atlas_romaneio_criar_link_motorista(text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atlas_romaneio_criar_link_motorista(text,bigint) TO authenticated;

-- O link público nunca consulta as tabelas diretamente: somente resumo escopado pelo token.
CREATE OR REPLACE FUNCTION public.atlas_romaneio_link_consultar(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_link record;v_num text;v_orig text;v_dest text;v_items jsonb;v_current text;
BEGIN
  IF length(coalesce(p_token,''))<>64 OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_link FROM public.atlas_romaneio_links_motorista
   WHERE token_hash=md5(p_token) AND usado_em IS NULL AND expira_em>now();
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_current:=public.atlas_romaneio_documento_hash(v_link.documento_tipo,v_link.documento_id);
  IF v_current<>v_link.documento_hash THEN RETURN NULL; END IF;
  IF v_link.documento_tipo='RP' THEN
    SELECT coalesce(r.codigo,'RP-'||r.id),coalesce(r.obra_origem_nome,'Origem'),coalesce(r.obra_destino_nome,'Destino')
      INTO v_num,v_orig,v_dest FROM public.atlas_patrimonio_remessas r WHERE r.id=v_link.documento_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('codigo',coalesce(i.codigo_qr,p.codigo_qr),'descricao',coalesce(i.nome_bem,p.nome_bem,'Patrimônio'),'qtd',1) ORDER BY i.id),'[]'::jsonb)
      INTO v_items FROM public.atlas_patrimonio_remessa_itens i LEFT JOIN public.patrimonio p ON p.id=i.patrimonio_id WHERE i.remessa_id=v_link.documento_id;
  ELSE
    SELECT coalesce(p.codigo,'PED-'||p.id),coalesce(o1.nome,'Origem'),coalesce(o2.nome,'Destino')
      INTO v_num,v_orig,v_dest FROM public.pedidos_retirada p
      LEFT JOIN public.obras o1 ON o1.id=p.obra_origem_id LEFT JOIN public.obras o2 ON o2.id=coalesce(p.obra_destino_id,p.obra_id)
      WHERE p.id=v_link.documento_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('codigo',coalesce(i.patrimonio_codigo,i.produto_id::text,i.patrimonio_id::text),'descricao',coalesce(i.patrimonio_nome,'Material'),'qtd',coalesce(i.quantidade_separada,i.quantidade,1)) ORDER BY i.id),'[]'::jsonb)
      INTO v_items FROM public.itens_retirada i WHERE i.pedido_id=v_link.documento_id;
  END IF;
  RETURN jsonb_build_object('numero',v_num,'origem',v_orig,'destino',v_dest,'itens',v_items,'expira_em',v_link.expira_em);
END;
$$;
REVOKE ALL ON FUNCTION public.atlas_romaneio_link_consultar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atlas_romaneio_link_consultar(text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.atlas_romaneio_assinar_motorista(p_token text,p_nome text,p_png text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_link record;v_status text;
BEGIN
  IF length(coalesce(p_token,''))<>64 OR p_token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Link inválido.'; END IF;
  SELECT * INTO v_link FROM public.atlas_romaneio_links_motorista
    WHERE token_hash=md5(p_token) AND usado_em IS NULL AND expira_em>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link expirado ou já utilizado.'; END IF;
  IF length(trim(coalesce(p_nome,''))) NOT BETWEEN 4 AND 120 THEN RAISE EXCEPTION 'Informe o nome completo do motorista.'; END IF;
  IF p_png IS NULL OR length(p_png)>180000 OR p_png !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' THEN
    RAISE EXCEPTION 'Assinatura PNG inválida.';
  END IF;
  IF public.atlas_romaneio_documento_hash(v_link.documento_tipo,v_link.documento_id)<>v_link.documento_hash THEN
    RAISE EXCEPTION 'Os bens da transferência foram alterados. Solicite novo link.';
  END IF;
  IF v_link.documento_tipo='RP' THEN SELECT status INTO v_status FROM public.atlas_patrimonio_remessas WHERE id=v_link.documento_id;
  ELSE SELECT status INTO v_status FROM public.pedidos_retirada WHERE id=v_link.documento_id; END IF;
  IF upper(coalesce(v_status,'')) IN ('RECEBIDO','CANCELADO','RECUSADO') THEN RAISE EXCEPTION 'Operação encerrada.'; END IF;
  IF EXISTS(SELECT 1 FROM public.atlas_romaneio_assinaturas WHERE documento_tipo=v_link.documento_tipo AND documento_id=v_link.documento_id AND papel='MOTORISTA' AND documento_hash=v_link.documento_hash) THEN
    RAISE EXCEPTION 'Motorista já assinou.';
  END IF;
  INSERT INTO public.atlas_romaneio_assinaturas(documento_tipo,documento_id,papel,usuario_id,nome,assinatura_png,documento_hash,metodo)
  VALUES(v_link.documento_tipo,v_link.documento_id,'MOTORISTA',NULL,trim(p_nome),p_png,v_link.documento_hash,'TOKEN_UNICO')
  ON CONFLICT(documento_tipo,documento_id,papel,documento_hash) DO NOTHING;
  UPDATE public.atlas_romaneio_links_motorista SET usado_em=now() WHERE id=v_link.id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.atlas_romaneio_assinar_motorista(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atlas_romaneio_assinar_motorista(text,text,text) TO anon,authenticated;

COMMIT;
