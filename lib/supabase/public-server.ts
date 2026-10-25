import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

/** A server-side client that always uses the anonymous role, even for a signed-in owner. */
export function createPublicClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
