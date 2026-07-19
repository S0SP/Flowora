"use client";

import { useState, useEffect, useCallback } from "react";
import {
  UserPlus, Search, MoreHorizontal, Check, X, Shield, Users,
  MessageCircle, Clock, Loader2, Crown, RefreshCw, Trash2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

type Role = "owner" | "admin" | "manager" | "agent";
type Status = "active" | "inactive" | "invited" | "suspended";

type Member = {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string | null;
  role: Role;
  status: Status;
  avatar_url: string | null;
  monthly_credit_limit: number | null;
  max_concurrent_chats: number;
  chats_today: number;
  assigned_chats: number;
  last_seen_at: string | null;
  created_at: string;
};

const ROLE_CONFIG: Record<Role, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  owner: { label: "Owner", bg: "bg-amber-100", text: "text-amber-700", icon: Crown },
  admin: { label: "Admin", bg: "bg-[#1B1B1B]", text: "text-[#FFE27C]", icon: Shield },
  manager: { label: "Manager", bg: "bg-purple-100", text: "text-purple-700", icon: Users },
  agent: { label: "Agent", bg: "bg-green-100", text: "text-green-700", icon: MessageCircle },
};

const STATUS_DOT: Record<Status, string> = {
  active: "bg-green-500",
  inactive: "bg-gray-400",
  invited: "bg-amber-400",
  suspended: "bg-red-500",
};

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(" ");
    return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  }
  return email[0]?.toUpperCase() ?? "?";
}

