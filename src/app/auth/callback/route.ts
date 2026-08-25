import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = requestUrl.searchParams.get("next") ?? "/dashboard"
  const origin = requestUrl.origin

  if (code) {
    const cookieStore = await cookies()
    const response = NextResponse.redirect(`${origin}${next}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: any[]) {
            // Set on response FIRST (always succeeds) so auth cookies are
            // included in the redirect even if the cookie store throws.
            cookiesToSet.forEach(({ name, value, options }: any) => {
              response.cookies.set(name, value, options)
            })
            // Best-effort write to the Next.js cookie store (may fail in
            // some edge-runtime contexts — safe to ignore).
            cookiesToSet.forEach(({ name, value, options }: any) => {
              try {
                cookieStore.set(name, value, options)
              } catch {
                // Intentionally ignored
              }
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Auto-activate any pending email invites for this user
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const admin = await createAdminClient()
        await admin
          .from("workspace_members")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("status", "invited")
      }

      return response
    } else {
      console.error("Exchange code error:", error)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`)
}
