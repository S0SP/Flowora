import { createServerClient } from "@supabase/ssr";
import { createClient as createBaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mock.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "mock-anon-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: any) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

export async function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    // Log loudly — missing service key means RLS will block admin queries
    console.error(
      "[createAdminClient] SUPABASE_SERVICE_ROLE_KEY is not set! " +
      "Admin queries will fail RLS checks. " +
      "Add SUPABASE_SERVICE_ROLE_KEY to your Vercel environment variables."
    );
    return createBaseClient(
      url ?? "https://mock.supabase.co",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "mock-anon-key"
    );
  }

  return createBaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
