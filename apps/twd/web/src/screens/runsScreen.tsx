import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { RunSummary } from "../../../src/api/contract.ts";
import { type RunsFilter, useRuns } from "../api/hooks.ts";
import { PageHeader } from "../components/appShell.tsx";
import {
	Actor,
	ErrorCallout,
	Pill,
	RunProgress,
	RunStatusBadge,
} from "../components/status.tsx";
import {
	buttonClass,
	Card,
	Empty,
	Input,
	SectionTitle,
	Segmented,
	Skeleton,
} from "../components/ui.tsx";
import { cn, elapsed, num, sha7, timeAgo } from "../lib/format.ts";
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

const GRID =
	"grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_7rem_5.5rem] items-center gap-4";

const RunRow = ({ run, now }: { run: RunSummary; now: number }) => {
	const total = run.fileCount ?? 0;
	const live = !run.finishedAt;
	return (
		<Link
			to={`/runs/${run.id}`}
			className={cn(
				GRID,
				"border-t border-line px-4 py-2.5 transition-colors outline-none  hover:bg-hover focus-visible:bg-hover",
			)}
		>
			<div className="min-w-0">
				<div className="flex min-w-0 items-center gap-2">
					<span className="truncate font-medium">{run.branch}</span>
					<span className="shrink-0 font-mono text-[11px] text-faint">
						{sha7(run.sha)}
					</span>
					{run.purpose === "baseline" && <Pill tone="info">baseline</Pill>}
				</div>
				<div className="mt-0.5 truncate font-mono text-[11px] text-muted">
					{selectionLabel(run)}
				</div>
			</div>
			<div className="min-w-0">
				<Actor actor={run.createdBy} />
			</div>
			<div className="min-w-0">
				<div className="flex items-center justify-between gap-2 text-xs">
					<RunStatusBadge status={run.status} />
					<span className="text-muted tabular-nums">
						<span className={run.passed ? "text-ok" : "text-faint"}>
							{num(run.passed)}
						</span>
						{run.failed > 0 && (
							<span className="text-bad"> · {num(run.failed)}</span>
						)}
						<span className="text-faint"> / {total ? num(total) : "—"}</span>
					</span>
				</div>
				<RunProgress
					className="mt-1.5"
					passed={run.passed}
					failed={run.failed}
					total={total}
				/>
			</div>
			<div className="text-right text-xs text-muted tabular-nums">
				{elapsed({
					from: run.startedAt ?? run.createdAt,
					to: run.finishedAt,
					now,
				})}
				{live && run.workerCount ? (
					<div className="text-[11px] text-faint">
						{run.workerCount} workers
					</div>
				) : null}
			</div>
			<div className="text-right text-xs text-faint tabular-nums">
				{timeAgo(run.createdAt, now)}
			</div>
		</Link>
	);
};

const RunTable = ({
	runs,
	loading,
	now,
	empty,
}: {
	runs: RunSummary[] | undefined;
	loading: boolean;
	now: number;
	empty: ReactNode;
}) => (
	<Card className="overflow-hidden">
		<div
			className={cn(
				GRID,
				"h-8 bg-raised/50 px-4 text-[11px] font-medium text-muted",
			)}
		>
			<span>Branch</span>
			<span>Started by</span>
			<span>Progress</span>
			<span className="text-right">Elapsed</span>
			<span className="text-right">Created</span>
		</div>
		{loading && !runs ? (
			<div className="space-y-3 p-4">
				{[0, 1, 2].map((i) => (
					<Skeleton key={i} className="h-8 w-full" />
				))}
			</div>
		) : runs?.length ? (
			runs.map((run) => <RunRow key={run.id} run={run} now={now} />)
		) : (
			empty
		)}
	</Card>
);

export const RunsScreen = () => {
	const [params, setParams] = useSearchParams();
	const branch = params.get("branch") ?? "";
	const finishedFilter = (params.get("status") ?? "all") as FinishedFilter;
	const filter: RunsFilter = { status: "live", branch: branch || undefined };
	const live = useRuns(filter);
	const finished = useRuns({ ...filter, status: "finished" });
	const now = useNow();

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

	return (
		<>
			<PageHeader
				title="Runs"
				description="Every swarm run across branches, humans and agents."
				actions={
					<div className="relative w-64">
						<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
						<Input
							value={branch}
							onChange={(e) => setParam("branch", e.target.value)}
							placeholder="Filter by branch"
							aria-label="Filter by branch"
							className="pl-8"
						/>
					</div>
				}
			/>
			<ErrorCallout error={live.error ?? finished.error} className="mb-4" />

			<SectionTitle>
				Live{" "}
				<span className="ml-1 text-faint tabular-nums">
					{live.data?.length ?? ""}
				</span>
			</SectionTitle>
			<RunTable
				runs={live.data}
				loading={live.isLoading}
				now={now}
				empty={
					<Empty
						title={branch ? `No live runs on “${branch}”` : "Nothing running"}
						body="Runs appear here the moment they are queued."
						action={
							<Link to="/runs/new" className={buttonClass()}>
								Start a run
							</Link>
						}
					/>
				}
			/>

			<SectionTitle
				className="mt-8"
				right={
					<Segmented
						label="Status filter"
						value={finishedFilter}
						onChange={(f) => setParam("status", f)}
						options={FINISHED_FILTERS.map((f) => ({ value: f, label: f }))}
						className="capitalize"
					/>
				}
			>
				Finished
			</SectionTitle>
			<RunTable
				runs={finishedRuns}
				loading={finished.isLoading}
				now={now}
				empty={
					<Empty
						title="No finished runs match"
						body="Clear the branch or status filter to see more."
					/>
				}
			/>
		</>
	);
};
