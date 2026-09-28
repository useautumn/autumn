import {
	ArrowLeft,
	GitCommitHorizontal,
	RotateCcw,
	Search,
	Square,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Drift, RunDetail, RunFile } from "../../../src/api/contract.ts";
import {
	useCancelRun,
	useCatalog,
	useFileLog,
	useRerunFailed,
	useRun,
} from "../api/hooks.ts";
import { type LogLine, useRunEvents } from "../api/useRunEvents.ts";
import { AnsiLog, AnsiText } from "../components/ansi.tsx";
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
	Card,
	ConfirmDialog,
	Drawer,
	Empty,
	Input,
	SectionTitle,
	Segmented,
	Skeleton,
	Tooltip,
} from "../components/ui.tsx";
import { cn, elapsed, formatDate, formatMs, num, sha7 } from "../lib/format.ts";
import { useNow } from "../lib/useNow.ts";

const TERMINAL = new Set(["passed", "failed", "cancelled", "errored"]);
const FILTERS = ["all", "failed", "drift", "running", "passed"] as const;
type Filter = (typeof FILTERS)[number];
const PAGE = 200;

const isFailure = (f: RunFile) =>
	f.status === "failed" || f.status === "crashed";

const WORKER_COLOR: Record<RunDetail["workers"][number]["status"], string> = {
	provisioning: "bg-idle",
	booting: "bg-warn/60",
	ready: "bg-ok/35",
	busy: "bg-info",
	dead: "bg-idle/60",
	failed: "bg-bad",
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
	if (ms === null) return <span className="text-right text-faint">—</span>;
	const ratio = p90 ? ms / p90 : null;
	return (
		<span className="flex items-center justify-end gap-2 tabular-nums">
			<span
				className={cn(ratio !== null && ratio > 1.5 ? "text-warn" : "text-fg")}
			>
				{formatMs(ms)}
			</span>
			<span className="relative h-1 w-12 overflow-hidden rounded-full bg-raised">
				{ratio !== null && (
					<span
						className={cn(
							"absolute inset-y-0 left-0 rounded-full",
							ratio > 1.5 ? "bg-warn" : "bg-faint/60",
						)}
						style={{ width: `${Math.min(ratio / 2, 1) * 100}%` }}
					/>
				)}
				{ratio !== null && (
					<span className="absolute inset-y-0 left-1/2 w-px bg-muted" />
				)}
			</span>
		</span>
	);
};

