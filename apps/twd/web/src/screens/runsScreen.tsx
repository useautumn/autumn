import { TablePaginationFooter } from "@autumn/ui/components/table/table-pagination-footer";
import { useCursorPagination } from "@autumn/ui/components/table/use-cursor-pagination";
import { buttonVariants } from "@autumn/ui/components/ui/button";
import { PlayIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { RunSummary } from "../../../src/api/contract.ts";
import { type RunsFilter, useRuns } from "../api/hooks.ts";
import { useLiveTopics } from "../api/live.ts";
import { CostValue } from "../components/cost.tsx";
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
	Tooltip,
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
		size: 240,
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
		size: 150,
		cell: ({ row: { original: run } }) => (
			<span className="block truncate text-tiny-id text-tertiary-foreground">
				{selectionLabel(run)}
			</span>
		),
	},
	{
		id: "status",
		header: "Status",
		size: 120,
		cell: ({ row: { original: run } }) =>
			run.queuePosition !== null ? (
				<Tooltip content="Waiting in the FIFO queue for its first Stripe account">
					<span>
						<Pill className="tabular-nums">Queued · #{run.queuePosition}</Pill>
					</span>
				</Tooltip>
			) : (
				<RunStatusBadge status={run.status} />
			),
	},
	{
		id: "progress",
		header: "Progress",
		size: 180,
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
		size: 120,
		cell: ({ row: { original: run } }) => (
			<Actor actor={run.createdBy} compact />
		),
	},
	{
		id: "elapsed",
		header: "Elapsed",
		size: 80,
		cell: ({ row: { original: run } }) => (
			<span className="text-xs tabular-nums">
				{elapsed({
					from: run.startedAt ?? run.createdAt,
					to: run.finishedAt,
					now,
				})}
			</span>
		),
	},
	{
		id: "workers",
		header: "Workers",
		size: 80,
		cell: ({ row: { original: run } }) =>
			run.workersWanted === null ? (
				<span className="text-xs text-subtle">—</span>
			) : (
				<span className="text-xs tabular-nums">
					<span className="text-foreground">{num(run.workerCount ?? 0)}</span>
					<span className="text-subtle">/{num(run.workersWanted)}</span>
				</span>
			),
	},
	{
		id: "cost",
		header: "Cost",
		size: 80,
		cell: ({ row: { original: run } }) => (
			<CostValue cost={run.cost} className="text-xs" />
		),
	},
	{
		id: "created",
		header: "Created",
		size: 80,
		cell: ({ row: { original: run } }) => (
			<span className="text-xs text-subtle tabular-nums">
				{timeAgo(run.createdAt, now)}
			</span>
		),
	},
];

const PAGE_SIZES = [25, 50, 100] as const;

/** One cursor-paged runs query plus its footer; resets to page 1 when the filter changes. */
const usePagedRuns = (filter: Omit<RunsFilter, "cursor" | "limit">) => {
	const [pageSize, setPageSize] = useState<number>(25);
	const pager = useCursorPagination({
		pageSize,
		resetKey: JSON.stringify(filter),
	});
	const query = useRuns({
		...filter,
		cursor: pager.currentCursor || undefined,
		limit: pageSize,
	});
	const page = query.data;
	const footer = page && page.total > pageSize && (
		<TablePaginationFooter
			currentPage={pager.currentPage}
			totalPages={Math.max(1, Math.ceil(page.total / pageSize))}
			totalCount={page.total}
			canGoPrev={pager.canPrev}
			canGoNext={!!page.nextCursor}
			onPrev={pager.popCursor}
			onNext={() => page.nextCursor && pager.pushCursor(page.nextCursor)}
			pageSize={pageSize}
			pageSizeOptions={PAGE_SIZES}
			onPageSizeChange={setPageSize}
			disabled={query.isFetching}
			className="pt-3"
		/>
	);
	return { query, page, footer };
};

export const RunsScreen = () => {
	const [params, setParams] = useSearchParams();
	const branch = params.get("branch") ?? "";
	const finishedFilter = (params.get("status") ?? "all") as FinishedFilter;
	const live = usePagedRuns({ status: "live", branch: branch || undefined });
	const finished = usePagedRuns({
		status: "finished",
		outcome: finishedFilter,
		branch: branch || undefined,
	});
	const now = useNow();
	useLiveTopics("runs");

	const setParam = (key: string, value: string) => {
		const next = new URLSearchParams(params);
		if (value && value !== "all") next.set(key, value);
		else next.delete(key);
		setParams(next, { replace: true });
	};

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
			<ErrorCallout
				error={live.query.error ?? finished.query.error}
				className="mb-4"
			/>

			<SectionTag>
				Live{" "}
				<span className="text-subtle tabular-nums">
					{live.page ? num(live.page.total) : ""}
				</span>
			</SectionTag>
			<DataTable
				data={live.page?.runs}
				isLoading={live.query.isLoading}
				columns={columns}
				getRowHref={href}
				emptyText={
					branch
						? `No live runs on “${branch}”`
						: "Nothing running. Runs appear here the moment they are queued."
				}
			/>
			{live.footer}

			<SectionTag className="mt-6">
				Finished{" "}
				<span className="text-subtle tabular-nums">
					{finished.page ? num(finished.page.total) : ""}
				</span>
			</SectionTag>
			<DataTable
				data={finished.page?.runs}
				isLoading={finished.query.isLoading}
				columns={columns}
				getRowHref={href}
				emptyText="No finished runs match. Clear the branch or status filter to see more."
			/>
			{finished.footer}
		</>
	);
};
