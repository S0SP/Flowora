"use client"

import { useState, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ThemeToggle } from "@/components/ThemeToggle"
import { Mail, Lock, Eye, EyeOff, Chrome, ArrowRight, Sparkles } from "lucide-react"
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
    <div className="min-h-screen bg-background flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] bg-zinc-50 dark:bg-black border-r border-border dark:border-transparent p-12 flex-shrink-0 relative">
        {/* Theme Toggle (Desktop) */}
        <div className="absolute top-8 right-8">
          <ThemeToggle />
        </div>

        {/* Logo */}
        <div className="flex items-center">
          <img src="/image/flowra.png" alt="Flowra Logo" className="h-24 w-auto object-contain dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
        </div>

        {/* Main copy */}
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-primary text-sm font-medium">AI Communication OS</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white leading-tight">
            Automate. Engage.<br />
            <span className="text-primary">Convert.</span>
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-base leading-relaxed">
            The AI-powered platform that turns every WhatsApp conversation into a qualified lead — automatically.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: "10M+", label: "Messages sent" },
            { value: "98%", label: "Delivery rate" },
            { value: "3.2×", label: "Avg conversion" },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-white/5 rounded-xl p-4 border border-border dark:border-white/8 shadow-sm dark:shadow-none">
              <div className="text-2xl font-bold text-primary">{s.value}</div>
              <div className="text-xs text-gray-500 dark:text-white/50 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 lg:pr-20 xl:pr-32">
        <div className="w-full max-w-[440px] bg-card border border-border shadow-sm rounded-2xl p-8 sm:p-10 space-y-7">
          {/* Mobile Theme Toggle & Logo */}
          <div className="lg:hidden flex items-center justify-between mb-4">
            <img src="/image/flowra.png" alt="Flowra Logo" className="h-16 w-auto object-contain dark:drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
            <ThemeToggle />
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-semibold text-foreground tracking-tight">Welcome back</h2>
            <p className="text-muted-foreground mt-1.5 text-sm">Sign in to your workspace</p>
          </div>

          {/* Google OAuth */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 bg-card border border-border rounded-xl h-11 px-4 text-sm font-medium text-foreground hover:bg-muted hover:border-border active:scale-[0.98] transition-all duration-200 shadow-sm disabled:opacity-60"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {googleLoading ? "Redirecting..." : "Continue with Google"}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground font-medium">or continue with email</span>
            </div>
          </div>

          {/* Email/password form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-10 pr-4 h-11 border border-border rounded-xl bg-background text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-gray-400 dark:hover:border-gray-600 transition-all duration-200"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 h-11 border border-border rounded-xl bg-background text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-gray-400 dark:hover:border-gray-600 transition-all duration-200"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[13px]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-border accent-primary focus:ring-primary focus:ring-offset-1 focus:ring-offset-card" />
                <span className="text-muted-foreground">Remember me</span>
              </label>
              <Link href="/auth/forgot-password" className="text-foreground font-medium hover:text-primary transition-colors">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading || !email || !password}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 rounded-xl transition-all duration-200 active:scale-[0.98] shadow-sm shadow-primary/20 disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? "Signing in..." : "Sign in"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
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
