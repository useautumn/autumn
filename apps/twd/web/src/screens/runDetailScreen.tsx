import { MiniCopyButton } from "@autumn/ui/components/general/copy-button";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@autumn/ui/components/ui/breadcrumb";
import {
	Check,
	Copy,
	GitCommitHorizontal,
	RotateCcw,
	Square,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { RunDetail } from "../../../src/api/contract.ts";
import { splitRepetitionId } from "../../../src/internal/runs/repeat/repetitions.ts";
import { summariseRunTiming } from "../../../src/internal/runs/timing/summariseRunTiming.ts";
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
import { AnsiLog } from "../components/ansi.tsx";
import { CostValue } from "../components/cost.tsx";
import { RunLabel } from "../components/runLabel.tsx";
import {
	Actor,
	ErrorCallout,
	FileStatusBadge,
	Pill,
	RunStatusBadge,
} from "../components/status.tsx";
import { Button, ConfirmDialog, Drawer, Skeleton } from "../components/ui.tsx";
import { elapsed, formatDate, formatMs, sha7 } from "../lib/format.ts";
import { useNow } from "../lib/useNow.ts";
import { FileHistoryChart } from "./runDetail/fileHistoryChart.tsx";
import { FilesCard } from "./runDetail/filesCard.tsx";
import { FailuresCard, RunningCard } from "./runDetail/liveCards.tsx";
import { TERMINAL } from "./runDetail/runFiles.ts";
import { RunStats } from "./runDetail/runStats.tsx";
import { TimingSheet } from "./runDetail/timingSheet.tsx";
import { WorkersCard } from "./runDetail/workersCard.tsx";

const baseFile = (id: string) => splitRepetitionId({ id }).file;

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

const Header = ({ run, now }: { run: RunDetail; now: number }) => {
	const navigate = useNavigate();
	const cancel = useCancelRun(run.id);
	const rerun = useRerunFailed(run.id);
	const [confirmCancel, setConfirmCancel] = useState(false);
	const rates = useCostRates();
	const live = !TERMINAL.has(run.status);
	return (
		<div className="flex shrink-0 flex-col gap-2">
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
				{run.repeat > 1 && <Pill tone="info">repeat ×{run.repeat}</Pill>}
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

export const RunDetailScreen = () => {
	const { id = "" } = useParams();
	const run = useRun(id);
	const catalog = useCatalog();
	const live = !!run.data && !TERMINAL.has(run.data.status);
	useLiveTopics(id && `run:${id}`, live && "runs");
	const log = useLiveLog(id);
	const now = useNow({ active: live });
	const [timingOpen, setTimingOpen] = useState(false);
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
	const timing = summariseRunTiming(r, now);
	const running = r.files.filter((f) => f.status === "running").length;
	const total = r.fileCount ?? r.files.length;
	const queued = r.files.filter((f) => f.status === "queued").length;
	const opened = r.files.find((f) => f.file === openFile);
	const fromSheet = (open: (target: string) => void) => (target: string) => {
		setTimingOpen(false);
		open(target);
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4">
			<Header run={r} now={now} />
			<RunStats
				run={r}
				now={now}
				total={total}
				running={running}
				wallMs={timing.wallMs}
				timingOpen={timingOpen}
				onOpenTiming={() => setTimingOpen(true)}
			/>

			<div className="grid min-h-0 flex-1 grid-cols-1 gap-3.5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
				<div className="flex min-h-0 min-w-0 flex-col gap-3 max-sm:h-[36rem]">
					<WorkersCard run={r} live={live} onOpenWorker={setOpenWorker} />
					<FilesCard run={r} live={live} p90={p90} onOpenFile={setOpenFile} />
				</div>
				<div className="flex min-h-0 min-w-0 flex-col gap-3 max-sm:h-[36rem]">
					<FailuresCard run={r} live={live} onOpenFile={setOpenFile} />
					<RunningCard
						run={r}
						live={live}
						now={now}
						queued={queued}
						onOpenFile={setOpenFile}
					/>
				</div>
			</div>

			<TimingSheet
				open={timingOpen}
				onOpenChange={setTimingOpen}
				run={r}
				timing={timing}
				live={live}
				log={log}
				onOpenFile={fromSheet(setOpenFile)}
				onOpenWorker={fromSheet(setOpenWorker)}
			/>

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
								p90 {formatMs(p90.get(baseFile(opened.file)))}
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
				{openFile && <FileHistoryChart file={baseFile(openFile)} runId={id} />}
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
		</div>
	);
};
