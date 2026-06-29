export { getQuotaStatus, assertQuotaAvailable } from "./quotas";
export type { QuotaStatus } from "./quotas";
export { checkRateLimit, assertRateLimit } from "./rate-limit";
export type { RateLimitResult } from "./rate-limit";
export {
  isEntraConfigured,
  isEmailDomainAllowed,
  shouldRestrictSignupDomains,
  getAzureTenantId,
  ENTRA_ALLOWED_DOMAINS,
} from "./entra";
export { requireAdmin } from "./auth";
