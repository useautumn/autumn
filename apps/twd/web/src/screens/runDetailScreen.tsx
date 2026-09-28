import { MiniCopyButton } from "@autumn/ui/components/general/copy-button";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@autumn/ui/components/ui/breadcrumb";
import type { ColumnDef } from "@tanstack/react-table";
import {
	Check,
	Copy,
	GitCommitHorizontal,
	Hourglass,
	RotateCcw,
	Square,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Drift, RunDetail, RunFile } from "../../../src/api/contract.ts";
import {
	fetchRunLogs,
	useCancelRun,
	useCatalog,
	useCostRates,
	useFileLog,
	useLiveLog,
	useRerunFailed,
	useRun,
	useWorkerLog,
} from "../api/hooks.ts";
import { useLiveTopics } from "../api/live.ts";
import type { LogLine } from "../api/liveCache.ts";
import { AnsiLog, AnsiText } from "../components/ansi.tsx";
import { CostValue } from "../components/cost.tsx";
import { RunLabel } from "../components/runLabel.tsx";
import {
	Actor,
	ErrorCallout,
	FileStatusBadge,
	Pill,
	RunProgress,
	RunStatusBadge,
	StatusDot,
} from "../components/status.tsx";
import {
	Button,
	ConfirmDialog,
	Drawer,
	PagedDataTable,
	Panel,
	SearchInput,
	SectionTag,
	Segmented,
	Skeleton,
	Tooltip,
} from "../components/ui.tsx";
import { cn, elapsed, formatDate, formatMs, num, sha7 } from "../lib/format.ts";
import { useNow } from "../lib/useNow.ts";
import { BootBreakdown } from "./runDetail/bootBreakdown.tsx";
import { RunTimingPanel } from "./runDetail/runTiming.tsx";

const TERMINAL = new Set(["passed", "failed", "cancelled", "errored"]);
const FILTERS = ["all", "failed", "drift", "running", "passed"] as const;
type Filter = (typeof FILTERS)[number];

const isFailure = (f: RunFile) =>
	f.status === "failed" || f.status === "crashed";

const WORKER_COLOR: Record<RunDetail["workers"][number]["status"], string> = {
	provisioning: "bg-subtle/40",
	booting: "bg-orange-400/60",
	ready: "bg-green-500/35",
	busy: "bg-blue-500",
	dead: "bg-subtle/60",
	failed: "bg-red-500",
};

const DriftBadge = ({ drift }: { drift: Drift }) =>
	drift.kind === "new_failure" ? (
		<Tooltip
			content={`Passes ${Math.round(drift.baselineValue * 100)}% of the time on dev`}
		>
			<span>
				<Pill tone="bad">new failure</Pill>
			</span>
		</Tooltip>
	) : (
		<Tooltip
			content={`${formatMs(drift.branchValue)} here vs ${formatMs(drift.baselineValue)} dev p90`}
		>
			<span>
				<Pill tone="warn">
					{(drift.branchValue / drift.baselineValue).toFixed(1)}× slower
				</Pill>
			</span>
		</Tooltip>
	);

const DurationCell = ({
	ms,
	p90,
}: {
	ms: number | null;
	p90: number | null;
}) => {
	if (ms === null) return <span className="text-right text-subtle">—</span>;
	const ratio = p90 ? ms / p90 : null;
	return (
		<span className="flex items-center justify-end gap-2 tabular-nums">
			<span
				className={cn(
					ratio !== null && ratio > 1.5
						? "text-orange-600 dark:text-orange-400"
						: "text-foreground",
				)}
			>
				{formatMs(ms)}
			</span>
			<span className="relative h-1 w-12 overflow-hidden rounded-full bg-muted">
				{ratio !== null && (
					<span
						className={cn(
							"absolute inset-y-0 left-0 rounded-full",
							ratio > 1.5 ? "bg-orange-400" : "bg-subtle/60",
						)}
						style={{ width: `${Math.min(ratio / 2, 1) * 100}%` }}
					/>
				)}
				{ratio !== null && (
					<span className="absolute inset-y-0 left-1/2 w-px bg-tertiary-foreground/60" />
				)}
			</span>
		</span>
	);
};