const WorkerGrid = ({ workers }: { workers: RunDetail["workers"] }) => {
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
									<span className="mt-0.5 block font-mono text-muted">
										{w.file}
									</span>
								)}
							</span>
						}
					>
						<span
							className={cn(
								"size-2.5 rounded-[2px]",
								WORKER_COLOR[w.status],
								w.status === "busy" && "twd-pulse",
							)}
							role="img"
							aria-label={`${w.name} ${w.status}`}
						/>
					</Tooltip>
				))}
			</div>
			<div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted tabular-nums">
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
	<div className="h-56 overflow-auto rounded-md bg-bg px-2.5 py-2 font-mono text-[11px] leading-[1.7]">
		{lines.length === 0 ? (
			<p className="text-faint">Waiting for output…</p>
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
						className="block w-full cursor-pointer truncate text-left hover:bg-hover"
					>
						{l.worker && <span className="text-faint">{l.worker} </span>}
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
	const live = !TERMINAL.has(run.status);
	return (
		<div className="mb-5">
			<Link
				to="/"
				className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"
			>
				<ArrowLeft className="size-3" /> Runs
			</Link>
			<div className="mt-2 flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0">
					<div className="flex items-center gap-3">
						<h1 className="truncate text-lg font-semibold">{run.branch}</h1>
						<RunStatusBadge status={run.status} />
						{run.purpose === "baseline" && <Pill tone="info">baseline</Pill>}
					</div>
					<div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
						<span className="flex items-center gap-1 font-mono">
							<GitCommitHorizontal className="size-3.5" />
							{sha7(run.sha)}
						</span>
						<Actor actor={run.createdBy} />
						<span className="tabular-nums">
							Created {formatDate(run.createdAt)}
						</span>
						<span className="tabular-nums">
							{live ? "Running for " : "Took "}
							<span className="text-fg">
								{elapsed({
									from: run.startedAt ?? run.createdAt,
									to: run.finishedAt,
									now,
								})}
							</span>
						</span>
						<span className="font-mono text-faint">{run.id}</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{run.failed > 0 && (
						<Button
							disabled={rerun.isPending}
							onClick={() =>
								rerun.mutate(undefined, {
									onSuccess: (next) => navigate(`/runs/${next.id}`),
								})
							}
						>
							<RotateCcw /> Rerun {run.failed} failed
						</Button>
					)}
					{live && (
						<Button onClick={() => setConfirmCancel(true)}>
							<Square /> Cancel
						</Button>
					)}
				</div>
			</div>
			<ErrorCallout error={rerun.error ?? cancel.error} className="mt-3" />
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

export const RunDetailScreen = () => {
	const { id = "" } = useParams();
	const run = useRun(id);
	const catalog = useCatalog();
	const live = !!run.data && !TERMINAL.has(run.data.status);
	const { log } = useRunEvents({ id, live });
	const now = useNow({ active: live });
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");
	const [limit, setLimit] = useState(PAGE);
	const [openFile, setOpenFile] = useState<string | null>(null);
	const fileLog = useFileLog({ runId: id, file: openFile });

	if (run.error) return <ErrorCallout error={run.error} />;
	if (!run.data)
		return (
			<div className="space-y-4">
				<Skeleton className="h-10 w-80" />
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-96 w-full" />
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
	const attention = [
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

	return (
		<>
			<Header run={r} now={now} />

			<Card className="mb-5 px-4 py-3.5">
				<div className="flex flex-wrap items-baseline justify-between gap-3 text-xs">
					<div className="flex items-baseline gap-5 tabular-nums">
						<span>
							<span className="text-base font-semibold text-ok">
								{num(r.passed)}
							</span>{" "}
							<span className="text-muted">passed</span>
						</span>
						<span>
							<span
								className={cn(
									"text-base font-semibold",
									r.failed ? "text-bad" : "text-faint",
								)}
							>
								{num(r.failed)}
							</span>{" "}
							<span className="text-muted">failed</span>
						</span>
						{running > 0 && (
							<span>
								<span className="text-base font-semibold text-info">
									{num(running)}
								</span>{" "}
								<span className="text-muted">running</span>
							</span>
						)}
						<span className="text-muted">
							of <span className="text-fg">{num(total)}</span> files
						</span>
					</div>
					{r.phase && (
						<span className="flex items-center gap-2 font-mono text-[11px] text-muted">
							<StatusDot tone="info" pulse />
							{r.phase}
						</span>
					)}
				</div>
				<RunProgress
					className="mt-3 h-2"
					passed={r.passed}
					failed={r.failed}
					running={running}
					total={total}
				/>
			</Card>

			<div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="min-w-0 space-y-5">
					{attention.length > 0 && (
						<section>
							<SectionTitle>
								Needs attention{" "}
								<span className="ml-1 text-faint tabular-nums">
									{attention.length}
								</span>
							</SectionTitle>
							<Card className="divide-y divide-line overflow-hidden">
								{attention.slice(0, 8).map(({ file, drift }) => (
									<button
										key={file.file}
										type="button"
										onClick={() => setOpenFile(file.file)}
										className="grid w-full cursor-pointer grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-2 px-4 py-2 text-left transition-colors outline-none hover:bg-hover focus-visible:bg-hover"
									>
										<FileStatusBadge status={file.status} />
										<div className="flex min-w-0 items-center gap-2.5">
											<span className="min-w-0 truncate font-mono text-[12px]">
												{file.file}
											</span>
											<span className="ml-auto flex shrink-0 items-center gap-1.5">
												{drift && <DriftBadge drift={drift} />}
												{file.attempt > 1 && (
													<Pill>attempt {file.attempt}</Pill>
												)}
											</span>
										</div>
										{file.failureSummary && (
											<span className="col-start-2 mt-0.5 truncate font-mono text-[11px] text-muted">
												{file.failureSummary.split("\n")[0]}
											</span>
										)}
									</button>
								))}
								{attention.length > 8 && (
									<button
										type="button"
										onClick={() => setFilter("failed")}
										className="block w-full cursor-pointer px-4 py-2 text-left text-xs text-muted hover:bg-hover hover:text-fg"
									>
										{attention.length - 8} more in the file table
									</button>
								)}
							</Card>
						</section>
					)}

					<section>
						<SectionTitle
							right={
								<div className="flex items-center gap-2">
									<Segmented
										label="File filter"
										value={filter}
										onChange={(f) => {
											setFilter(f);
											setLimit(PAGE);
										}}
										options={FILTERS.map((f) => ({
											value: f,
											label: (
												<>
													<span className="capitalize">{f}</span>
													<span className="text-faint tabular-nums">
														{counts[f]}
													</span>
												</>
											),
										}))}
									/>
									<div className="relative w-52">
										<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
										<Input
											value={query}
											onChange={(e) => setQuery(e.target.value)}
											placeholder="Filter files"
											aria-label="Filter files"
											className="h-7 pl-8 text-xs"
										/>
									</div>
								</div>
							}
						>
							Files
						</SectionTitle>
						<Card className="overflow-hidden">
							<div className="grid h-8 grid-cols-[6rem_minmax(0,1fr)_9rem_4.5rem_3.5rem] items-center gap-3 bg-raised/50 px-4 text-[11px] font-medium text-muted">
								<span>Status</span>
								<span>File</span>
								<span className="text-right">Duration vs p90</span>
								<span>Worker</span>
								<span className="text-right">Tries</span>
							</div>
							{rows.length === 0 ? (
								<Empty title="No files match" body="Try another filter." />
							) : (
								rows.slice(0, limit).map((f) => (
									<button
										key={f.file}
										type="button"
										onClick={() => setOpenFile(f.file)}
										className="grid h-8 w-full cursor-pointer grid-cols-[6rem_minmax(0,1fr)_9rem_4.5rem_3.5rem] items-center gap-3 border-t border-line px-4 text-left text-xs transition-colors outline-none  hover:bg-hover focus-visible:bg-hover"
									>
										<FileStatusBadge status={f.status} />
										<span className="flex min-w-0 items-center gap-2">
											<span className="truncate font-mono text-[12px]">
												{f.file}
											</span>
											{driftByFile.get(f.file) && (
												<DriftBadge drift={driftByFile.get(f.file) as Drift} />
											)}
										</span>
										<DurationCell
											ms={f.durationMs}
											p90={p90.get(f.file) ?? null}
										/>
										<span className="font-mono text-[11px] text-muted">
											{f.worker ?? "—"}
										</span>
										<span
											className={cn(
												"text-right tabular-nums",
												f.attempt > 1 ? "text-warn" : "text-faint",
											)}
										>
											{f.attempt}
										</span>
									</button>
								))
							)}
							{rows.length > limit && (
								<button
									type="button"
									onClick={() => setLimit((l) => l + PAGE)}
									className="block w-full cursor-pointer border-t border-line px-4 py-2 text-center text-xs text-muted hover:bg-hover hover:text-fg"
								>
									Show {Math.min(PAGE, rows.length - limit)} more of{" "}
									{num(rows.length - limit)}
								</button>
							)}
						</Card>
					</section>
				</div>

				<aside className="space-y-5 xl:sticky xl:top-18">
					<section>
						<SectionTitle>
							Workers{" "}
							<span className="ml-1 text-faint tabular-nums">
								{r.workers.length}
							</span>
						</SectionTitle>
						<Card className="p-3.5">
							{r.workers.length ? (
								<WorkerGrid workers={r.workers} />
							) : (
								<p className="text-xs text-muted">No workers yet.</p>
							)}
						</Card>
					</section>
					{live && (
						<section>
							<SectionTitle>Live output</SectionTitle>
							<Card className="p-1.5">
								<LiveLog lines={log} onOpen={setOpenFile} />
							</Card>
						</section>
					)}
				</aside>
			</div>

			<Drawer
				open={openFile !== null}
				onOpenChange={(o) => !o && setOpenFile(null)}
				title={openFile ?? ""}
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
								<span className="font-mono">{opened.worker}</span>
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
						<div className="space-y-2">
							{[0, 1, 2, 3, 4].map((i) => (
								<Skeleton key={i} className="h-4 w-full" />
							))}
						</div>
					) : (
						<AnsiLog text={fileLog.data} />
					)}
				</div>
			</Drawer>
		</>
	);
};
