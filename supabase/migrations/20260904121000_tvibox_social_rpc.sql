-- TVI BOX — agregados sociais que atravessam RLS (contagens e comentários com autor).

CREATE OR REPLACE FUNCTION public.tvibox_episode_counts(p_ids UUID[])
RETURNS TABLE (episode_id UUID, likes BIGINT, comments BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id,
         (SELECT count(*) FROM tvibox_likes l WHERE l.episode_id = e.id) AS likes,
         (SELECT count(*) FROM tvibox_comments c WHERE c.episode_id = e.id) AS comments
  FROM tvibox_episodes e
  WHERE e.id = ANY (p_ids);
$$;

CREATE OR REPLACE FUNCTION public.tvibox_episode_comments(p_episode_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  body TEXT,
  created_at TIMESTAMPTZ,
  author_name TEXT,
  is_mine BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         c.body,
         c.created_at,
         COALESCE(NULLIF(p.full_name, ''), split_part(p.email, '@', 1)) AS author_name,
         c.user_id = auth.uid() AS is_mine
  FROM tvibox_comments c
  JOIN profiles p ON p.id = c.user_id
  WHERE c.episode_id = p_episode_id
  ORDER BY c.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

GRANT EXECUTE ON FUNCTION public.tvibox_episode_counts(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tvibox_episode_comments(UUID, INT) TO authenticated;
