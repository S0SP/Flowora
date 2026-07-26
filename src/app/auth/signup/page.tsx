"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, CheckCircle, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const FEATURES = [
  "AI WhatsApp chatbot with RAG knowledge base",
  "Voice agent for lead retention & conversion",
  "Agentic workflow builder — no code needed",
  "Shared team inbox with agent assignment",
  "Broadcast campaigns with Meta templates",
  "Leads CRM with kanban board",
];

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"account" | "check-email" | "workspace">("account");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Step 1: Account details
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // Step 2: Workspace
  const [workspaceName, setWorkspaceName] = useState("");
  const [industry, setIndustry] = useState("");

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    const supabase = createClient();
    const nextParam = searchParams.get("redirect") ?? searchParams.get("next") ?? "/dashboard";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextParam)}`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) {
      toast.error("Google sign-in failed: " + error.message);
      setGoogleLoading(false);
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password || !fullName) { toast.error("All fields are required"); return; }
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
      
      const nextParam = searchParams.get("redirect") ?? searchParams.get("next") ?? "/dashboard";
      if (!data?.session) {
        setStep("check-email");
      } else {
        if (nextParam && nextParam.startsWith("/invite/")) {
          router.push(nextParam);
        } else {
          setStep("workspace");
        }
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create account");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceName) { toast.error("Workspace name is required"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName, industry }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create workspace");
      }

      toast.success("Workspace created! Redirecting…");
      router.push("/onboarding");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create workspace");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-zinc-50 dark:bg-black border-r border-border dark:border-transparent flex-col justify-between p-12">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="flex items-center justify-center">
              <img src="/image/flowra.png" alt="Flowora Logo" className="h-12 w-auto object-contain scale-[1.3] origin-left" />
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Flowora</span>
          </div>

          <h2 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight mb-4">
            The AI Communication OS<br />
            <span className="text-primary">Built for Growth</span>
          </h2>
          <p className="text-gray-600 dark:text-zinc-400 text-[15px] leading-relaxed mb-8">
            Automate WhatsApp outreach, handle conversations with AI, and convert leads with voice agents — all in one platform.
          </p>

          <div className="space-y-3">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                <span className="text-[14px] text-gray-700 dark:text-zinc-300">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[13px] text-gray-500 dark:text-zinc-500">
          © {new Date().getFullYear()} Flowora. All rights reserved.
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 lg:pr-20 xl:pr-32">
        <div className="w-full max-w-[440px] bg-card border border-border shadow-sm rounded-2xl p-8 sm:p-10">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 justify-center mb-6 lg:hidden">
            <div className="flex items-center justify-center">
              <img src="/image/flowra.png" alt="Flowora Logo" className="h-10 w-auto object-contain scale-[1.3] origin-left" />
            </div>
            <span className="text-lg font-bold text-foreground">Flowora</span>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-8">
            <div className={cn("flex items-center gap-2 text-sm font-medium", step === "account" ? "text-foreground" : "text-muted-foreground")}>
              <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", step === "account" ? "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground")}>
                {step !== "account" ? "✓" : "1"}
              </span>
              Account
            </div>
            <div className="flex-1 h-px bg-border" />
            <div className={cn("flex items-center gap-2 text-sm font-medium", step === "workspace" ? "text-foreground" : "text-muted-foreground")}>
              <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", step === "workspace" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                2
              </span>
              Workspace
            </div>
          </div>

          {step === "account" ? (
            <>
              <div className="mb-6 text-center lg:text-left">
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">Create your account</h1>
                <p className="text-[13px] text-muted-foreground mt-1.5">Start your 14-day free trial — no credit card required</p>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 bg-card border border-border rounded-xl h-11 px-4 text-sm font-medium text-foreground hover:bg-muted hover:border-border active:scale-[0.98] transition-all duration-200 shadow-sm disabled:opacity-60 mb-6"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {googleLoading ? "Redirecting..." : "Continue with Google"}
              </button>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-background px-3 text-muted-foreground font-medium">or continue with email</span>
                </div>
              </div>

              <form onSubmit={handleCreateAccount} className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Robert Fox"
                    required
                    className="w-full h-11 border border-border rounded-xl px-4 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-gray-400 dark:hover:border-gray-600 bg-background transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Work Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="w-full h-11 border border-border rounded-xl px-4 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-gray-400 dark:hover:border-gray-600 bg-background transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
                      className="w-full h-11 border border-border rounded-xl px-4 pr-11 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-gray-400 dark:hover:border-gray-600 bg-background transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-1.5 flex gap-1">
                      {[8, 12, 16].map(len => (
                        <div key={len} className={cn("h-1 flex-1 rounded-full transition-colors",
                          password.length >= len ? "bg-primary" : "bg-border"
                        )} />
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 rounded-xl transition-all duration-200 active:scale-[0.98] shadow-sm shadow-primary/20 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Create Account
                </button>

                <p className="text-xs text-muted-foreground text-center mt-2">
                  By signing up you agree to our{" "}
                  <a href="#" className="text-foreground font-medium hover:text-primary underline">Terms of Service</a>
                  {" "}and{" "}
                  <a href="#" className="text-foreground font-medium hover:text-primary underline">Privacy Policy</a>
                </p>
              </form>
            </>
          ) : step === "check-email" ? (
            <div className="text-center space-y-6 py-4 animate-in fade-in duration-300">
              <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-foreground">Verify your email</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We&apos;ve sent a verification link to <span className="font-semibold text-foreground">{email}</span>.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Please check your inbox and click the link to confirm your account, then sign in to setup your workspace.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  href={searchParams.toString() ? `/auth/login?${searchParams.toString()}` : "/auth/login"}
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_2px_8px_rgba(16,185,129,0.3)]"
                >
                  Go to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6 text-center lg:text-left">
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">Set up your workspace</h1>
                <p className="text-[13px] text-muted-foreground mt-1.5">This is where your team will collaborate</p>
              </div>

              <form onSubmit={handleCreateWorkspace} className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Company / Workspace Name</label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={e => setWorkspaceName(e.target.value)}
                    placeholder="Acme Corp"
                    required
                    className="w-full h-11 border border-border rounded-xl px-4 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-gray-400 dark:hover:border-gray-600 bg-background transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5">Industry (optional)</label>
                  <select
                    value={industry}
                    onChange={e => setIndustry(e.target.value)}
                    className="w-full h-11 border border-border rounded-xl px-4 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 hover:border-gray-400 dark:hover:border-gray-600 bg-background transition-all duration-200"
                  >
                    <option value="">Select industry…</option>
                    <option value="saas">SaaS / Technology</option>
                    <option value="ecommerce">E-commerce</option>
                    <option value="real_estate">Real Estate</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="education">Education / EdTech</option>
                    <option value="fintech">Fintech</option>
                    <option value="consulting">Consulting / Agency</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <p className="text-sm font-medium text-foreground mb-2">What happens next</p>
                  <ul className="space-y-2">
                    {["Connect your WhatsApp Business API", "Import your first contacts", "Create your first AI workflow"].map((s, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="w-5 h-5 rounded-full bg-primary/20 text-primary-foreground text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="submit"
                  disabled={loading || !workspaceName}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 rounded-xl transition-all duration-200 active:scale-[0.98] shadow-sm shadow-primary/20 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 mt-4"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Launch My Workspace
                </button>
              </form>
            </>
          )}

          <p className="text-sm text-muted-foreground text-center mt-6">
            Already have an account?{" "}
            <Link 
              href={searchParams.toString() ? `/auth/login?${searchParams.toString()}` : "/auth/login"} 
              className="text-foreground font-semibold hover:text-primary transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SignupForm />
    </Suspense>
  );
}
