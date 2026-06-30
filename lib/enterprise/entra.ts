export const ENTRA_ALLOWED_DOMAINS = (
  process.env.ENTRA_ALLOWED_DOMAINS ?? "mediacapital.pt,grupomediacapital.pt"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export function isEntraConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ENTRA_ENABLED === "true");
}

export function shouldRestrictSignupDomains(): boolean {
  if (process.env.NEXT_PUBLIC_SIGNUP_DOMAIN_RESTRICT === "true") return true;
  if (process.env.NEXT_PUBLIC_SIGNUP_DOMAIN_RESTRICT === "false") return false;
  return isEntraConfigured();
}

export function isEmailDomainAllowed(email: string): boolean {
  if (ENTRA_ALLOWED_DOMAINS.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return ENTRA_ALLOWED_DOMAINS.some(
    (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
  );
}

export function getAzureTenantId(): string | undefined {
  return process.env.AZURE_AD_TENANT_ID || undefined;
}