/** Copies text produced on click (fetched lazily), with brief "Copied" feedback. */
const CopyTextButton = ({
	label,
	getText,
	size = "sm",
}: {
	label: string;
	getText: () => Promise<string> | string;
	size?: "sm" | "default";
}) => {
	const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
		"idle",
	);
	return (
		<Button
			variant="secondary"
			size={size}
			isLoading={state === "busy"}
			onClick={async () => {
				setState("busy");
				try {
					await navigator.clipboard.writeText(await getText());
					setState("done");
				} catch {
					setState("error");
				}
				setTimeout(() => setState("idle"), 1500);
			}}
		>
			{state === "done" ? (
				<Check className="size-3.5" />
			) : (
				<Copy className="size-3.5" />
			)}
			{state === "done" ? "Copied" : state === "error" ? "Copy failed" : label}
		</Button>
	);
};

const WorkerGrid = ({
	workers,
	wanted,
	onOpen,
}: {
	workers: RunDetail["workers"];
	wanted: number;
	onOpen: (worker: string) => void;
}) => {
	const counts = workers.reduce<Record<string, number>>((acc, w) => {
		acc[w.status] = (acc[w.status] ?? 0) + 1;
		return acc;
	}, {});
	return (
		<div>
			<div className="flex flex-wrap gap-[3px]">
				{workers.map((w) => (
					<Tooltip
						key={w.name}
						content={
							<span>
								<span className="font-mono">{w.name}</span> · {w.status}
								{w.file && (
									<span className="mt-0.5 block font-mono text-tertiary-foreground">
										{w.file}
									</span>
								)}
							</span>
						}
					>
						<button
							type="button"
							onClick={() => onOpen(w.name)}
							className={cn(
								"twd-pop size-2.5 cursor-pointer rounded-[2px] hover:ring-1 hover:ring-foreground/40",
								WORKER_COLOR[w.status],
								w.status === "busy" && "twd-pulse",
							)}
							aria-label={`${w.name} ${w.status} — open logs`}
						/>
					</Tooltip>
				))}
				{Array.from(
					{ length: Math.max(0, wanted - workers.length) },
					(_, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: interchangeable empty slots
							key={i}
							className="size-2.5 rounded-[2px] border border-dashed border-subtle/50"
							aria-hidden
						/>
					),
				)}
			</div>
			<div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-tertiary-foreground tabular-nums">
				{Object.entries(counts).map(([status, n]) => (
					<span key={status} className="flex items-center gap-1.5">
						<span
							className={cn(
								"size-2 rounded-[2px]",
								WORKER_COLOR[status as keyof typeof WORKER_COLOR],
							)}
						/>
						{n} {status}
					</span>
				))}
				{wanted > workers.length && (
					<span className="flex items-center gap-1.5">
						<span className="size-2 rounded-[2px] border border-dashed border-subtle/60" />
						{wanted - workers.length} waiting for accounts
					</span>
				)}
			</div>
		</div>
	);
};

const LiveLog = ({
	lines,
	onOpen,
}: {
	lines: LogLine[];
	onOpen: (file: string) => void;
}) => (
	<div className="h-64 overflow-auto rounded-lg border bg-card px-2.5 py-2 font-mono text-[11px] leading-[1.7]">
		{lines.length === 0 ? (
			<p className="text-subtle">Waiting for output…</p>
		) : (
			lines
				.slice(-120)
				.reverse()
				.map((l, i) => (
					<button
						// biome-ignore lint/suspicious/noArrayIndexKey: append-only log tail
						key={i}
						type="button"
						onClick={() => l.file && onOpen(l.file)}
						className="block w-full cursor-pointer truncate text-left hover:bg-muted"
					>
						{l.worker && <span className="text-subtle">{l.worker} </span>}
						<AnsiText text={l.text} />
					</button>
				))
		)}
	</div>
);

