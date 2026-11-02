"use client";

import {
  Ban,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Play,
  XCircle,
} from "lucide-react";
import StatusBadge from "@/components/cards/status-badge";

type TestRunCardProps = {
  run: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    suite: { id: string; name: string; _count?: { testCases: number } } | null;
    project?: { _count?: { testCases: number } } | null;
    createdAt: string;
    lastExecutedAt?: string | null;
    _count: {
      executions: number;
      executions_by_status: { passed: number; failed: number; blocked: number };
    };
  };
  deleting?: boolean;
  onView: () => void;
  onDelete?: () => void;
};

export default function TestRunCard({
  run,
  deleting = false,
  onView,
  onDelete,
}: TestRunCardProps) {
  const { executions, executions_by_status: results } = run._count;
  const totalCases =
    run.suite?._count?.testCases ??
    run.project?._count?.testCases ??
    executions;
  const passed = results?.passed ?? 0;
  const failed = results?.failed ?? 0;
  const blocked = results?.blocked ?? 0;
  const notRun = Math.max(totalCases - passed - failed - blocked, 0);
  const statusLabel =
    run.status === "Planned"
      ? "Draft"
      : run.status === "InProgress"
        ? "In Progress"
        : run.status;
  const progress = totalCases
    ? Math.min(Math.round((executions / totalCases) * 100), 100)
    : 0;
  const accent =
    run.status === "Completed"
      ? "bg-emerald-500"
      : run.status === "InProgress"
        ? "bg-indigo-500"
        : "bg-slate-300";
  const recordedCases = Math.min(executions, totalCases);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-lg hover:shadow-slate-200/50">
      <div className={`h-1 w-full ${accent}`} />

      <div className="flex flex-1 flex-col p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">
              <Play size={19} fill="currentColor" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Test Run · {run.id.slice(0, 8)}
              </p>
              <h3 className="mt-0.5 line-clamp-2 text-base font-bold text-slate-900">
                {run.name}
              </h3>
            </div>
          </div>
          <StatusBadge status={statusLabel} />
        </header>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            <CircleDashed size={13} />
            {run.suite?.name || "Project run"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
            <CheckCircle2 size={13} className="text-emerald-600" />
            {progress}% complete
          </span>
        </div>

        <p className="mt-4 min-h-[40px] line-clamp-2 text-sm leading-5 text-slate-500">
          {run.description || "No description provided."}
        </p>

        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                Execution progress
              </p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">
                {recordedCases}{" "}
                <span className="font-medium text-slate-400">
                  / {totalCases} cases
                </span>
              </p>
            </div>
            <span className="text-sm font-bold text-indigo-600">
              {progress}%
            </span>
          </div>

          <div
            className="flex h-2 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-label="Test run execution progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            {totalCases > 0 && (
              <>
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${(passed / totalCases) * 100}%` }}
                />
                <div
                  className="h-full bg-red-500"
                  style={{ width: `${(failed / totalCases) * 100}%` }}
                />
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${(blocked / totalCases) * 100}%` }}
                />
              </>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-4 gap-2">
            <div className="text-center">
              <dt className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                <CheckCircle2 size={12} className="text-emerald-600" />
                Passed
              </dt>
              <dd className="mt-1 text-sm font-bold text-emerald-700">
                {passed}
              </dd>
            </div>
            <div className="text-center">
              <dt className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                <XCircle size={12} className="text-red-600" />
                Failed
              </dt>
              <dd className="mt-1 text-sm font-bold text-red-700">{failed}</dd>
            </div>
            <div className="text-center">
              <dt className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                <Ban size={12} className="text-amber-600" />
                Blocked
              </dt>
              <dd className="mt-1 text-sm font-bold text-amber-700">
                {blocked}
              </dd>
            </div>
            <div className="text-center">
              <dt className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                <Clock3 size={12} className="text-slate-400" />
                Not run
              </dt>
              <dd className="mt-1 text-sm font-bold text-slate-700">
                {notRun}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-4 mt-5 text-xs text-slate-400">
          <CalendarDays size={14} className="shrink-0" />
          <span className="truncate">
            {run.lastExecutedAt
              ? `Executed ${new Date(run.lastExecutedAt).toLocaleDateString()}`
              : `Created ${new Date(run.createdAt).toLocaleDateString()}`}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onView}
            className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            View Results
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="flex min-h-10 items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function TestRunCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading test run"
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white"
    >
      <div className="h-1 bg-slate-200" />
      <div className="animate-pulse p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-1 items-center gap-3">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-slate-100" />
            <div className="flex-1">
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="mt-2 h-4 w-3/4 rounded bg-slate-100" />
            </div>
          </div>
          <div className="h-6 w-20 rounded-full bg-slate-100" />
        </div>
        <div className="mt-5 flex gap-2">
          <div className="h-6 w-24 rounded-lg bg-slate-100" />
          <div className="h-6 w-20 rounded-lg bg-slate-100" />
        </div>
        <div className="mt-5 h-4 w-full rounded bg-slate-100" />
        <div className="mt-2 h-4 w-2/3 rounded bg-slate-100" />
        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
          <div className="h-4 w-2/3 rounded bg-slate-100" />
          <div className="mt-4 h-2 rounded-full bg-slate-100" />
          <div className="mt-5 grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-8 rounded bg-slate-100" />
            ))}
          </div>
        </div>
        <div className="mt-5 h-10 rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}
