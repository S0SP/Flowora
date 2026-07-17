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
  const [showPassword, setShowPassword] = useState(false);

  // Step 1: Account details
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // Step 2: Workspace
  const [workspaceName, setWorkspaceName] = useState("");
  const [industry, setIndustry] = useState("");

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
    <div className="min-h-screen bg-[#FAFAF8] flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#1B1B1B] flex-col justify-between p-12">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">Flowora</span>
          </div>

          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            The AI Communication OS<br />
            <span className="text-primary">Built for Growth</span>
          </h2>
          <p className="text-[#9B9B9B] text-[15px] leading-relaxed mb-8">
            Automate WhatsApp outreach, handle conversations with AI, and convert leads with voice agents — all in one platform.
          </p>

          <div className="space-y-3">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                <span className="text-[14px] text-[#C8C8C8]">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[13px] text-[#6B6B6B]">
          © {new Date().getFullYear()} Flowora. All rights reserved.
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-[#1B1B1B]">Flowora</span>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-8">
            <div className={cn("flex items-center gap-2 text-sm font-medium", step === "account" ? "text-[#1B1B1B]" : "text-[#9B9B9B]")}>
              <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", step === "account" ? "bg-[#FFE27C] text-[#1B1B1B]" : "bg-[#FFE27C] text-[#1B1B1B]")}>
                {step !== "account" ? "✓" : "1"}
              </span>
              Account
            </div>
            <div className="flex-1 h-px bg-[#E8E8E4]" />
            <div className={cn("flex items-center gap-2 text-sm font-medium", step === "workspace" ? "text-[#1B1B1B]" : "text-[#9B9B9B]")}>
              <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", step === "workspace" ? "bg-[#FFE27C] text-[#1B1B1B]" : "bg-[#E8E8E4] text-[#9B9B9B]")}>
                2
              </span>
              Workspace
            </div>
          </div>

          {step === "account" ? (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-[#1B1B1B]">Create your account</h1>
                <p className="text-sm text-[#6B6B6B] mt-1">Start your 14-day free trial — no credit card required</p>
              </div>

              <form onSubmit={handleCreateAccount} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1B1B1B] mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Robert Fox"
                    required
                    className="w-full border border-[#E8E8E4] rounded-xl px-4 py-3 text-sm text-[#1B1B1B] placeholder-[#9B9B9B] focus:outline-none focus:ring-2 focus:ring-[#FFE27C]/40 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1B1B1B] mb-1.5">Work Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    className="w-full border border-[#E8E8E4] rounded-xl px-4 py-3 text-sm text-[#1B1B1B] placeholder-[#9B9B9B] focus:outline-none focus:ring-2 focus:ring-[#FFE27C]/40 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1B1B1B] mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
                      className="w-full border border-[#E8E8E4] rounded-xl px-4 py-3 pr-11 text-sm text-[#1B1B1B] placeholder-[#9B9B9B] focus:outline-none focus:ring-2 focus:ring-[#FFE27C]/40 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9B9B9B] hover:text-[#1B1B1B]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-1.5 flex gap-1">
                      {[8, 12, 16].map(len => (
                        <div key={len} className={cn("h-1 flex-1 rounded-full transition-colors",
                          password.length >= len ? "bg-[#FFE27C]" : "bg-[#E8E8E4]"
                        )} />
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#FFE27C] hover:bg-[#FFD84A] active:bg-[#FFC800] text-[#1B1B1B] font-semibold py-3 rounded-xl transition-all shadow-[0_2px_8px_rgba(255,226,124,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Create Account →
                </button>

                <p className="text-xs text-[#6B6B6B] text-center">
                  By signing up you agree to our{" "}
                  <a href="#" className="text-[#1B1B1B] font-medium hover:text-[#FFE27C] underline">Terms of Service</a>
                  {" "}and{" "}
                  <a href="#" className="text-[#1B1B1B] font-medium hover:text-[#FFE27C] underline">Privacy Policy</a>
                </p>
              </form>
            </>
          ) : step === "check-email" ? (
            <div className="text-center space-y-6 py-4 animate-in fade-in duration-300">
              <div className="w-16 h-16 bg-[#FFE27C]/10 border border-[#FFE27C]/20 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-[#FFE27C]" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-[#1B1B1B]">Verify your email</h1>
                <p className="text-sm text-[#6B6B6B] leading-relaxed">
                  We&apos;ve sent a verification link to <span className="font-semibold text-[#1B1B1B]">{email}</span>.
                </p>
                <p className="text-sm text-[#6B6B6B] leading-relaxed">
                  Please check your inbox and click the link to confirm your account, then sign in to setup your workspace.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  href={searchParams.toString() ? `/auth/login?${searchParams.toString()}` : "/auth/login"}
                  className="inline-flex items-center gap-2 bg-[#FFE27C] hover:bg-[#FFD84A] text-[#1B1B1B] font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_2px_8px_rgba(255,226,124,0.4)]"
                >
                  Go to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-[#1B1B1B]">Set up your workspace</h1>
                <p className="text-sm text-[#6B6B6B] mt-1">This is where your team will collaborate</p>
              </div>

              <form onSubmit={handleCreateWorkspace} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#1B1B1B] mb-1.5">Company / Workspace Name</label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={e => setWorkspaceName(e.target.value)}
                    placeholder="Acme Corp"
                    required
                    className="w-full border border-[#E8E8E4] rounded-xl px-4 py-3 text-sm text-[#1B1B1B] placeholder-[#9B9B9B] focus:outline-none focus:ring-2 focus:ring-[#FFE27C]/40 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1B1B1B] mb-1.5">Industry (optional)</label>
                  <select
                    value={industry}
                    onChange={e => setIndustry(e.target.value)}
                    className="w-full border border-[#E8E8E4] rounded-xl px-4 py-3 text-sm text-[#1B1B1B] focus:outline-none focus:ring-2 focus:ring-[#FFE27C]/40 bg-white"
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

                <div className="bg-[#FFE27C]/5 border border-[#FFE27C]/20 rounded-xl p-4">
                  <p className="text-sm font-medium text-[#1B1B1B] mb-1">What happens next</p>
                  <ul className="space-y-1">
                    {["Connect your WhatsApp Business API", "Import your first contacts", "Create your first AI workflow"].map((s, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-[#6B6B6B]">
                        <span className="w-5 h-5 rounded-full bg-[#FFE27C]/20 text-[#1B1B1B] text-xs flex items-center justify-center font-bold">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="submit"
                  disabled={loading || !workspaceName}
                  className="w-full bg-[#FFE27C] hover:bg-[#FFD84A] active:bg-[#FFC800] text-[#1B1B1B] font-semibold py-3 rounded-xl transition-all shadow-[0_2px_8px_rgba(255,226,124,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Launch My Workspace →
                </button>
              </form>
            </>
          )}

          <p className="text-sm text-[#6B6B6B] text-center mt-6">
            Already have an account?{" "}
            <Link 
              href={searchParams.toString() ? `/auth/login?${searchParams.toString()}` : "/auth/login"} 
              className="text-[#1B1B1B] font-semibold hover:text-[#FFE27C] transition-colors"
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
    <Suspense fallback={<div className="min-h-screen bg-[#FAFAF8]" />}>
      <SignupForm />
    </Suspense>
  );
}