const Header = ({ run, now }: { run: RunDetail; now: number }) => {
	const navigate = useNavigate();
	const cancel = useCancelRun(run.id);
	const rerun = useRerunFailed(run.id);
	const [confirmCancel, setConfirmCancel] = useState(false);
	const rates = useCostRates();
	const live = !TERMINAL.has(run.status);
	return (
		<div className="flex flex-col gap-2 pb-4">
			<div className="flex items-center justify-between gap-4">
				<Breadcrumb>
					<BreadcrumbList className="text-xs text-tertiary-foreground sm:gap-1.5">
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to="/">Runs</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem className="max-w-60 min-w-0">
							<RunLabel run={run} showSha={false} primaryClassName="" />
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
				<div className="flex items-center gap-2">
					{run.failed > 0 && (
						<CopyTextButton
							size="default"
							label="Copy failed logs"
							getText={() => fetchRunLogs({ runId: run.id, failed: true })}
						/>
					)}
					{run.failed > 0 && (
						<Button
							variant="secondary"
							isLoading={rerun.isPending}
							onClick={() =>
								rerun.mutate(undefined, {
									onSuccess: (next) => navigate(`/runs/${next.id}`),
								})
							}
						>
							<RotateCcw className="size-3.5" /> Rerun {run.failed} failed
						</Button>
					)}
					{live && (
						<Button variant="secondary" onClick={() => setConfirmCancel(true)}>
							<Square className="size-3.5" /> Cancel
						</Button>
					)}
				</div>
			</div>
			<div className="flex min-w-0 items-center gap-2">
				<h3 className="min-w-0 text-md font-semibold text-foreground">
					<RunLabel run={run} showSha={false} primaryClassName="" />
				</h3>
				<RunStatusBadge status={run.status} />
				{run.purpose === "baseline" && <Pill tone="info">baseline</Pill>}
			</div>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tertiary-foreground">
				<span className="flex items-center gap-1 text-tiny-id">
					<GitCommitHorizontal className="size-3.5 text-subtle" />
					{sha7(run.sha)}
				</span>
				<Actor actor={run.createdBy} />
				<span className="tabular-nums">
					Created {formatDate(run.createdAt)}
				</span>
				<span className="tabular-nums">
					{!live ? "Took " : run.startedAt ? "Running for " : "Waiting for "}
					<span className="text-foreground">
						{elapsed({
							from: run.startedAt ?? run.createdAt,
							to: run.finishedAt,
							now,
						})}
					</span>
				</span>
				<span className="flex items-center gap-1">
					Cost <CostValue cost={run.cost} rates={rates} />
				</span>
				<MiniCopyButton text={run.id} />
			</div>
			<ErrorCallout error={rerun.error ?? cancel.error} className="mt-1" />
			<ConfirmDialog
				open={confirmCancel}
				onOpenChange={setConfirmCancel}
				title="Cancel this run?"
				confirmLabel="Cancel run"
				destructive
				pending={cancel.isPending}
				onConfirm={() =>
					cancel.mutate(undefined, { onSettled: () => setConfirmCancel(false) })
				}
			>
				Workers stop immediately and their Stripe accounts go to nuking. Files
				already finished keep their results.
			</ConfirmDialog>
		</div>
	);
};

type AttentionRow = { file: RunFile; drift: Drift | undefined };

