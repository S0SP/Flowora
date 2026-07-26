import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolveWorkspaceForMiddleware } from "@/lib/tenant";

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
    let onboardingCompleted = false;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single();
      
      if (profile?.onboarding_completed) {
        onboardingCompleted = true;
      }
    } catch (e) {
      console.error("Middleware profile fetch error:", e);
    }

    if (!onboardingCompleted && pathname !== "/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    if (onboardingCompleted && pathname === "/onboarding") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    // Call resolveWorkspaceForMiddleware to set the fw_ws cookie
    if (onboardingCompleted && pathname.startsWith("/dashboard")) {
      return await resolveWorkspaceForMiddleware(request, user.id, response);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|image|favicon.ico).*)"],
};
