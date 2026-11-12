-- ATLAS / BDR — ASSINATURA PRESENCIAL NO MESMO APARELHO
-- Atualização incremental para o banco existente.
-- Não recria tabelas e não libera funções públicas ao anon.
-- ATENÇÃO: Supabase compartilhado DEV/PRODUÇÃO. Fazer backup e revisão antes de executar.
-- Esta implantação NÃO corrige a RLS desabilitada das tabelas RP.

BEGIN;

DO $verificacao$
BEGIN
  IF to_regclass('public.atlas_romaneio_assinaturas') IS NULL
     OR to_regclass('public.atlas_romaneio_links_motorista') IS NULL
     OR to_regclass('public.usuarios_sistema') IS NULL
     OR to_regprocedure('public.atlas_romaneio_autorizar_funcionario(text,bigint)') IS NULL
     OR to_regprocedure('public.atlas_romaneio_autorizar_saida(text,bigint)') IS NULL
     OR to_regprocedure('public.atlas_romaneio_validar_operacao(text,bigint)') IS NULL
     OR to_regprocedure('public.atlas_romaneio_documento_hash(text,bigint)') IS NULL
     OR to_regprocedure('public.atlas_romaneio_assinaturas_listar(text,bigint)') IS NULL THEN
    RAISE EXCEPTION 'Atlas: dependências ausentes. Não instalar esta atualização.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relname='atlas_romaneio_assinaturas'
      AND c.relrowsecurity IS TRUE
  ) THEN
    RAISE EXCEPTION 'Atlas: RLS de assinaturas não está ativa.';
  END IF;
END;
$verificacao$;

ALTER TABLE public.atlas_romaneio_assinaturas
  ADD COLUMN IF NOT EXISTS registrado_por_id bigint
  REFERENCES public.usuarios_sistema(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.atlas_romaneio_assinaturas_listar(p_tipo text, p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $func$
DECLARE
  v_hash text;
  v_res jsonb;
BEGIN
  PERFORM public.atlas_romaneio_autorizar_funcionario(p_tipo, p_id);
  v_hash := public.atlas_romaneio_documento_hash(p_tipo, p_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'papel', a.papel,
    'nome', a.nome,
    'metodo', a.metodo,
    'registrado_por_nome', u.nome,
    'assinatura_png', CASE WHEN a.documento_hash = v_hash THEN a.assinatura_png ELSE NULL END,
    'assinado_em', a.assinado_em,
    'valida', a.documento_hash = v_hash
  ) ORDER BY a.id), '[]'::jsonb)
  INTO v_res
  FROM public.atlas_romaneio_assinaturas a
  LEFT JOIN public.usuarios_sistema u ON u.id = a.registrado_por_id
  WHERE a.documento_tipo = p_tipo AND a.documento_id = p_id;
  RETURN v_res;
END;
$func$;
REVOKE ALL ON FUNCTION public.atlas_romaneio_assinaturas_listar(text,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_romaneio_assinaturas_listar(text,bigint)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.atlas_romaneio_assinar_motorista_presencial(
  p_tipo text,
  p_id bigint,
  p_nome text,
  p_png text,
  p_aceite boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $func$
DECLARE
  v_operador bigint;
  v_hash text;
  v_rows bigint;
  v_nome text;
BEGIN
  v_operador := public.atlas_romaneio_autorizar_saida(p_tipo,p_id);
  IF p_aceite IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'A confirmação presencial do motorista é obrigatória.';
  END IF;
  v_nome := regexp_replace(btrim(coalesce(p_nome,'')), '\s+', ' ', 'g');
  IF length(v_nome) NOT BETWEEN 4 AND 120 THEN
    RAISE EXCEPTION 'Informe o nome completo do motorista.';
  END IF;
  IF p_png IS NULL OR length(p_png) > 180000
      OR p_png !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' THEN
    RAISE EXCEPTION 'Assinatura PNG inválida ou muito grande.';
  END IF;

  IF p_tipo = 'RP' THEN
    PERFORM 1 FROM public.atlas_patrimonio_remessas WHERE id=p_id FOR UPDATE;
  ELSIF p_tipo = 'PED' THEN
    PERFORM 1 FROM public.pedidos_retirada WHERE id=p_id FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'Tipo de romaneio inválido.';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento não encontrado.'; END IF;

  PERFORM public.atlas_romaneio_validar_operacao(p_tipo,p_id);
  v_hash := public.atlas_romaneio_documento_hash(p_tipo,p_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.atlas_romaneio_assinaturas a
    WHERE a.documento_tipo=p_tipo AND a.documento_id=p_id
      AND a.papel='SAIDA' AND a.documento_hash=v_hash
  ) THEN
    RAISE EXCEPTION 'O responsável pela saída precisa assinar primeiro.';
  END IF;
  INSERT INTO public.atlas_romaneio_assinaturas
    (documento_tipo,documento_id,papel,usuario_id,registrado_por_id,
     nome,assinatura_png,documento_hash,metodo)
  VALUES (p_tipo,p_id,'MOTORISTA',NULL,v_operador,
          v_nome,p_png,v_hash,'AUTH_ATLAS')
  ON CONFLICT (documento_tipo,documento_id,papel,documento_hash) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'O motorista já assinou esta versão do documento.';
  END IF;
  UPDATE public.atlas_romaneio_links_motorista
     SET usado_em=now()
   WHERE documento_tipo=p_tipo AND documento_id=p_id AND usado_em IS NULL;
  RETURN true;
END;
$func$;
REVOKE ALL ON FUNCTION public.atlas_romaneio_assinar_motorista_presencial(text,bigint,text,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_romaneio_assinar_motorista_presencial(text,bigint,text,text,boolean)
  TO authenticated;

-- RP em preparação pode coletar assinaturas, mas assinatura não despacha.
-- PED preserva a exigência de NF-e.
CREATE OR REPLACE FUNCTION public.atlas_romaneio_validar_operacao(p_tipo text, p_id bigint)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $func$
DECLARE
  v_status text;
  v_exige_nfe boolean;
  v_fiscal text;
BEGIN
  IF p_tipo = 'RP' THEN
    SELECT upper(coalesce(r.status,'')) INTO v_status
      FROM public.atlas_patrimonio_remessas r WHERE r.id = p_id;
    IF NOT FOUND OR v_status NOT IN ('AGUARDANDO_EXPEDICAO','EM_TRANSITO') THEN
      RAISE EXCEPTION 'RP fora da preparação/expedição: não é possível coletar assinatura neste status.';
    END IF;
  ELSIF p_tipo = 'PED' THEN
    SELECT upper(coalesce(p.status,'')),p.exige_nfe,upper(coalesce(p.status_fiscal,''))
      INTO v_status,v_exige_nfe,v_fiscal
      FROM public.pedidos_retirada p WHERE p.id = p_id;
    IF NOT FOUND OR v_status NOT IN ('AGUARDANDO_RETIRADA','EM_TRANSITO') THEN
      RAISE EXCEPTION 'PED não está liberado para retirada: assinatura não permitida.';
    END IF;
    IF v_exige_nfe IS TRUE AND v_fiscal <> 'NFE_EMITIDA' THEN
      RAISE EXCEPTION 'Retirada bloqueada: este pedido exige NF-e não registrada.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de romaneio inválido.';
  END IF;
  RETURN true;
END;
$func$;
REVOKE ALL ON FUNCTION public.atlas_romaneio_validar_operacao(text,bigint)
  FROM PUBLIC, anon, authenticated;

COMMIT;