export const RunDetailScreen = () => {
	const { id = "" } = useParams();
	const run = useRun(id);
	const catalog = useCatalog();
	const live = !!run.data && !TERMINAL.has(run.data.status);
	useLiveTopics(id && `run:${id}`, live && "runs");
	const log = useLiveLog(id);
	const now = useNow({ active: live });
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");
	const [openFile, setOpenFile] = useState<string | null>(null);
	const fileLog = useFileLog({ runId: id, file: openFile });
	const [openWorker, setOpenWorker] = useState<string | null>(null);
	const workerLog = useWorkerLog({ runId: id, worker: openWorker });

	if (run.error) return <ErrorCallout error={run.error} />;
	if (!run.data)
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-4 w-40" />
				<Skeleton className="h-6 w-80" />
				<Skeleton className="h-64 w-full" />
			</div>
		);

	const r = run.data;
	const p90 = new Map(
		catalog.data?.files.map((f) => [f.path, f.baselineP90Ms]),
	);
	const driftByFile = new Map(r.drift.map((d) => [d.file, d]));
	const failures = r.files.filter(isFailure);
	const running = r.files.filter((f) => f.status === "running").length;
	const total = r.fileCount ?? r.files.length;
	const attention: AttentionRow[] = [
		...failures.map((f) => ({ file: f, drift: driftByFile.get(f.file) })),
		...r.drift
			.filter((d) => d.kind === "slow")
			.flatMap((d) => {
				const f = r.files.find((x) => x.file === d.file);
				return f && !isFailure(f) ? [{ file: f, drift: d }] : [];
			}),
	].sort(
		(a, b) =>
			Number(b.drift?.kind === "new_failure") -
			Number(a.drift?.kind === "new_failure"),
	);

	const order: Record<RunFile["status"], number> = {
		failed: 0,
		crashed: 0,
		running: 1,
		queued: 2,
		passed: 3,
		skipped: 4,
	};
	const rows = r.files
		.filter((f) =>
			filter === "all"
				? true
				: filter === "failed"
					? isFailure(f)
					: filter === "drift"
						? driftByFile.has(f.file)
						: f.status === filter,
		)
		.filter((f) => !query || f.file.toLowerCase().includes(query.toLowerCase()))
		.sort(
			(a, b) =>
				order[a.status] - order[b.status] ||
				(b.durationMs ?? 0) - (a.durationMs ?? 0),
		);
	const counts: Record<Filter, number> = {
		all: r.files.length,
		failed: failures.length,
		drift: r.drift.length,
		running,
		passed: r.passed,
	};
	const opened = r.files.find((f) => f.file === openFile);

	const fileColumns: ColumnDef<RunFile>[] = [
		{
			id: "status",
			header: "Status",
			size: 90,
			cell: ({ row: { original: f } }) => <FileStatusBadge status={f.status} />,
		},
		{
			id: "file",
			header: "File",
			size: 320,
			meta: { grow: true },
			cell: ({ row: { original: f } }) => {
				const drift = driftByFile.get(f.file);
				return (
					<span className="flex min-w-0 items-center gap-2 pr-2">
						<span className="truncate text-tiny-id text-foreground">
							{f.file}
						</span>
						{drift && <DriftBadge drift={drift} />}
					</span>
				);
			},
		},
		{
			id: "duration",
			header: "Duration vs p90",
			size: 140,
			cell: ({ row: { original: f } }) => (
				<DurationCell ms={f.durationMs} p90={p90.get(f.file) ?? null} />
			),
		},
		{
			id: "worker",
			header: "Worker",
			size: 80,
			cell: ({ row: { original: f } }) => (
				<span className="text-tiny-id text-tertiary-foreground">
					{f.worker ?? "—"}
				</span>
			),
		},
		{
			id: "tries",
			header: "Tries",
			size: 60,
			cell: ({ row: { original: f } }) => (
				<span
					className={cn(
						"text-xs tabular-nums",
						f.attempt > 1
							? "text-orange-600 dark:text-orange-400"
							: "text-subtle",
					)}
				>
					{f.attempt}
				</span>
			),
		},
	];

	const attentionColumns: ColumnDef<AttentionRow>[] = [
		{
			id: "status",
			header: "Status",
			size: 90,
			cell: ({ row: { original: a } }) => (
				<FileStatusBadge status={a.file.status} />
			),
		},
		{
			id: "file",
			header: "File",
			size: 300,
			meta: { grow: true },
			cell: ({ row: { original: a } }) => (
				<span className="flex min-w-0 flex-col pr-2">
					<span className="truncate text-tiny-id text-foreground">
						{a.file.file}
					</span>
					{a.file.failureSummary && (
						<span className="truncate text-tiny-id text-subtle">
							{a.file.failureSummary.split("\n")[0]}
						</span>
					)}
				</span>
			),
		},
		{
			id: "flags",
			header: "",
			size: 150,
			cell: ({ row: { original: a } }) => (
				<span className="flex items-center justify-end gap-1.5">
					{a.drift && <DriftBadge drift={a.drift} />}
					{a.file.attempt > 1 && <Pill>attempt {a.file.attempt}</Pill>}
				</span>
			),
		},
	];

	return (
		<>
			<Header run={r} now={now} />

			<div className="mb-5 flex flex-col gap-2">
				<div className="flex flex-wrap items-center justify-between gap-3 text-xs tabular-nums text-tertiary-foreground">
					<div className="flex items-center gap-3">
						<span>
							<span className="font-medium text-green-600 dark:text-green-500">
								{num(r.passed)}
							</span>{" "}
							passed
						</span>
						<span>
							<span
								className={cn(
									"font-medium",
									r.failed ? "text-red-600 dark:text-red-400" : "text-subtle",
								)}
							>
								{num(r.failed)}
							</span>{" "}
							failed
						</span>
						{running > 0 && (
							<span>
								<span className="font-medium text-blue-600 dark:text-blue-400">
									{num(running)}
								</span>{" "}
								running
							</span>
						)}
						<span className="text-subtle">of {num(total)} files</span>
					</div>
					{r.phase && (
						<span className="flex items-center gap-2 text-tiny-id text-tertiary-foreground">
							<StatusDot tone="info" pulse />
							{r.phase}
						</span>
					)}
				</div>
				<RunProgress
					passed={r.passed}
					failed={r.failed}
					running={running}
					total={total}
				/>
			</div>

			<div className="flex flex-col gap-6">
				<div className="flex min-w-0 flex-col gap-6">
					{attention.length > 0 && (
						<section>
							<SectionTag>
								Needs attention{" "}
								<span className="text-subtle tabular-nums">
									{attention.length}
								</span>
							</SectionTag>
							<PagedDataTable
								resetKey=""
								pageSizes={[5, 10, 25]}
								data={attention}
								columns={attentionColumns}
								onRowClick={(a) => setOpenFile(a.file.file)}
								emptyText="Nothing needs attention."
							/>
						</section>
					)}

					<RunTimingPanel run={r} onOpenFile={setOpenFile} />

					<section className="flex flex-col">
						<div className="flex flex-wrap items-center gap-2 pb-2">
							<SectionTag className="mb-0">Files</SectionTag>
							<Segmented
								label="File filter"
								value={filter}
								onChange={(f) => {
									setFilter(f);
								}}
								options={FILTERS.map((f) => ({
									value: f,
									label: (
										<>
											<span className="capitalize">{f}</span>{" "}
											<span className="text-subtle tabular-nums">
												{counts[f]}
											</span>
										</>
									),
								}))}
								className="ml-auto"
							/>
							<SearchInput
								value={query}
								onChange={setQuery}
								placeholder="Filter files"
								className="w-52"
							/>
						</div>
						<PagedDataTable
							resetKey={`${filter}|${query}`}
							data={rows}
							columns={fileColumns}
							onRowClick={(f) => setOpenFile(f.file)}
							rowClassName="h-8"
							emptyText="No files match. Try another filter."
						/>
					</section>
				</div>

				<div className="flex flex-col gap-6">
					<section>
						<SectionTag>
							Workers{" "}
							<span className="text-subtle tabular-nums">
								{r.workers.length}
								{r.workersWanted !== null && `/${num(r.workersWanted)}`}
							</span>
						</SectionTag>
						<Panel className="flex flex-col gap-3 p-3">
							{r.queuePosition !== null && (
								<p className="flex items-center gap-2 text-xs text-tertiary-foreground">
									<Hourglass className="size-3.5 text-subtle" />
									Waiting for accounts ·{" "}
									<span className="text-foreground tabular-nums">
										#{r.queuePosition}
									</span>{" "}
									in queue
								</p>
							)}
							{r.workers.length || r.workersWanted ? (
								<WorkerGrid
									workers={r.workers}
									wanted={live ? (r.workersWanted ?? 0) : 0}
									onOpen={setOpenWorker}
								/>
							) : (
								<p className="text-xs text-subtle">No workers yet.</p>
							)}
						</Panel>
					</section>
					<BootBreakdown workers={r.workers} onOpenWorker={setOpenWorker} />
					{live && (
						<section>
							<SectionTag>Live output</SectionTag>
							<LiveLog lines={log} onOpen={setOpenFile} />
						</section>
					)}
				</div>
			</div>

			<Drawer
				open={openFile !== null}
				onOpenChange={(o) => !o && setOpenFile(null)}
				title={openFile ?? ""}
				actions={
					openFile && (
						<CopyTextButton
							label="Copy"
							getText={() => fetchRunLogs({ runId: id, file: openFile })}
						/>
					)
				}
				subtitle={
					opened && (
						<span className="flex flex-wrap items-center gap-3">
							<FileStatusBadge status={opened.status} />
							<span className="tabular-nums">
								{formatMs(opened.durationMs)}
							</span>
							<span className="tabular-nums">
								p90 {formatMs(p90.get(opened.file))}
							</span>
							{opened.worker && (
								<span className="text-tiny-id">{opened.worker}</span>
							)}
							<span className="tabular-nums">
								{opened.passedTests} pass · {opened.failedTests} fail
							</span>
							{opened.attempt > 1 && (
								<Pill tone="warn">attempt {opened.attempt}</Pill>
							)}
						</span>
					)
				}
			>
				<div className="p-4">
					{fileLog.error ? (
						<ErrorCallout error={fileLog.error} />
					) : fileLog.data === undefined ? (
						<div className="flex flex-col gap-2">
							{[0, 1, 2, 3, 4].map((i) => (
								<Skeleton key={i} className="h-4 w-full" />
							))}
						</div>
					) : (
						<AnsiLog text={fileLog.data} />
					)}
				</div>
			</Drawer>

			<Drawer
				open={openWorker !== null}
				onOpenChange={(o) => !o && setOpenWorker(null)}
				title={openWorker ?? ""}
				subtitle="Worker log: boot, server output, and every file it ran"
				actions={
					openWorker && (
						<CopyTextButton
							label="Copy"
							getText={() => fetchRunLogs({ runId: id, worker: openWorker })}
						/>
					)
				}
			>
				<div className="p-4">
					{workerLog.error ? (
						<ErrorCallout error={workerLog.error} />
					) : workerLog.data === undefined ? (
						<Skeleton className="h-4 w-full" />
					) : workerLog.data ? (
						<AnsiLog text={workerLog.data} />
					) : (
						<p className="text-xs text-subtle">
							No output recorded for this worker yet.
						</p>
					)}
				</div>
			</Drawer>
		</>
	);
};
