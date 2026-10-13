import { TablePaginationFooter } from "@autumn/ui/components/table/table-pagination-footer";
import { useCursorPagination } from "@autumn/ui/components/table/use-cursor-pagination";
import { buttonVariants } from "@autumn/ui/components/ui/button";
import { Switch } from "@autumn/ui/components/ui/switch";
import { PlayIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
import { BaselinePassRateChart } from "./runs/baselinePassRateChart.tsx";

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
		size: 170,
		meta: { grow: true },
		cell: ({ row: { original: run } }) => (
			<div className="flex min-w-0 items-center gap-2 pr-4">
				<RunLabel
					run={run}
					primaryClassName="min-w-0 shrink font-medium text-foreground"
				/>
				{run.baseline && (
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
		size: 110,
		cell: ({ row: { original: run } }) => (
			<span className="block truncate text-tiny-id text-tertiary-foreground">
				{selectionLabel(run)}
			</span>
		),
	},
	{
		id: "status",
		header: "Status",
		size: 110,
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
		size: 190,
		cell: ({ row: { original: run } }) => {
			const total = run.fileCount ?? 0;
			return (
				<div className="flex items-center gap-2.5">
					<RunProgress
						className="w-16 shrink-0 bg-foreground/10"
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
		size: 100,
		cell: ({ row: { original: run } }) => (
			<Actor actor={run.createdBy} compact />
		),
	},
	{
		id: "elapsed",
		header: "Elapsed",
		size: 70,
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
		size: 70,
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
		size: 70,
		cell: ({ row: { original: run } }) => (
			<CostValue cost={run.cost} className="text-xs" />
		),
	},
	{
		id: "created",
		header: "Created",
		size: 70,
		cell: ({ row: { original: run } }) => (
			<span className="text-xs text-subtle tabular-nums">
				{timeAgo(run.createdAt, now)}
			</span>
		),
	},
];

const ROW_PX = 40;
/** Table header row plus the pagination footer, which every page that overflows shows. */
const TABLE_CHROME_PX = 40 + 44;
const LIVE_SHARE = 0.35;
const LIVE_MIN_ROWS = 2;
const SECTION_TAG_PX = 28;

/** Height of an element, kept current as the viewport resizes. */
const useHeight = () => {
	const ref = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState(0);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new ResizeObserver(() => setHeight(el.clientHeight));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return { ref, height };
};

const rowsThatFit = (px: number) =>
	Math.max(1, Math.floor((px - TABLE_CHROME_PX) / ROW_PX));

/** One cursor-paged runs query plus its footer; page size is what fits, so tables paginate instead of scrolling. */
const usePagedRuns = (
	filter: Omit<RunsFilter, "cursor" | "limit">,
	pageSize: number,
) => {
	const pager = useCursorPagination({
		pageSize,
		resetKey: JSON.stringify({ filter, pageSize }),
	});
	const query = useRuns({
		...filter,
		cursor: pager.currentCursor || undefined,
		limit: pageSize,
	});
	const page = query.data;
	// A page past the end (rows finished while you were on it) steps back instead of stranding an empty table.
	const { canPrev, popCursor } = pager;
	const pastTheEnd =
		!!page && page.runs.length === 0 && canPrev && !query.isPlaceholderData;
	useEffect(() => {
		if (pastTheEnd) popCursor();
	}, [pastTheEnd, popCursor]);
	const footer = page && (page.total > pageSize || pager.canPrev) && (
		<TablePaginationFooter
			currentPage={pager.currentPage}
			totalPages={Math.max(1, Math.ceil(page.total / pageSize))}
			totalCount={page.total}
			canGoPrev={pager.canPrev}
			canGoNext={!!page.nextCursor}
			onPrev={pager.popCursor}
			onNext={() => page.nextCursor && pager.pushCursor(page.nextCursor)}
			pageSize={pageSize}
			pageSizeOptions={[pageSize]}
			onPageSizeChange={() => {}}
			disabled={query.isFetching}
		/>
	);
	return { query, page, footer };
};

export const RunsScreen = () => {
	const [params, setParams] = useSearchParams();
	const branch = params.get("branch") ?? "";
	const status = params.get("status");
	const finishedFilter: FinishedFilter =
		FINISHED_FILTERS.find((f) => f === status) ?? "all";
	// `?status=baselines` came from the replaced layout: honour it until the effect rewrites it to the switch's param.
	const baselinesOnly =
		params.get("baselines") === "1" || status === "baselines";
	useEffect(() => {
		if (status !== "baselines") return;
		const next = new URLSearchParams(params);
		next.delete("status");
		next.set("baselines", "1");
		setParams(next, { replace: true });
	}, [status, params, setParams]);
	const baselinesToggleId = useId();
	const body = useHeight();
	const finishedBox = useHeight();
	const live = usePagedRuns(
		{ status: "live", branch: branch || undefined },
		Math.max(
			LIVE_MIN_ROWS,
			rowsThatFit(body.height * LIVE_SHARE - SECTION_TAG_PX),
		),
	);
	const finished = usePagedRuns(
		{
			status: "finished",
			outcome: finishedFilter,
			baseline: baselinesOnly || undefined,
			branch: branch || undefined,
		},
		rowsThatFit(finishedBox.height),
	);
	const now = useNow();
	useLiveTopics("runs");

	const setParam = (key: string, value: string) => {
		const next = new URLSearchParams(params);
		if (value && value !== "all" && value !== "0") next.set(key, value);
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

			<div ref={body.ref} className="flex min-h-0 flex-1 flex-col">
				<div className="flex shrink-0 flex-col">
					<SectionTag>
						Live{" "}
						<span className="text-subtle tabular-nums">
							{live.page ? num(live.page.total) : ""}
						</span>
					</SectionTag>
					<DataTable
						fill
						data={live.page?.runs}
						isLoading={live.query.isLoading}
						footer={live.footer}
						columns={columns}
						getRowHref={href}
						emptyText={
							branch
								? `No live runs on “${branch}”`
								: "Nothing running. Runs appear here the moment they are queued."
						}
					/>
				</div>

				<div className="mt-6 flex min-h-0 flex-1 flex-col">
					<div className="mb-2 flex items-center justify-between gap-2">
						<SectionTag className="mb-0">
							Finished{" "}
							<span className="text-subtle tabular-nums">
								{finished.page ? num(finished.page.total) : ""}
							</span>
						</SectionTag>
						<label
							htmlFor={baselinesToggleId}
							className="flex cursor-pointer items-center gap-2 text-xs text-tertiary-foreground"
						>
							<Switch
								id={baselinesToggleId}
								checked={baselinesOnly}
								onCheckedChange={(on) => setParam("baselines", on ? "1" : "0")}
							/>
							Baselines only
						</label>
					</div>
					{baselinesOnly && (
						<BaselinePassRateChart branch={branch || undefined} />
					)}
					<div ref={finishedBox.ref} className="flex min-h-0 flex-1 flex-col">
						<DataTable
							fill
							data={finished.page?.runs}
							isLoading={finished.query.isLoading}
							footer={finished.footer}
							columns={columns}
							getRowHref={href}
							emptyText={
								baselinesOnly
									? "No finished baseline runs match. Clear the branch or status filter to see more."
									: "No finished runs match. Clear the branch or status filter to see more."
							}
						/>
					</div>
				</div>
			</div>
		</>
	);
};
