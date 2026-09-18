import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveWorkspaceForMiddleware } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/server";

const PUBLIC_PATHS = [
  "/auth/login",
  "/auth/signup",
  "/auth/callback",
  "/auth/reset-password",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets / API routes that handle their own auth
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/image")
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet: any[]) {
          cookiesToSet.forEach(({ name, value, options }: any) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = data?.user;
    if (error) {
      console.error("Middleware auth getUser error:", error);
    }
  } catch (error) {
    console.error("Middleware auth getUser thrown exception:", error);
  }

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));

  // Not authenticated → send to login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated → don't let them see auth pages again
  if (user && isPublic && !pathname.startsWith("/auth/callback")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Check onboarding status for dashboard and onboarding routes
  if (user && (pathname.startsWith("/dashboard") || pathname === "/onboarding")) {
    let hasActiveWorkspace = false;
    let profileOnboarded = false;
    try {
      const admin = await createAdminClient();

      const { data: profile } = await admin
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.onboarding_completed) {
        profileOnboarded = true;
      }

      const { data: membership } = await admin
        .from("workspace_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (membership) {
        hasActiveWorkspace = true;
      }
    } catch (e) {
      console.error("Middleware onboarding check error:", e);
    }

    const isUserOnboarded = profileOnboarded || hasActiveWorkspace;

    if (!isUserOnboarded && pathname !== "/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    if (isUserOnboarded && pathname === "/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // Call resolveWorkspaceForMiddleware to set the fw_ws cookie and load dashboard
    if (pathname.startsWith("/dashboard")) {
      return await resolveWorkspaceForMiddleware(request, user.id, response);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|image|favicon.ico).*)"],
};
