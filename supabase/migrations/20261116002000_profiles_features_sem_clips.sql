-- A zona Clips foi removida: deixa de ser uma funcionalidade atribuível.
UPDATE public.profiles SET allowed_features = array_remove(allowed_features, 'clips') WHERE 'clips' = ANY (allowed_features);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_allowed_features_chk;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_allowed_features_chk CHECK (
  allowed_features IS NULL
  OR allowed_features <@ ARRAY['agentes', 'flows', 'tvibox', 'chartbeat', 'escalas']::TEXT[]
);
