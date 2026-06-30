"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { Card } from "@/_design_system/Card";
import { formatCost } from "@lib/utils";
import type { QuotaStatus } from "@lib/enterprise/quotas";

export function QuotaWidget() {
  const [quota, setQuota] = useState<QuotaStatus | null>(null);

  useEffect(() => {
    fetch("/api/enterprise/quota")
      .then((r) => r.json())
      .then((d) => setQuota(d.quota ?? null));
  }, []);

  if (!quota) return null;

  const tokenPct = quota.monthly_token_limit
    ? Math.min(100, (quota.tokens_used / quota.monthly_token_limit) * 100)
    : 0;
  const costPct = quota.monthly_cost_limit_eur
    ? Math.min(100, (Number(quota.cost_used_eur) / Number(quota.monthly_cost_limit_eur)) * 100)
    : 0;

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <Gauge size={20} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">
            Quota mensal
            {quota.role && (
              <span className="ml-2 text-xs font-normal text-slate-400">({quota.role})</span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {quota.tokens_used.toLocaleString()}
            {quota.monthly_token_limit != null
              ? ` / ${quota.monthly_token_limit.toLocaleString()} tokens`
              : " tokens · ilimitado"}
            {" · "}
            {formatCost(Number(quota.cost_used_eur))}
            {quota.monthly_cost_limit_eur != null
              ? ` / ${formatCost(Number(quota.monthly_cost_limit_eur))}`
              : " · ilimitado"}
          </p>
          {(quota.monthly_token_limit != null || quota.monthly_cost_limit_eur != null) && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${
                  quota.quota_exceeded ? "bg-red-500" : "bg-brand-500"
                }`}
                style={{ width: `${Math.max(tokenPct, costPct)}%` }}
              />
            </div>
          )}
          {quota.quota_exceeded && (
            <p className="mt-1 text-xs font-medium text-red-600">Quota excedida</p>
          )}
        </div>
      </div>
    </Card>
  );
}
