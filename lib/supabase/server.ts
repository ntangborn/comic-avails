import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase clients for server-side use only.
 *
 * - `catalogClient()` uses the publishable (anon-equivalent) key. Catalog tables
 *   (publishers, series, items, creators, item_creators) have a public-read RLS
 *   policy, so this key can read them. Never use it to write.
 * - `serviceClient()` uses the secret (service_role-equivalent) key, which
 *   BYPASSES RLS. Used only for pull-list / subscription writes on behalf of the
 *   hardcoded demo user until real auth lands. Keep it server-side.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

export function catalogClient(): SupabaseClient {
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
    );
  }
  return createClient(url, publishableKey, {
    auth: { persistSession: false },
  });
}

let cachedService: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (!url || !secretKey) {
    throw new Error(
      "Supabase service key missing: set SUPABASE_SECRET_KEY (sb_secret_...) in .env.local. Required for pull-list writes.",
    );
  }
  if (!cachedService) {
    cachedService = createClient(url, secretKey, {
      auth: { persistSession: false },
    });
  }
  return cachedService;
}

/** True when the secret key + demo user are configured (pull list usable). */
export function pullListConfigured(): boolean {
  return Boolean(url && secretKey && process.env.DEMO_USER_ID);
}
