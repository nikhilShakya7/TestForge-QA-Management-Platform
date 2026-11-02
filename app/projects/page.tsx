"use client";

import { useEffect, useState, useCallback } from "react";
import ProjectCard from "@/components/cards/project-card";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { X } from "lucide-react";

type Project = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  status: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  passRate: number;
  createdBy: { id: string; name: string | null; email: string } | null;
  _count: { testCases: number; testRuns: number; defects: number };
};

type ProjectResponse = {
  data: Project[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
};

type ProjectMember = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  projectRole: string;
  joinedAt: string;
};

type AvailableUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ProjectResponse["meta"] | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  

  // Check user role
  const [user, setUser] = useState<{ role: string; name: string | null; email: string } | null>(null);

  useEffect(() => {
    async function fetchCurrentUser() {
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setUser({ role: data.user.role, name: data.user.name, email: data.user.email });
        }
      } catch (error) {
        console.error("Failed to check user role:", error);
      }
    }
    fetchCurrentUser();
  }, []);

const statuses = ["ACTIVE", "ARCHIVED"];

  // Create form state
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<{
    name: string;
    key: string;
    description: string;
    status: "ACTIVE" | "ARCHIVED";
  }>({
    name: "",
    key: "",
    description: "",
    status: "ACTIVE",
  });

  // Edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    key: string;
    description: string;
    status: "ACTIVE" | "ARCHIVED";
  }>({
    name: "",
    key: "",
    description: "",
    status: "ACTIVE",
  });

  // Submitting states
  const [creatingSubmitting, setCreatingSubmitting] = useState(false);
  const [editingSubmitting, setEditingSubmitting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [memberProject, setMemberProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedProjectRole, setSelectedProjectRole] = useState("QA_TESTER");
  const [canAssignProjectAdmin, setCanAssignProjectAdmin] = useState(false);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterStatus) params.set("status", filterStatus);
      params.set("page", "1");
      params.set("pageSize", "50");

      const res = await fetch(`/api/projects?${params.toString()}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error("Failed to load projects");
      }

      const json: ProjectResponse = await res.json();
      setProjects(json.data);
      setMeta(json.meta);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus]);

  useEffect(() => {
    let active = true;

    async function fetchCurrentUser() {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = await response.json();
        if (active) setUserRole(body.user.role);
      } catch (fetchError) {
        console.error("Failed to load current user role:", fetchError);
      }
    }

    void fetchCurrentUser();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const openMembers = async (project: Project) => {
    setMemberProject(project);
    setMemberLoading(true);
    setMemberError(null);
    setMembers([]);
    setAvailableUsers([]);

    try {
      const response = await fetch(`/api/projects/${project.id}/members`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to load project members");
      setMembers(body.members);
      setAvailableUsers(body.availableUsers);
      setCanAssignProjectAdmin(body.canAssignProjectAdmin);
    } catch (fetchError) {
      setMemberError(
        fetchError instanceof Error ? fetchError.message : "Failed to load project members"
      );
    } finally {
      setMemberLoading(false);
    }
  };

  const addProjectMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!memberProject || !selectedUserId) return;
    setMemberSubmitting(true);
    setMemberError(null);

    try {
      const response = await fetch(`/api/projects/${memberProject.id}/members`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          role: selectedProjectRole,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to add project member");

      setMembers((current) => [
        ...current.filter((member) => member.id !== body.member.id),
        body.member,
      ]);
      setAvailableUsers((current) =>
        current.filter((candidate) => candidate.id !== body.member.id)
      );
      setSelectedUserId("");
    } catch (submitError) {
      setMemberError(
        submitError instanceof Error ? submitError.message : "Failed to add project member"
      );
    } finally {
      setMemberSubmitting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreatingSubmitting(true);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name,
          key: createForm.key.toUpperCase(),
          description: createForm.description || undefined,
          status: createForm.status,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        setCreateError(errorBody.error || "Failed to create project");
        setCreatingSubmitting(false);
        return;
      }

      const newProject = await res.json();
      setProjects((prev) => [newProject, ...prev]);
      setCreating(false);
      setCreateForm({ name: "", key: "", description: "", status: "ACTIVE" });
      setCreateError(null);
      await fetchProjects();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project");
      setCreatingSubmitting(false);
    } finally {
      setCreatingSubmitting(false);
    }
  };

  const openEdit = (project: Project) => {
    setEditForm({
      name: project.name,
      key: project.key,
      description: project.description || "",
      status: project.status as "ACTIVE" | "ARCHIVED",
    });
    setEditingId(project.id);
    setEditError(null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setEditError(null);
    setEditingSubmitting(true);

    try {
      const res = await fetch(`/api/projects/${editingId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          key: editForm.key.toUpperCase(),
          description: editForm.description || undefined,
          status: editForm.status,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json();
        setEditError(errorBody.error || "Failed to update project");
        setEditingSubmitting(false);
        return;
      }

      const updated = await res.json();
      setProjects((prev) =>
        prev.map((p) => (p.id === editingId ? updated : p))
      );
      setEditingId(null);
      setEditError(null);
      await fetchProjects();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update project");
      setEditingSubmitting(false);
    } finally {
      setEditingSubmitting(false);
    }
  };

  const handleArchive = (id: string, name: string) => {
    setArchiveTarget({ id, name });
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    const { id } = archiveTarget;
    setArchiveTarget(null);
    setArchivingId(id);

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const errorBody = await res.json();
        setError(errorBody.error || "Failed to archive project");
        setArchivingId(null);
        return;
      }

      setProjects((prev) => prev.filter((p) => p.id !== id));
      setArchivingId(null);
      await fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive project");
      setArchivingId(null);
    }
  };

  const openProject = (project: Project) => {
    localStorage.setItem("testforge_projectId", project.id);
    window.location.href = `/test-cases?projectId=${encodeURIComponent(project.id)}`;
  };
  const canManageMembers =
    userRole === "SUPER_ADMIN" || userRole === "PROJECT_ADMIN";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="min-w-0 flex-1 p-5 md:p-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage your testing projects. Each project has its own test cases,
              test runs, and defects.
            </p>
          </div>

          <button
            onClick={() => setCreating(!creating)}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            {user?.role !== "QA_TESTER" && user?.role !== "VIEWER" ? (creating ? "Cancel" : "+ New Project") : "Manage projects"}
          </button>
        </header>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Create project form */}
        {creating && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Create New Project</h3>
            {createError && (
              <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                {createError}
              </div>
            )}
            <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Project Name
                </label>
                <input
                  name="name"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                  className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Project Key (e.g. ECM)
                </label>
                <input
                  name="key"
                  value={createForm.key}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, key: e.target.value.toUpperCase() })
                  }
                  className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm uppercase focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  required
                  maxLength={10}
                />
                <p className="mt-1 text-xs text-slate-400">
                  Short unique identifier (uppercase, letters and numbers only)
                </p>
              </div>
              <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, description: e.target.value })
                  }
                  rows={3}
                  className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={createForm.status}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, status: e.target.value as "ACTIVE" | "ARCHIVED" })
                  }
                  className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-1 sm:col-span-2 lg:col-span-3 flex items-end">
                <button
                  type="submit"
                  disabled={creatingSubmitting}
                  className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    creatingSubmitting
                      ? "bg-slate-400 text-slate-200"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {creatingSubmitting ? "Creating…" : "Create Project"}
                </button>
              </div>
              <div className="col-span-1 sm:col-span-2 lg:col-span-3 flex items-end">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="w-full rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search & Filters */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name, key, or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No projects found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => openProject(project)}
                onEdit={() => openEdit(project)}
                onArchive={() => void handleArchive(project.id, project.name)}
                onManageMembers={() => void openMembers(project)}
                canManageMembers={canManageMembers}
              />
            ))}
          </div>
        )}

        {meta && (
          <p className="mt-4 text-xs text-slate-400">
            Showing {projects.length} of {meta.total} projects
          </p>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">
          TestForge · QA Management Platform
        </p>
      </section>
      {memberProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMemberProject(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-members-title"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 id="project-members-title" className="text-lg font-semibold">
                  Project members
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {memberProject.name} · {memberProject.key}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMemberProject(null)}
                aria-label="Close project members"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </header>

            {memberError && (
              <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {memberError}
              </p>
            )}

            {memberLoading ? (
              <p className="mt-5 text-sm text-slate-500">Loading project members…</p>
            ) : (
              <>
                <form onSubmit={addProjectMember} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                  <label className="text-sm font-medium text-slate-700">
                    Existing user
                    <select
                      required
                      value={selectedUserId}
                      onChange={(event) => setSelectedUserId(event.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="">Select a user</option>
                      {availableUsers.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name ? `${candidate.name} · ` : ""}{candidate.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Project role
                    <select
                      value={selectedProjectRole}
                      onChange={(event) => setSelectedProjectRole(event.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    >
                      {canAssignProjectAdmin && (
                        <option value="PROJECT_ADMIN">Project Admin</option>
                      )}
                      <option value="QA_TESTER">QA Tester</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={memberSubmitting || !availableUsers.length}
                    className="self-end rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {memberSubmitting ? "Adding…" : "Add member"}
                  </button>
                </form>

                {availableUsers.length === 0 && (
                  <p className="mt-3 text-xs text-slate-500">
                    There are no other active users available to add.
                  </p>
                )}

                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Current members ({members.length})
                  </h3>
                  {members.length ? (
                    <ul className="mt-3 divide-y divide-slate-100">
                      {members.map((member) => (
                        <li key={member.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {member.name || member.email}
                            </p>
                            <p className="truncate text-xs text-slate-500">{member.email}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                            {member.projectRole.replaceAll("_", " ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No members added yet.</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
      <ConfirmDialog
        isOpen={archiveTarget !== null}
        onConfirm={() => void confirmArchive()}
        onCancel={() => setArchiveTarget(null)}
        title="Archive Project"
        message={`Archive project "${archiveTarget?.name ?? ""}"? This cannot be undone if the project has test cases, test runs, or defects.`}
        confirmText="Archive"
        danger
      />
    </main>
  );
}
