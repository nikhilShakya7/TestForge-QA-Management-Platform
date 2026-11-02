"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { USER_ROLES, type UserRole } from "@/lib/roles";

type ManagedUser = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
};
type Invitation = {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: string;
  createdAt: string;
};
type UserManagementResponse = {
  users: ManagedUser[];
  invitations: Invitation[];
};
type CreatedInvitation = { email: string; inviteUrl: string; expiresAt: string };

const roles: UserRole[] = [...USER_ROLES];
const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  PROJECT_ADMIN: "Project Admin",
  QA_TESTER: "QA Tester",
  VIEWER: "Viewer",
};

export default function UserManagementContent() {
  const router = useRouter();
  const [data, setData] = useState<UserManagementResponse>({
    users: [],
    invitations: [],
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "">("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("QA_TESTER");
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null);
  const [deleteInvitation, setDeleteInvitation] = useState<Invitation | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/users", {
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (response.status === 401) {
        router.replace("/auth/login");
        return;
      }

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to load user management data");
      }

      setData(body as UserManagementResponse);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load user management data"
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void Promise.resolve().then(fetchUsers);
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.users.filter((user) => {
      const matchesSearch =
        !query ||
        user.email.toLowerCase().includes(query) ||
        (user.name ?? "").toLowerCase().includes(query);
      return (
        matchesSearch &&
        (!roleFilter || user.role === roleFilter) &&
        (!statusFilter || (statusFilter === "active" ? user.isActive : !user.isActive))
      );
    });
  }, [data.users, roleFilter, search, statusFilter]);

  const updateUser = async (
    user: ManagedUser,
    change: { role?: UserRole; isActive?: boolean }
  ) => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to update user");
      setData((current) => ({
        ...current,
        users: current.users.map((item) =>
          item.id === body.user.id ? body.user : item
        ),
      }));
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Failed to update user"
      );
      await fetchUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const createInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setCreatedInvitation(null);
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to create invitation");

      setCreatedInvitation({
        email: body.invitation.email,
        inviteUrl: body.inviteUrl,
        expiresAt: body.invitation.expiresAt,
      });
      setInviteEmail("");
      await fetchUsers();
    } catch (inviteError) {
      setError(
        inviteError instanceof Error ? inviteError.message : "Failed to create invitation"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const cancelInvitation = async () => {
    if (!deleteInvitation) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/invitations", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteInvitation.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to cancel invitation");
      setData((current) => ({
        ...current,
        invitations: current.invitations.filter(
          (invitation) => invitation.id !== deleteInvitation.id
        ),
      }));
      setDeleteInvitation(null);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : "Failed to cancel invitation"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copyInvitationLink = async () => {
    if (!createdInvitation) return;
    try {
      await navigator.clipboard.writeText(createdInvitation.inviteUrl);
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? `Could not copy invitation link: ${copyError.message}`
          : "Could not copy invitation link"
      );
    }
  };

  const activeCount = data.users.filter((user) => user.isActive).length;
  const inactiveCount = data.users.length - activeCount;

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-900 md:p-8">
      <header className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="mt-2 text-sm text-slate-500">
          Manage workspace roles, account access, and invitations.
        </p>
      </header>

      {error && (
        <div role="alert" className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-semibold">
            Dismiss
          </button>
        </div>
      )}

      <section className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          ["Total users", data.users.length],
          ["Active", activeCount],
          ["Inactive", inactiveCount],
        ].map(([label, count]) => (
          <article key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold">{count}</p>
          </article>
        ))}
      </section>

      <section className="mb-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Invite a user</h2>
        <p className="mt-1 text-sm text-slate-500">
          Create a link that can be copied and shared. It expires after seven days.
        </p>
        <form onSubmit={createInvitation} className="mt-4 grid grid-cols-1 items-end gap-3 md:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Role
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value as UserRole)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              {(["PROJECT_ADMIN", "QA_TESTER", "VIEWER"] as const).map((role) => (
                <option key={role} value={role}>{roleLabels[role]}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create invite link"}
          </button>
        </form>

        {createdInvitation && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">
              Invitation link created for {createdInvitation.email}
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={createdInvitation.inviteUrl}
                aria-label="Invitation link"
                className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void copyInvitationLink()}
                className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Copy link
              </button>
            </div>
            <p className="mt-2 text-xs text-emerald-700">
              Expires {new Date(createdInvitation.expiresAt).toLocaleString()}.
            </p>
          </div>
        )}
      </section>

      <section className="mb-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Users</h2>
            <p className="mt-1 text-sm text-slate-500">
              Role changes apply to API access immediately. Affected users may need to refresh to update navigation.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="search"
              placeholder="Search name or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as UserRole | "")}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              {roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-44 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No users match these filters.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredUsers.map((user) => (
              <article key={user.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{user.name || user.email}</p>
                    <p className="truncate text-sm text-slate-500">{user.email}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Joined {new Date(user.createdAt).toLocaleDateString()}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.email}</label>
                  <select
                    id={`role-${user.id}`}
                    value={roles.includes(user.role) ? user.role : "QA_TESTER"}
                    disabled={submitting || !user.isActive}
                    onChange={(event) => void updateUser(user, { role: event.target.value as UserRole })}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-60"
                  >
                    {roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                  </select>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void updateUser(user, { isActive: !user.isActive })}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60 ${user.isActive ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                  >
                    {user.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Pending invitations</h2>
        {data.invitations.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No pending invitations.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {data.invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{invitation.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {roleLabels[invitation.role]}
                    {" · Expires "}{new Date(invitation.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setDeleteInvitation(invitation)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        isOpen={deleteInvitation !== null}
        onConfirm={() => void cancelInvitation()}
        onCancel={() => setDeleteInvitation(null)}
        title="Revoke invitation"
        message={`Revoke the pending invitation for "${deleteInvitation?.email ?? ""}"? Its link will stop working.`}
        confirmText="Revoke invitation"
        danger
      />
    </main>
  );
}
