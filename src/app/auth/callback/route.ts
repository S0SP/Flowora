import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const nextParam = requestUrl.searchParams.get("next")
  const origin = requestUrl.origin

  if (!code) {
    console.error("[auth/callback] No code parameter in request")
    return NextResponse.redirect(`${origin}/auth/login?error=no_code`)
  }

  const cookieStore = await cookies()
  let cookiesToSetOnResponse: any[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: any[]) {
          cookiesToSetOnResponse = cookiesToSet
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
    return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`)
  }

  const user = sessionData?.user
  let targetPath = nextParam ?? "/dashboard"

  if (user) {
    try {
      const admin = await createAdminClient()

      // Activate any pending invited memberships
      await admin
        .from("workspace_members")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("status", "invited")

      // Ensure profile exists and check onboarding status
      const { data: profile } = await admin
        .from("profiles")
        .upsert({
          id: user.id,
          email: user.email ?? "",
          full_name: user.user_metadata?.full_name ?? null,
          avatar_url: user.user_metadata?.avatar_url ?? null,
        }, { onConflict: "id" })
        .select("onboarding_completed")
        .maybeSingle()

      // Check workspace membership
      const { data: membership } = await admin
        .from("workspace_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle()

      const isUserOnboarded = profile?.onboarding_completed || !!membership

      if (isUserOnboarded) {
        targetPath = nextParam && nextParam !== "/onboarding" ? nextParam : "/dashboard"
      } else {
        targetPath = "/onboarding"
      }
    } catch (adminErr: any) {
      console.error("[auth/callback] admin check error (non-fatal):", adminErr?.message ?? adminErr)
    }
  }

  const response = NextResponse.redirect(`${origin}${targetPath}`)
  cookiesToSetOnResponse.forEach(({ name, value, options }: any) => {
    response.cookies.set(name, value, options)
  })

  return response
}
