"use client";

import {
  FolderKanban,
  FlaskConical,
  Play,
  Bug,
  TrendingUp,
  CalendarDays,
  ArrowUpRight,
  Pencil,
  Archive,
  RotateCcw,
  Users,
} from "lucide-react";

import StatusBadge from "@/components/cards/status-badge";

type ProjectCardProps = {
  project: {
    id: string;
    name: string;
    key: string;
    description: string | null;
    status: string;
    passRate: number;
    createdAt: string;
    _count: { testCases: number; testRuns: number; defects: number };
  };
  onOpen: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onManageMembers: () => void;
  canManageMembers: boolean;
};

export default function ProjectCard({
  project,
  onOpen,
  onEdit,
  onArchive,
  onManageMembers,
  canManageMembers,
}: ProjectCardProps) {
  const metrics = [
    {
      label: "Test Cases",
      value: project._count.testCases,
      icon: FlaskConical,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Test Runs",
      value: project._count.testRuns,
      icon: Play,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      label: "Pass Rate",
      value: `${project.passRate}%`,
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Defects",
      value: project._count.defects,
      icon: Bug,
      color: "text-rose-600",
      bg: "bg-rose-50",
    },
  ];

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-lg hover:shadow-slate-200/50">
      {/* Top accent */}
      <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-500" />

      <div className="flex flex-1 flex-col p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
              <FolderKanban size={21} />
            </div>

            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                {project.key}
              </p>
              <h3 className="mt-0.5 truncate text-base font-bold text-slate-900">
                {project.name}
              </h3>
            </div>
          </div>

          <StatusBadge status={project.status} />
        </div>

        {/* Description */}
        <p className="mt-4 min-h-[40px] text-sm leading-5 text-slate-500 line-clamp-2">
          {project.description || "No project description provided."}
        </p>

        {/* Metrics */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;

            return (
              <div
                key={metric.label}
                className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition-colors hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-lg ${metric.bg} ${metric.color}`}
                  >
                    <Icon size={14} />
                  </div>
                  <span className="text-xs font-medium text-slate-500">
                    {metric.label}
                  </span>
                </div>

                <p className="mt-3 text-xl font-bold tracking-tight text-slate-900">
                  {metric.value}
                </p>

                {metric.label === "Pass Rate" && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(0, project.passRate))}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer information */}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <CalendarDays size={14} />
          <span>
            Created {new Date(project.createdAt).toLocaleDateString()}
          </span>
        </div>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-4 mt-5">
          <button
            type="button"
            onClick={onOpen}
            className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-indigo-700 active:scale-[0.98]"
          >
            Open Project
            <ArrowUpRight size={15} />
          </button>

          <button
            type="button"
            onClick={onEdit}
            title={
              project.status === "ARCHIVED" ? "Restore project" : "Edit project"
            }
            aria-label={
              project.status === "ARCHIVED" ? "Restore project" : "Edit project"
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
          >
            {project.status === "ARCHIVED" ? (
              <RotateCcw size={16} />
            ) : (
              <Pencil size={16} />
            )}
          </button>

          {canManageMembers && (
            <button
              type="button"
              onClick={onManageMembers}
              title="Manage project members"
              aria-label="Manage project members"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
            >
              <Users size={16} />
            </button>
          )}

          {project.status !== "ARCHIVED" && (
            <button
              type="button"
              onClick={onArchive}
              title="Archive project"
              aria-label="Archive project"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            >
              <Archive size={16} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
