-- TVI BOX — zona vertical (modelo DramaBox) construída sobre a base de utilizadores GMC.
-- Catálogo (séries/episódios), economia de moedas, progresso e interações sociais.

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tvibox_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  genre TEXT NOT NULL,
  tagline TEXT,
  synopsis TEXT,
  badge TEXT CHECK (badge IN ('hot', 'new')),
  palette JSONB NOT NULL DEFAULT '{"from":"#2a1418","to":"#100a0c"}',
  poster_url TEXT,
  cast_notes JSONB NOT NULL DEFAULT '[]',
  total_episodes INT NOT NULL DEFAULT 40,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tvibox_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES tvibox_series(id) ON DELETE CASCADE,
  number INT NOT NULL CHECK (number > 0),
  title TEXT NOT NULL,
  synopsis TEXT,
  hook_title TEXT,
  hook_text TEXT,
  is_free BOOLEAN NOT NULL DEFAULT false,
  coin_cost INT NOT NULL DEFAULT 15 CHECK (coin_cost >= 0),
  duration_seconds INT,
  video_url TEXT,
  poster_url TEXT,
  subtitles_url TEXT,
  render_kind TEXT NOT NULL DEFAULT 'none' CHECK (render_kind IN ('none', 'animatic', 'final')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'coming_soon')),
  screenplay JSONB,
  stats_seed JSONB NOT NULL DEFAULT '{"likes":0,"comments":0}',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (series_id, number)
);

CREATE INDEX IF NOT EXISTS tvibox_episodes_series_idx ON tvibox_episodes (series_id, number);

-- ---------------------------------------------------------------------------
-- Economia e estado do utilizador (1-1 com profiles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tvibox_wallets (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  coins INT NOT NULL DEFAULT 0 CHECK (coins >= 0),
  streak INT NOT NULL DEFAULT 0,
  last_checkin DATE,
  plus_until TIMESTAMPTZ,
  ads_today INT NOT NULL DEFAULT 0,
  ads_day DATE,
  settings JSONB NOT NULL DEFAULT '{"subtitles":true,"parental":false}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tvibox_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  delta INT NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tvibox_transactions_user_idx ON tvibox_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tvibox_unlocks (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES tvibox_episodes(id) ON DELETE CASCADE,
  cost INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, episode_id)
);

CREATE TABLE IF NOT EXISTS tvibox_progress (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES tvibox_episodes(id) ON DELETE CASCADE,
  position_seconds NUMERIC(8, 2) NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, episode_id)
);

CREATE TABLE IF NOT EXISTS tvibox_likes (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES tvibox_episodes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, episode_id)
);

CREATE TABLE IF NOT EXISTS tvibox_list (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  series_id UUID NOT NULL REFERENCES tvibox_series(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, series_id)
);

