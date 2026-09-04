-- TVI BOX — o bónus de boas-vindas só é registado quando a carteira foi de facto criada
-- (duas chamadas concorrentes no primeiro carregamento duplicavam a linha do extrato).

CREATE OR REPLACE FUNCTION public.tvibox_ensure_wallet()
RETURNS tvibox_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_wallet tvibox_wallets;
  v_inserted INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_wallet FROM tvibox_wallets WHERE user_id = v_uid;
  IF FOUND THEN
    RETURN v_wallet;
  END IF;

  INSERT INTO tvibox_wallets (user_id, coins)
  VALUES (v_uid, 60)
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    INSERT INTO tvibox_transactions (user_id, delta, reason, metadata)
    VALUES (v_uid, 60, 'welcome', '{"label":"Bónus de boas-vindas"}');
  END IF;

  SELECT * INTO v_wallet FROM tvibox_wallets WHERE user_id = v_uid;
  RETURN v_wallet;
END;
$$;

-- Limpa duplicados já existentes (mantém a linha mais antiga por utilizador).
DELETE FROM tvibox_transactions t
USING tvibox_transactions d
WHERE t.reason = 'welcome'
  AND d.reason = 'welcome'
  AND t.user_id = d.user_id
  AND t.created_at > d.created_at;
