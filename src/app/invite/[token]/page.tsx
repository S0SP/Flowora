"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, Users, Check, X, AlertTriangle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type InviteInfo = {
  role: string
  workspaceName: string
  workspaceSlug: string
  label: string | null
  expiresAt: string | null
  alreadyMember: boolean
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null)
    })
  }, [])

  useEffect(() => {
    if (!token) return
    fetch(`/api/invite/${token}/peek`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Invalid or expired invite")
        setInfo(data)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  const handleAccept = async () => {
    if (!user) {
      // Redirect to login with invite redirect
      router.push(`/auth/login?redirect=/invite/${token}`)
      return
    }
    setAccepting(true)
    try {
      const res = await fetch(`/api/invite/${token}/accept`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to accept invite")
      setSuccess(true)
      setTimeout(() => {
        window.location.href = "/dashboard"
      }, 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAccepting(false)
    }
  }

  const ROLE_LABEL: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    manager: "Manager",
    agent: "Agent",
  }

  const ROLE_DESC: Record<string, string> = {
    owner: "Full access to all workspace features and settings",
    admin: "Can manage settings, team, and billing",
    manager: "Can manage contacts, leads, and team conversations",
    agent: "Can reply to inbox and manage assigned conversations",
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="flex items-center justify-center">
              <img src="/image/flowra.png" alt="Flowora Logo" className="h-12 w-auto object-contain scale-[1.3] origin-left" />
            </div>
            <span className="text-[22px] font-black text-foreground">Flowra</span>
          </div>
        </div>

        {loading ? (
          <div className="bg-card text-card-foreground rounded-3xl shadow-xl border border-border/60 p-10 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-[14px] text-muted-foreground">Loading invitation…</p>
          </div>
        ) : error ? (
          <div className="bg-card text-card-foreground rounded-3xl shadow-xl border border-border/60 p-10 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-foreground mb-1">Invite Invalid</h2>
              <p className="text-[14px] text-muted-foreground">{error}</p>
            </div>
            <button
              onClick={() => router.push("/")}
              className="mt-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-all"
            >
              Go Home
            </button>
          </div>
        ) : success ? (
          <div className="bg-card text-card-foreground rounded-3xl shadow-xl border border-border/60 p-10 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-foreground mb-1">You&apos;re in! 🎉</h2>
              <p className="text-[14px] text-muted-foreground">Redirecting you to the dashboard…</p>
            </div>
          </div>
        ) : info ? (
          <div className="bg-card text-card-foreground rounded-3xl shadow-xl border border-border/60 overflow-hidden">
            {/* Header band */}
            <div className="bg-primary/10 border-b border-border/60 px-7 py-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-3">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h1 className="text-[20px] font-bold text-foreground">You&apos;ve been invited!</h1>
              <p className="text-[13px] text-muted-foreground mt-1">
                Join <strong>{info.workspaceName}</strong> on Flowra
              </p>
            </div>

            {/* Details */}
            <div className="px-7 py-6 space-y-4">
              {info.alreadyMember && (
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900/50 rounded-xl px-4 py-3 text-[13px] text-amber-700 dark:text-amber-400">
                  You&apos;re already a member of this workspace.
                </div>
              )}

              {info.label && (
                <div className="text-[13px] text-muted-foreground text-center italic">&ldquo;{info.label}&rdquo;</div>
              )}

              {/* Role card */}
              <div className="bg-muted/30 rounded-xl px-5 py-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Your Role</span>
                  <span className="text-[12px] font-bold bg-primary/15 text-primary px-2.5 py-0.5 rounded-full capitalize">
                    {ROLE_LABEL[info.role] ?? info.role}
                  </span>
                </div>
                <p className="text-[13px] text-muted-foreground">
                  {ROLE_DESC[info.role] ?? "Team member with workspace access"}
                </p>
              </div>

              {info.expiresAt && (
                <p className="text-[12px] text-muted-foreground text-center">
                  Expires {new Date(info.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              )}

              {!user && (
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900/50 rounded-xl px-4 py-3 text-[13px] text-blue-700 dark:text-blue-400">
                  You&apos;ll need to sign in or create an account before joining.
                </div>
              )}

              <button
                onClick={handleAccept}
                disabled={accepting || info.alreadyMember}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-[15px] font-bold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {accepting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Joining…</>
                ) : info.alreadyMember ? (
                  "Already a Member"
                ) : user ? (
                  <>Accept Invitation</>
                ) : (
                  <>Sign In to Accept</>
                )}
              </button>

              <button
                onClick={() => router.push("/")}
                className="w-full py-2.5 text-[14px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
