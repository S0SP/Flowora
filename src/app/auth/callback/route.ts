import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = requestUrl.searchParams.get("next") ?? "/onboarding"
  const origin = requestUrl.origin

  if (!code) {
    console.error("[auth/callback] No code parameter in request")
    return NextResponse.redirect(`${origin}/auth/login?error=no_code`)
  }

  const cookieStore = await cookies()
  // Redirect to onboarding by default — middleware will redirect to /dashboard
  // if the user is already onboarded. This is safer than redirecting to /dashboard
  // directly, which can fail if workspace data isn't set up yet.
  const redirectTarget = next === "/dashboard" ? "/onboarding" : next
  const response = NextResponse.redirect(`${origin}${redirectTarget}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: any[]) {
          // Write to response first — this is what the browser will receive
          cookiesToSet.forEach(({ name, value, options }: any) => {
            response.cookies.set(name, value, options)
          })
          // Best-effort write to the Next.js cookie store
          cookiesToSet.forEach(({ name, value, options }: any) => {
            try {
              cookieStore.set(name, value, options)
            } catch {
              // Safe to ignore in edge runtime
            }
          })
        },
      },
    }
  )

  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message)
    // Auth truly failed — send to login with error
    return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`)
  }

  // Auth succeeded — try to activate any pending invite memberships
  // This is best-effort and must NOT block the login flow
  try {
    const user = sessionData?.user
    if (user) {
      const admin = await createAdminClient()
      const { error: inviteErr } = await admin
        .from("workspace_members")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("status", "invited")

      if (inviteErr) {
        console.error("[auth/callback] invite activation error (non-fatal):", inviteErr.message)
      }

      // Also ensure profile exists
      await admin
        .from("profiles")
        .upsert({
          id: user.id,
          email: user.email ?? "",
          full_name: user.user_metadata?.full_name ?? null,
          avatar_url: user.user_metadata?.avatar_url ?? null,
        }, { onConflict: "id" })
    }
  } catch (adminErr: any) {
    // Non-fatal — user is authenticated, just couldn't activate invites
    console.error("[auth/callback] admin operation error (non-fatal):", adminErr?.message ?? adminErr)
  }

  // Auth succeeded — redirect to onboarding (middleware will forward to /dashboard if already onboarded)
  return response
}
