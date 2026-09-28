import { buttonVariants } from "@autumn/ui/components/ui/button";
import { PlayIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import type { RunSummary } from "../../../src/api/contract.ts";
import { type RunsFilter, useRuns } from "../api/hooks.ts";
import { useLiveTopics } from "../api/live.ts";
import { RunLabel } from "../components/runLabel.tsx";
import {
	Actor,
	ErrorCallout,
	Pill,
	RunProgress,
	RunStatusBadge,
} from "../components/status.tsx";
import {
	DataTable,
	PageHeader,
	SearchInput,
	SectionTag,
	Segmented,
} from "../components/ui.tsx";
import { cn, elapsed, num, timeAgo } from "../lib/format.ts";
import { useNow } from "../lib/useNow.ts";

const FINISHED_FILTERS = ["all", "passed", "failed", "cancelled"] as const;
type FinishedFilter = (typeof FINISHED_FILTERS)[number];

const selectionLabel = (run: RunSummary) => {
	const { groups, files, grep } = run.selection;
	const parts = [
		...(groups ?? []),
		files?.length
			? `${files.length} file${files.length === 1 ? "" : "s"}`
			: null,
		grep ? `grep "${grep}"` : null,
	].filter(Boolean);
	return parts.join(" · ") || "—";
};

const runColumns = (now: number): ColumnDef<RunSummary>[] => [
	{
		id: "branch",
		header: "Branch",
		size: 260,
		meta: { grow: true },
		cell: ({ row: { original: run } }) => (
			<div className="flex min-w-0 items-center gap-2 pr-4">
				<RunLabel run={run} />
				{run.purpose === "baseline" && (
					<Pill tone="info" className="shrink-0">
						baseline
					</Pill>
				)}
			</div>
		),
	},
	{
		id: "tests",
		header: "Tests",
		size: 180,
		cell: ({ row: { original: run } }) => (
			<span className="block truncate text-tiny-id text-tertiary-foreground">
				{selectionLabel(run)}
			</span>
		),
	},
	{
		id: "status",
		header: "Status",
		size: 130,
		cell: ({ row: { original: run } }) => (
			<RunStatusBadge status={run.status} />
		),
	},
	{
		id: "progress",
		header: "Progress",
		size: 220,
		cell: ({ row: { original: run } }) => {
			const total = run.fileCount ?? 0;
			return (
				<div className="flex items-center gap-2.5">
					<RunProgress
						className="w-16 shrink-0"
						passed={run.passed}
						failed={run.failed}
						total={total}
					/>
					<span className="text-xs text-subtle tabular-nums">
						<span
							className={cn(run.passed && "text-green-600 dark:text-green-500")}
						>
							{num(run.passed)}
						</span>
						{run.failed > 0 && (
							<span className="text-red-600 dark:text-red-400">
								{" "}
								· {num(run.failed)}
							</span>
						)}{" "}
						/ {total ? num(total) : "—"}
					</span>
				</div>
			);
		},
	},
	{
		id: "by",
		header: "Started by",
		size: 150,
		cell: ({ row: { original: run } }) => (
			<Actor actor={run.createdBy} compact />
		),
	},
	{
		id: "elapsed",
		header: "Elapsed",
		size: 90,
		cell: ({ row: { original: run } }) => (
			<span className="text-xs tabular-nums">
				{elapsed({
					from: run.startedAt ?? run.createdAt,
					to: run.finishedAt,
					now,
				})}
				{!run.finishedAt && run.workerCount ? (
					<span className="text-subtle"> · {run.workerCount}w</span>
				) : null}
			</span>
		),
	},
	{
		id: "created",
		header: "Created",
		size: 90,
		cell: ({ row: { original: run } }) => (
			<span className="text-xs text-subtle tabular-nums">
				{timeAgo(run.createdAt, now)}
			</span>
		),
	},
];

export const RunsScreen = () => {
	const [params, setParams] = useSearchParams();
	const branch = params.get("branch") ?? "";
	const finishedFilter = (params.get("status") ?? "all") as FinishedFilter;
	const filter: RunsFilter = { status: "live", branch: branch || undefined };
	const live = useRuns(filter);
	const finished = useRuns({ ...filter, status: "finished" });
	const now = useNow();
	useLiveTopics("runs");

	const setParam = (key: string, value: string) => {
		const next = new URLSearchParams(params);
		if (value && value !== "all") next.set(key, value);
		else next.delete(key);
		setParams(next, { replace: true });
	};

	const finishedRuns = finished.data?.filter(
		(r) =>
			finishedFilter === "all" ||
			r.status === finishedFilter ||
			(finishedFilter === "failed" && r.status === "errored"),
	);
	const columns = runColumns(now);
	const href = (run: RunSummary) => `/runs/${run.id}`;

	return (
		<>
			<PageHeader icon={<PlayIcon size={16} weight="fill" />} title="Runs">
				<Link to="/runs/new" className={buttonVariants({ variant: "primary" })}>
					<span className="relative z-10 inline-flex items-center gap-2">
						<Plus className="size-3.5" /> New run
					</span>
				</Link>
			</PageHeader>
			<div className="flex flex-wrap items-center gap-2 pb-4">
				<SearchInput
					value={branch}
					onChange={(v) => setParam("branch", v)}
					placeholder="Filter by branch"
					className="flex-1"
				/>
				<Segmented
					label="Finished status"
					value={finishedFilter}
					onChange={(f) => setParam("status", f)}
					options={FINISHED_FILTERS.map((f) => ({
						value: f,
						label: <span className="capitalize">{f}</span>,
					}))}
				/>
			</div>
			<ErrorCallout error={live.error ?? finished.error} className="mb-4" />

			<SectionTag>
				Live{" "}
				<span className="text-subtle tabular-nums">
					{live.data?.length ?? ""}
				</span>
			</SectionTag>
			<DataTable
				data={live.data}
				isLoading={live.isLoading}
				columns={columns}
				getRowHref={href}
				emptyText={
					branch
						? `No live runs on “${branch}”`
						: "Nothing running. Runs appear here the moment they are queued."
				}
			/>

			<SectionTag className="mt-6">
				Finished{" "}
				<span className="text-subtle tabular-nums">
					{finishedRuns?.length ?? ""}
				</span>
			</SectionTag>
			<DataTable
				data={finishedRuns}
				isLoading={finished.isLoading}
				columns={columns}
				getRowHref={href}
				emptyText="No finished runs match. Clear the branch or status filter to see more."
			/>
		</>
	);
};
