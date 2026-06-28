#!/usr/bin/env bash
set -euo pipefail

TEAM_SLUG="${VERCEL_TEAM_SLUG:-joaomolina1s-projects}"
PROJECT_NAME="${VERCEL_PROJECT_NAME:-gmc}"

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "ERROR: VERCEL_TOKEN is required"
  exit 1
fi

export VERCEL_ORG_ID="${VERCEL_ORG_ID:-team_oNfvLM80LGUd3XadT9jKYKjF}"

echo "→ Linking project ${PROJECT_NAME}..."
npx vercel link --yes --project "$PROJECT_NAME" --scope "$TEAM_SLUG"

add_env() {
  local key="$1"
  local value="$2"
  for target in production preview; do
    printf '%s' "$value" | npx vercel env add "$key" "$target" --scope "$TEAM_SLUG" --force 2>/dev/null || \
    printf '%s' "$value" | npx vercel env add "$key" "$target" --scope "$TEAM_SLUG"
  done
}

echo "→ Setting environment variables..."
add_env NEXT_PUBLIC_SUPABASE_URL "${NEXT_PUBLIC_SUPABASE_URL:-https://wnhojvxnamxmpmdislcl.supabase.co}"
add_env NEXT_PUBLIC_SUPABASE_ANON_KEY "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?required}"
add_env SUPABASE_SERVICE_ROLE_KEY "${SUPABASE_SERVICE_ROLE_KEY:?required}"
add_env ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY:?required}"

echo "→ Deploying to production..."
npx vercel deploy --prod --yes --scope "$TEAM_SLUG"

echo "✅ Done"
