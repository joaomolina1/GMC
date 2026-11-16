-- Registo das Escalas: guarda o nome de quem fez a alteração no momento.
-- A coordenação não lê perfis de outros utilizadores (RLS de profiles), por isso
-- o nome fica gravado na própria linha. O autor é sempre o utilizador autenticado.
ALTER TABLE public.escala_registo ADD COLUMN IF NOT EXISTS autor TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.escala_registo_autor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  NEW.autor := coalesce(
    (SELECT nome FROM public.escala_pessoas WHERE user_id = NEW.user_id LIMIT 1),
    (SELECT nullif(full_name, '') FROM public.profiles WHERE id = NEW.user_id),
    (SELECT email FROM public.profiles WHERE id = NEW.user_id),
    CASE WHEN NEW.user_id IS NULL THEN 'sistema' ELSE 'utilizador' END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS escala_registo_autor ON public.escala_registo;
CREATE TRIGGER escala_registo_autor
  BEFORE INSERT ON public.escala_registo
  FOR EACH ROW EXECUTE FUNCTION public.escala_registo_autor();

UPDATE public.escala_registo SET autor = 'sistema' WHERE autor = '';