CREATE TABLE IF NOT EXISTS tvibox_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES tvibox_episodes(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tvibox_comments_episode_idx ON tvibox_comments (episode_id, created_at DESC);

-- Estado da produção de vídeo (pipeline Veo) — resumível
CREATE TABLE IF NOT EXISTS tvibox_render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES tvibox_episodes(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'veo',
  mode TEXT NOT NULL DEFAULT 'extend',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  step INT NOT NULL DEFAULT 0,
  state JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at
CREATE TRIGGER tvibox_series_updated_at BEFORE UPDATE ON tvibox_series
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tvibox_episodes_updated_at BEFORE UPDATE ON tvibox_episodes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tvibox_wallets_updated_at BEFORE UPDATE ON tvibox_wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tvibox_progress_updated_at BEFORE UPDATE ON tvibox_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tvibox_render_jobs_updated_at BEFORE UPDATE ON tvibox_render_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Funções (SECURITY DEFINER, sempre sobre auth.uid()) — operações atómicas
-- ---------------------------------------------------------------------------

-- Cria a carteira na primeira visita com bónus de boas-vindas.
CREATE OR REPLACE FUNCTION public.tvibox_ensure_wallet()
RETURNS tvibox_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_wallet tvibox_wallets;
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

  INSERT INTO tvibox_transactions (user_id, delta, reason, metadata)
  VALUES (v_uid, 60, 'welcome', '{"label":"Bónus de boas-vindas"}');

  SELECT * INTO v_wallet FROM tvibox_wallets WHERE user_id = v_uid;
  RETURN v_wallet;
END;
$$;

CREATE OR REPLACE FUNCTION public.tvibox_plus_active(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT plus_until > now() FROM tvibox_wallets WHERE user_id = p_user), false);
$$;

-- Desbloqueia um episódio: debita moedas (0 com TVI Box+), regista transação e unlock.
CREATE OR REPLACE FUNCTION public.tvibox_unlock_episode(p_episode_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_wallet tvibox_wallets;
  v_ep tvibox_episodes;
  v_cost INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM tvibox_ensure_wallet();

  SELECT * INTO v_ep FROM tvibox_episodes WHERE id = p_episode_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM tvibox_unlocks WHERE user_id = v_uid AND episode_id = p_episode_id) THEN
    SELECT * INTO v_wallet FROM tvibox_wallets WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', true, 'already', true, 'coins', v_wallet.coins, 'cost', 0);
  END IF;

  SELECT * INTO v_wallet FROM tvibox_wallets WHERE user_id = v_uid FOR UPDATE;

  v_cost := CASE
    WHEN v_ep.is_free THEN 0
    WHEN v_wallet.plus_until IS NOT NULL AND v_wallet.plus_until > now() THEN 0
    ELSE v_ep.coin_cost
  END;

  IF v_wallet.coins < v_cost THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient', 'coins', v_wallet.coins, 'cost', v_cost);
  END IF;

  UPDATE tvibox_wallets SET coins = coins - v_cost WHERE user_id = v_uid;
  INSERT INTO tvibox_unlocks (user_id, episode_id, cost) VALUES (v_uid, p_episode_id, v_cost);
  IF v_cost > 0 THEN
    INSERT INTO tvibox_transactions (user_id, delta, reason, metadata)
    VALUES (v_uid, -v_cost, 'unlock', jsonb_build_object('episode_id', p_episode_id, 'label', 'Desbloqueio EP ' || v_ep.number));
  END IF;

  RETURN jsonb_build_object('ok', true, 'coins', v_wallet.coins - v_cost, 'cost', v_cost);
END;
$$;

-- Check-in diário: +20 moedas (dia 7 da sequência: +50). Uma vez por dia.
CREATE OR REPLACE FUNCTION public.tvibox_daily_checkin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_wallet tvibox_wallets;
  v_streak INT;
  v_reward INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM tvibox_ensure_wallet();
  SELECT * INTO v_wallet FROM tvibox_wallets WHERE user_id = v_uid FOR UPDATE;

  IF v_wallet.last_checkin = current_date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already', 'coins', v_wallet.coins, 'streak', v_wallet.streak);
  END IF;

  v_streak := CASE WHEN v_wallet.last_checkin = current_date - 1 THEN v_wallet.streak + 1 ELSE 1 END;
  v_reward := CASE WHEN v_streak % 7 = 0 THEN 50 ELSE 20 END;

  UPDATE tvibox_wallets
  SET coins = coins + v_reward, streak = v_streak, last_checkin = current_date
  WHERE user_id = v_uid;

  INSERT INTO tvibox_transactions (user_id, delta, reason, metadata)
  VALUES (v_uid, v_reward, 'daily_checkin', jsonb_build_object('streak', v_streak, 'label', 'Check-in diário'));

  RETURN jsonb_build_object('ok', true, 'coins', v_wallet.coins + v_reward, 'streak', v_streak, 'reward', v_reward);
END;
$$;

-- Recompensa por anúncio (simulado no protótipo): +15 moedas, máx. 5/dia.
CREATE OR REPLACE FUNCTION public.tvibox_ad_reward()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_wallet tvibox_wallets;
  v_count INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM tvibox_ensure_wallet();
  SELECT * INTO v_wallet FROM tvibox_wallets WHERE user_id = v_uid FOR UPDATE;

  v_count := CASE WHEN v_wallet.ads_day = current_date THEN v_wallet.ads_today ELSE 0 END;
  IF v_count >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'limit', 'coins', v_wallet.coins, 'ads_left', 0);
  END IF;

  UPDATE tvibox_wallets
  SET coins = coins + 15, ads_today = v_count + 1, ads_day = current_date
  WHERE user_id = v_uid;

  INSERT INTO tvibox_transactions (user_id, delta, reason, metadata)
  VALUES (v_uid, 15, 'ad_reward', '{"label":"Anúncio visto"}');

  RETURN jsonb_build_object('ok', true, 'coins', v_wallet.coins + 15, 'ads_left', 5 - (v_count + 1));
END;
$$;

