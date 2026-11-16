-- Funções de trigger das Escalas e de acessos não devem ser expostas como RPC.
REVOKE ALL ON FUNCTION public.escala_ausencias_guard(), public.escala_ausencias_retira_turnos(), public.escala_ligar_conta(),
  public.escala_pessoas_guard(), public.escala_registo_autor(), public.escala_turnos_guard(), public.escala_alternancia_guard(),
  public.profiles_guard_access(), public.profiles_sync_app_metadata()
  FROM PUBLIC, anon, authenticated;
