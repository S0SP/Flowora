"use client"

import { useState, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
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
    <div className="min-h-screen bg-[#FAFAF8] flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] bg-[#1B1B1B] p-12 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#FFE27C] rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 32 32" className="w-5 h-5" fill="#1B1B1B">
              <path d="M16 2L6 8v12l10 6 10-6V8L16 2zm0 3.2L23.5 10l-7.5 4.5L8.5 10 16 5.2zM8 11.5l7 4.2v8.5L8 20V11.5zm9 12.7v-8.5l7-4.2V20l-7 4.2z"/>
            </svg>
          </div>
          <span className="text-white font-extrabold text-xl tracking-wide">Flowora</span>
        </div>

        {/* Main copy */}
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 bg-[#FFE27C]/10 border border-[#FFE27C]/20 rounded-full px-4 py-2">
            <Sparkles className="w-4 h-4 text-[#FFE27C]" />
            <span className="text-[#FFE27C] text-sm font-medium">AI Communication OS</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight">
            Automate. Engage.<br />
            <span className="text-[#FFE27C]">Convert.</span>
          </h1>
          <p className="text-[rgba(255,255,255,0.6)] text-base leading-relaxed">
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
            <div key={s.label} className="bg-white/5 rounded-xl p-4 border border-white/8">
              <div className="text-2xl font-bold text-[#FFE27C]">{s.value}</div>
              <div className="text-xs text-white/50 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3">
            <div className="w-8 h-8 bg-[#FFE27C] rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 32 32" className="w-4 h-4" fill="#1B1B1B">
                <path d="M16 2L6 8v12l10 6 10-6V8L16 2zm0 3.2L23.5 10l-7.5 4.5L8.5 10 16 5.2zM8 11.5l7 4.2v8.5L8 20V11.5zm9 12.7v-8.5l7-4.2V20l-7 4.2z"/>
              </svg>
            </div>
            <span className="font-extrabold text-lg text-[#1B1B1B] tracking-wide">Flowora</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-[#1B1B1B]">Welcome back</h2>
            <p className="text-[#6B6B6B] mt-1 text-sm">Sign in to your workspace</p>
          </div>

          {/* Google OAuth */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-[#E8E8E4] rounded-xl px-4 py-3 text-sm font-semibold text-[#1B1B1B] hover:bg-[#FAFAF8] transition-colors shadow-sm disabled:opacity-60"
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
              <div className="w-full border-t border-[#E8E8E4]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#FAFAF8] px-3 text-[#9B9B9B] font-medium">or continue with email</span>
            </div>
          </div>

          {/* Email/password form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1B1B1B] mb-1.5">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9B9B9B]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-[#E8E8E4] rounded-xl bg-white text-sm text-[#1B1B1B] placeholder-[#9B9B9B] focus:outline-none focus:border-[#FFE27C] focus:ring-2 focus:ring-[#FFE27C]/20 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1B1B1B] mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9B9B9B]" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 border border-[#E8E8E4] rounded-xl bg-white text-sm text-[#1B1B1B] placeholder-[#9B9B9B] focus:outline-none focus:border-[#FFE27C] focus:ring-2 focus:ring-[#FFE27C]/20 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9B9B9B] hover:text-[#6B6B6B] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-[#E8E8E4] accent-[#FFE27C]" />
                <span className="text-[#6B6B6B]">Remember me</span>
              </label>
              <Link href="/auth/forgot-password" className="text-[#1B1B1B] font-medium hover:text-[#FFE27C] transition-colors">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading || !email || !password}
              className="w-full flex items-center justify-center gap-2 bg-[#FFE27C] hover:bg-[#FFD84A] active:bg-[#FFC800] text-[#1B1B1B] font-semibold py-2.5 rounded-xl transition-all shadow-[0_2px_8px_rgba(255,226,124,0.4)] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign in"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <p className="text-center text-sm text-[#6B6B6B]">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="text-[#1B1B1B] font-semibold hover:text-[#FFE27C] transition-colors">
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
    <Suspense fallback={<div className="min-h-screen bg-[#FAFAF8]" />}>
      <LoginForm />
    </Suspense>
  )
}
