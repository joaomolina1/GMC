/** True in Vercel/production deploys; false in local dev and preview unless forced. */
export function isProductionDeploy(): boolean {
  if (process.env.ENTERPRISE_FAIL_CLOSED === "1") return true;
  if (process.env.ENTERPRISE_FAIL_CLOSED === "0") return false;
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}