function MemberAvatar({ member }: { member: Member }) {
  if (member.avatar_url) {
    return <img src={member.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />;
  }
  const initials = getInitials(member.full_name, member.email);
  const colors = ["from-primary/80 to-primary", "from-purple-400 to-purple-600", "from-blue-400 to-blue-600", "from-green-400 to-green-600"];
  const color = colors[member.email.charCodeAt(0) % colors.length];
  return (
    <div className={cn("w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-sm font-bold text-white", color)}>
      {initials.toUpperCase()}
    </div>
  );
}

function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"agent" | "manager" | "admin">("agent");
  const [creditLimit, setCreditLimit] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, full_name: name, role, monthly_credit_limit: creditLimit ? parseInt(creditLimit) : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to invite");
      toast.success(`Invitation sent to ${email}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#18181B] border border-border dark:border-[#27272A] rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[18px] font-bold dark:text-white">Invite Team Member</h2>
            <p className="text-[13px] text-gray-500 dark:text-gray-400">They'll receive an email to join your workspace</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg"><X className="h-5 w-5 text-gray-500 dark:text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium mb-1.5 dark:text-gray-200">Full Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" required
              className="w-full border border-border dark:border-[#27272A] bg-white dark:bg-[#111114] text-gray-900 dark:text-white rounded-lg px-3 py-2.5 text-[14px] focus:ring-1 focus:ring-primary outline-none" />
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1.5 dark:text-gray-200">Email Address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com" required
              className="w-full border border-border dark:border-[#27272A] bg-white dark:bg-[#111114] text-gray-900 dark:text-white rounded-lg px-3 py-2.5 text-[14px] focus:ring-1 focus:ring-primary outline-none" />
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1.5 dark:text-gray-200">Role</label>
            <div className="grid grid-cols-3 gap-2">
              {(["agent", "manager", "admin"] as const).map(r => {
                const cfg = ROLE_CONFIG[r];
                const Icon = cfg.icon;
                return (
                  <button key={r} type="button" onClick={() => setRole(r)}
                    className={cn("flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-[12px] font-medium transition-all",
                      role === r ? "border-primary bg-primary/5 dark:bg-primary/10 text-primary" : "border-border dark:border-[#27272A] text-gray-500 dark:text-gray-400 hover:border-primary/30 dark:hover:border-primary/50"
                    )}>
                    <Icon className="h-4 w-4" />{cfg.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1.5 dark:text-gray-200">Monthly Credit Limit <span className="text-gray-500 dark:text-gray-400">(optional)</span></label>
            <input type="number" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder="Leave blank for unlimited"
              className="w-full border border-border dark:border-[#27272A] bg-white dark:bg-[#111114] text-gray-900 dark:text-white rounded-lg px-3 py-2.5 text-[14px] focus:ring-1 focus:ring-primary outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-border dark:border-[#27272A] rounded-lg py-2.5 text-[14px] font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-primary text-primary-foreground rounded-lg py-2.5 text-[14px] font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}Send Invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamAgentsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"All" | Role>("All");
  const [showInvite, setShowInvite] = useState(false);
  const [actionMemberId, setActionMemberId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMembers(data.members ?? []);
    } catch {
      toast.error("Failed to load team");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMembers(); }, []);

  const filtered = members.filter(m => {
    const s = search.toLowerCase();
    const matchSearch = (m.full_name ?? "").toLowerCase().includes(s) || m.email.toLowerCase().includes(s);
    const matchRole = roleFilter === "All" || m.role === roleFilter;
    return matchSearch && matchRole;
  });

  const statsData = [
    { icon: Users, label: "Total Members", value: members.length },
    { icon: Check, label: "Active", value: members.filter(m => m.status === "active").length, color: "text-green-600" },
    { icon: Clock, label: "Pending Invites", value: members.filter(m => m.status === "invited").length, color: "text-amber-600" },
    { icon: MessageCircle, label: "Avg Chats / Day", value: members.length > 0 ? Math.round(members.reduce((s, m) => s + m.chats_today, 0) / members.length) : 0 },
  ];

  async function handleUpdateRole(member: Member, newRole: Role) {
    setUpdatingId(member.id);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, role: newRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Role updated");
      fetchMembers();
    } catch (err: any) { toast.error(err.message); }
    finally { setUpdatingId(null); setActionMemberId(null); }
  }

  async function handleRemove(member: Member) {
    if (!confirm(`Remove ${member.full_name ?? member.email}?`)) return;
    setUpdatingId(member.id);
    try {
      const res = await fetch(`/api/team?memberId=${member.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Member removed");
      fetchMembers();
    } catch (err: any) { toast.error(err.message); }
    finally { setUpdatingId(null); }
  }

  const matrix = [
    ["View Shared Inbox", true, true, true],
    ["Reply to Conversations", true, true, true],
    ["Assign Conversations", false, true, true],
    ["Manage Campaigns", false, true, true],
    ["Workflow Builder", false, true, true],
    ["View Analytics", false, true, true],
    ["Knowledge Hub", false, true, true],
    ["Manage Integrations", false, false, true],
    ["Team Management", false, false, true],
    ["Billing & Credits", false, false, true],
    ["Voice Agent Config", false, false, true],
  ];

  return (
    <div className="flex flex-col h-full flex-1 bg-[#FAFAF8] dark:bg-black p-6 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Team & Agents</h1>
          <p className="text-[14px] text-gray-500 dark:text-gray-400 mt-0.5">Manage members, roles, and agent performance</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members..."
              className="w-[220px] pl-9 pr-3 py-2 border border-border dark:border-[#27272A] rounded-lg bg-white dark:bg-[#111114] text-gray-900 dark:text-white text-[13px] focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          {(["All", "owner", "admin", "manager", "agent"] as const).map(r => (
            <button key={r} onClick={() => setRoleFilter(r as any)}
              className={cn("px-3 py-2 rounded-lg text-[13px] font-medium transition-all hidden sm:block",
                roleFilter === r ? "bg-foreground dark:bg-white text-background dark:text-black" : "bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              )}>
              {r === "All" ? "All" : ROLE_CONFIG[r as Role].label}
            </button>
          ))}
          <button onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-[14px] hover:bg-primary/90 shadow-sm">
            <UserPlus className="h-4 w-4" /> Invite Member
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {statsData.map((s, i) => (
          <div key={i} className="bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center">
              <s.icon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">{s.label}</p>
              <p className={cn("text-[22px] font-bold", s.color ?? "text-gray-900 dark:text-white")}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border dark:border-[#27272A]">
          <span className="text-[13px] text-gray-500 dark:text-gray-400">{filtered.length} members</span>
          <button onClick={fetchMembers} className="flex items-center gap-1 text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </button>
        </div>
        <table className="w-full">
          <thead className="bg-[#FAFAF8] dark:bg-white/5 border-b border-border dark:border-[#27272A]">
            <tr>
              {["Member", "Role", "Status", "Assigned", "Chats Today", "Actions"].map(h => (
                <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border dark:divide-[#27272A]">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-500 dark:text-gray-400" />
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-[13px]">No members — <button onClick={() => setShowInvite(true)} className="text-primary hover:underline">invite someone</button></p>
              </td></tr>
            ) : filtered.map(member => {
              const rc = ROLE_CONFIG[member.role];
              const RIcon = rc.icon;
              const isUpdating = updatingId === member.id;
              return (
                <tr key={member.id} className="hover:bg-gray-100/20 dark:hover:bg-white/5 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <MemberAvatar member={member} />
                      <div>
                        <p className="text-[14px] font-semibold text-gray-900 dark:text-white">{member.full_name ?? member.email}</p>
                        <p className="text-[12px] text-gray-500 dark:text-gray-400">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold", rc.bg, rc.text)}>
                      <RIcon className="h-3.5 w-3.5" />{rc.label}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-full", STATUS_DOT[member.status])} />
                      <span className="text-[13px] capitalize dark:text-gray-300">{member.status}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[14px] text-gray-900 dark:text-white">{member.assigned_chats}</td>
                  <td className="px-5 py-4 text-[14px] text-gray-900 dark:text-white">{member.chats_today}</td>
                  <td className="px-5 py-4">
                    {isUpdating ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-500 dark:text-gray-400" />
                    ) : member.role !== "owner" ? (
                      <div className="relative">
                        <button onClick={() => setActionMemberId(actionMemberId === member.id ? null : member.id)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {actionMemberId === member.id && (
                          <div className="absolute right-0 top-8 z-20 bg-white dark:bg-[#18181B] border border-border dark:border-[#27272A] rounded-xl shadow-xl w-48 py-1 text-[13px]">
                            {(["agent", "manager", "admin"] as const).filter(r => r !== member.role).map(r => (
                              <button key={r} onClick={() => handleUpdateRole(member, r)}
                                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/5 text-gray-900 dark:text-white">
                                Set as {ROLE_CONFIG[r].label}
                              </button>
                            ))}
                            <div className="border-t border-border dark:border-[#27272A] my-1" />
                            <button onClick={() => handleRemove(member)}
                              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400">
                              <Trash2 className="h-3.5 w-3.5" />Remove
                            </button>
                          </div>
                        )}
                      </div>
                    ) : <span className="text-[12px] text-gray-500 dark:text-gray-400">Owner</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Permissions matrix */}
      <div className="bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border dark:border-[#27272A]">
          <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">Role Permissions</h3>
        </div>
        <table className="w-full">
          <thead className="bg-[#FAFAF8] dark:bg-white/5 border-b border-border dark:border-[#27272A]">
            <tr>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Permission</th>
              {["Agent", "Manager", "Admin"].map(r => (
                <th key={r} className="px-5 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase text-center">{r}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border dark:divide-[#27272A]">
            {matrix.map(([perm, agent, manager, admin], i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white dark:bg-transparent" : "bg-[#FAFAF8] dark:bg-white/5"}>
                <td className="px-5 py-3 text-[13px] text-gray-900 dark:text-white">{perm as string}</td>
                {[agent, manager, admin].map((has, j) => (
                  <td key={j} className="px-5 py-3 text-center">
                    {has ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-gray-500/40 dark:text-gray-500 mx-auto" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onSuccess={fetchMembers} />}
      {actionMemberId && <div className="fixed inset-0 z-10" onClick={() => setActionMemberId(null)} />}
    </div>
  );
}