-- Compra de pacote (simulada — sem pagamento real no protótipo).
CREATE OR REPLACE FUNCTION public.tvibox_purchase(p_pack TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_wallet tvibox_wallets;
  v_coins INT;
  v_price TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  CASE p_pack
    WHEN 'p60' THEN v_coins := 60; v_price := '2,99€';
    WHEN 'p180' THEN v_coins := 210; v_price := '6,99€';
    WHEN 'p500' THEN v_coins := 600; v_price := '14,99€';
    ELSE RETURN jsonb_build_object('ok', false, 'error', 'unknown_pack');
  END CASE;

  PERFORM tvibox_ensure_wallet();
  SELECT * INTO v_wallet FROM tvibox_wallets WHERE user_id = v_uid FOR UPDATE;

  UPDATE tvibox_wallets SET coins = coins + v_coins WHERE user_id = v_uid;
  INSERT INTO tvibox_transactions (user_id, delta, reason, metadata)
  VALUES (v_uid, v_coins, 'purchase', jsonb_build_object('pack', p_pack, 'price', v_price, 'simulated', true, 'label', 'Pacote ' || v_coins || ' moedas'));

  RETURN jsonb_build_object('ok', true, 'coins', v_wallet.coins + v_coins, 'added', v_coins, 'price', v_price);
END;
$$;

-- TVI Box+ (simulado): 7 dias de teste; renovações somam 30 dias.
CREATE OR REPLACE FUNCTION public.tvibox_start_plus()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_wallet tvibox_wallets;
  v_until TIMESTAMPTZ;
  v_trial BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM tvibox_ensure_wallet();
  SELECT * INTO v_wallet FROM tvibox_wallets WHERE user_id = v_uid FOR UPDATE;

  v_trial := v_wallet.plus_until IS NULL;
  v_until := GREATEST(COALESCE(v_wallet.plus_until, now()), now()) + (CASE WHEN v_trial THEN interval '7 days' ELSE interval '30 days' END);

  UPDATE tvibox_wallets SET plus_until = v_until WHERE user_id = v_uid;
  INSERT INTO tvibox_transactions (user_id, delta, reason, metadata)
  VALUES (v_uid, 0, 'plus', jsonb_build_object('until', v_until, 'trial', v_trial, 'simulated', true, 'label', CASE WHEN v_trial THEN 'TVI Box+ · teste 7 dias' ELSE 'TVI Box+ · renovação' END));

  RETURN jsonb_build_object('ok', true, 'plus_until', v_until, 'trial', v_trial);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tvibox_ensure_wallet() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tvibox_plus_active(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tvibox_unlock_episode(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tvibox_daily_checkin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tvibox_ad_reward() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tvibox_purchase(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tvibox_start_plus() TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE tvibox_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE tvibox_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tvibox_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tvibox_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tvibox_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tvibox_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE tvibox_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tvibox_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE tvibox_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tvibox_render_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tvibox_series_read" ON tvibox_series FOR SELECT TO authenticated USING (true);
CREATE POLICY "tvibox_series_admin" ON tvibox_series FOR ALL USING (is_admin());

CREATE POLICY "tvibox_episodes_read" ON tvibox_episodes FOR SELECT TO authenticated
  USING (status IN ('published', 'coming_soon') OR is_admin());
CREATE POLICY "tvibox_episodes_admin" ON tvibox_episodes FOR ALL USING (is_admin());

CREATE POLICY "tvibox_wallets_own" ON tvibox_wallets FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "tvibox_wallets_update_settings" ON tvibox_wallets FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "tvibox_transactions_own" ON tvibox_transactions FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "tvibox_unlocks_own" ON tvibox_unlocks FOR SELECT USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "tvibox_progress_own" ON tvibox_progress FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tvibox_likes_own" ON tvibox_likes FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tvibox_list_own" ON tvibox_list FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "tvibox_comments_read" ON tvibox_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "tvibox_comments_insert" ON tvibox_comments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "tvibox_comments_delete" ON tvibox_comments FOR DELETE USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "tvibox_render_jobs_admin" ON tvibox_render_jobs FOR ALL USING (is_admin());

-- Moedas/sequência/subscrição só mudam via funções SECURITY DEFINER.
-- O utilizador autenticado apenas pode editar as suas definições (coluna settings).
REVOKE UPDATE ON tvibox_wallets FROM authenticated, anon;
GRANT UPDATE (settings) ON tvibox_wallets TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage — posters, vídeos e legendas (leitura pública; escrita só service role)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('tvibox', 'tvibox', true, 209715200)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tvibox_media_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'tvibox');
