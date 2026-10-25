export function getSupabaseEnvironment() {
  // Keep these as direct references so Next.js can inline public variables in
  // browser bundles. Never add service-role or secret keys to this module.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const missing: string[] = [];

  if (!url?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!publishableKey?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required Supabase environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Add them to .env.local for local development or configure them in the deployment environment.`,
    );
  }

  return { url: url!, publishableKey: publishableKey! };
}
