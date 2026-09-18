"use client"

import { useState, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ThemeToggle } from "@/components/ThemeToggle"
import { Mail, Lock, Eye, EyeOff, Chrome, ArrowRight, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  // Honor both ?redirect= (from invite page) and ?next= (from middleware)
  const redirectTo = searchParams.get("redirect") ?? searchParams.get("next") ?? "/dashboard"
  const supabase = createClient()

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    })
    if (error) {
      toast.error("Google sign-in failed: " + error.message)
      setGoogleLoading(false)
    }
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error(error.message)
      setLoading(false)
    } else {
      router.push(redirectTo)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex p-3 sm:p-4 lg:p-6 relative overflow-hidden items-stretch">
      {/* Theme Toggle */}
      <div className="fixed top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      {/* Left panel — Inset Canvas Hero Window */}
      <div className="hidden lg:flex flex-col justify-between w-[460px] xl:w-[480px] bg-zinc-100/90 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-white/10 rounded-[24px] p-8 xl:p-10 flex-shrink-0 relative overflow-hidden shadow-2xl backdrop-blur-md">
        {/* Ambient radial glow background */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header / Logo */}
        <div className="flex items-center relative z-10">
          <img src="/image/flowra_expanded_transparent.png" alt="Flowra Logo" className="h-9 w-auto object-contain dark:hidden" />
          <img src="/image/flowra_expanded_dark.png" alt="Flowra Logo" className="h-9 w-auto object-contain hidden dark:block" />
        </div>

        {/* Main copy */}
        <div className="space-y-5 my-auto relative z-10 py-6">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-3.5 py-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-primary text-xs font-semibold tracking-wide">AI Communication OS</span>
          </div>
          <h1 className="text-4xl xl:text-[44px] font-extrabold text-foreground tracking-tight leading-[1.15]">
            Automate. Engage.<br />
            <span className="text-primary">Convert.</span>
          </h1>
          <p className="text-muted-foreground dark:text-zinc-400 text-sm xl:text-[15px] leading-[1.6]">
            The AI-powered platform that turns every WhatsApp conversation into a qualified lead — automatically.
          </p>
        </div>

        {/* Single Inline Metrics Bar (contained inside left panel) */}
        <div className="flex items-center justify-between border-t border-border/40 dark:border-white/[0.05] pt-5 relative z-10">
          {[
            { value: "10M+", label: "Messages sent" },
            { value: "98%", label: "Delivery rate" },
            { value: "3.2×", label: "Avg conversion" },
          ].map((s, idx) => (
            <div key={s.label} className={cn("flex-1 text-center", idx > 0 && "border-l border-border/40 dark:border-white/[0.05] pl-2")}>
              <div className="text-xl xl:text-2xl font-bold text-foreground tracking-tight">{s.value}</div>
              <div className="text-[11px] text-muted-foreground dark:text-zinc-400 font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — Borderless Form strictly constrained to 360px */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[360px] space-y-5">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-between mb-2">
            <div className="flex items-center">
              <img src="/image/flowra_expanded_transparent.png" alt="Flowra Logo" className="h-8 w-auto object-contain dark:hidden" />
              <img src="/image/flowra_expanded_dark.png" alt="Flowra Logo" className="h-8 w-auto object-contain hidden dark:block" />
            </div>
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Welcome back</h2>
            <p className="text-muted-foreground mt-1 text-sm">Sign in to your workspace</p>
          </div>

          {/* Google OAuth (Constrained 20x20 Icon & 8px rounded button) */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-2.5 bg-background dark:bg-zinc-900/60 border border-border dark:border-zinc-800 rounded-lg h-10 px-4 text-sm font-medium text-foreground hover:bg-muted dark:hover:bg-zinc-800/80 active:scale-[0.98] transition-all duration-200 shadow-sm disabled:opacity-60 cursor-pointer"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="truncate">{googleLoading ? "Redirecting..." : "Continue with Google"}</span>
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/60 dark:border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground font-medium">or continue with email</span>
            </div>
          </div>

          {/* Email/password form (Crisp 8px rounded-lg inputs) */}
          <form onSubmit={handleEmailLogin} className="space-y-3.5">
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-9 pr-3.5 h-10 border border-border dark:border-zinc-800 rounded-lg bg-background dark:bg-zinc-900/40 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 hover:border-zinc-400 dark:hover:border-zinc-700 transition-all duration-200"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-9 h-10 border border-border dark:border-zinc-800 rounded-lg bg-background dark:bg-zinc-900/40 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 hover:border-zinc-400 dark:hover:border-zinc-700 transition-all duration-200"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[13px] pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-3.5 h-3.5 rounded border-border accent-primary focus:ring-primary" />
                <span className="text-muted-foreground">Remember me</span>
              </label>
              <Link href="/auth/forgot-password" className="text-foreground font-medium hover:text-primary transition-colors">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading || !email || !password}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-10 rounded-lg transition-all duration-200 active:scale-[0.98] shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:active:scale-100 cursor-pointer mt-1"
            >
              {loading ? "Signing in..." : "Sign in"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground pt-1">
            Don&apos;t have an account?{" "}
            <Link 
              href={searchParams.toString() ? `/auth/signup?${searchParams.toString()}` : "/auth/signup"} 
              className="text-foreground font-semibold hover:text-primary transition-colors"
            >
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginForm />
    </Suspense>
  )
}
