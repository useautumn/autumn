import { Activity, FileText, Zap } from "lucide-react";
import type { ReactNode } from "react";
// Light section primitives imported DIRECTLY (not via the barrel, which pulls in
// motion/react-router/ErrorScreen) — these only depend on `cn`.
import { TableActions } from "@/components/table/table-actions";
import { TableContainer } from "@/components/table/table-container";
import { TableHeading } from "@/components/table/table-heading";
import { TableToolbar } from "@/components/table/table-toolbar";
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	Table as UiTable,
} from "@/components/ui/table";
import { InfoRow } from "@/components/general/info-row";
import type { Phase, Snapshot } from "../types";
import {
	Elapsed,
	FileStatusBadge,
	IndeterminateBar,
	Pill,
	type PillTone,
	ProgressBar,
	SpeedChart,
	WarmStepper,
	WorkerDots,
} from "../widgets";

const PHASE_TONE: Record<Phase, PillTone> = {
	warm: "muted",
	fanout: "blue",
	run: "blue",
	teardown: "yellow",
	done: "green",
};

const fmtWall = (ms: number): string => {
	const s = Math.round(ms / 1000);
	const m = Math.floor(s / 60);
	return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
};

/** App-faithful borderless section: heading row (icon + title + right actions). */
function Section({
	icon,
	title,
	actions,
	children,
	className,
}: {
	icon: ReactNode;
	title: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<TableContainer className={className}>
			<TableToolbar>
				<TableHeading>
					{icon}
					{title}
				</TableHeading>
				{actions ? <TableActions>{actions}</TableActions> : null}
			</TableToolbar>
			{children}
		</TableContainer>
	);
}

function PhaseProgress({ snap }: { snap: Snapshot }) {
	if (snap.phase === "warm") {
		return (
			<div className="flex flex-col gap-3">
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">
						{snap.warmStage < 0
							? "preparing warm parent…"
							: "building warm snapshot"}
					</span>
					<span className="text-muted-foreground text-xs">
						elapsed <Elapsed since={snap.phaseStartedAt} />
					</span>
				</div>
				<WarmStepper stage={snap.warmStage} />
				<IndeterminateBar />
				{snap.activity ? (
					<div className="truncate rounded-md border bg-interactive-secondary px-2.5 py-1.5 font-mono text-muted-foreground text-xs">
						{snap.activity}
					</div>
				) : null}
			</div>
		);
	}
	if (snap.phase === "fanout") {
		return (
			<div className="flex flex-col gap-2.5">
				<div className="flex items-center justify-between text-muted-foreground text-xs">
					<span>spinning up {snap.fanout.workersTotal} workers</span>
					<span>
						elapsed <Elapsed since={snap.phaseStartedAt} />
					</span>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<span className="w-20 text-muted-foreground">stripe</span>
					<ProgressBar
						total={snap.fanout.stripeTotal}
						value={snap.fanout.stripeDone}
					/>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<span className="w-20 text-muted-foreground">workers</span>
					<ProgressBar
						color="bg-sandbox"
						total={snap.fanout.workersTotal}
						value={snap.fanout.workersReady}
					/>
				</div>
				{snap.workers.length > 0 ? <WorkerDots workers={snap.workers} /> : null}
				{snap.activity ? (
					<div className="truncate font-mono text-muted-foreground text-xs">
						{snap.activity}
					</div>
				) : null}
			</div>
		);
	}
	if (snap.phase === "teardown") {
		return (
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2 text-sm">
					<span className="w-20 text-muted-foreground">sandboxes</span>
					<ProgressBar
						color="bg-yellow-400"
						total={snap.teardown.sandboxesTotal}
						value={snap.teardown.sandboxesDone}
					/>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<span className="w-20 text-muted-foreground">accounts</span>
					<ProgressBar
						color="bg-yellow-400"
						total={snap.teardown.accountsTotal}
						value={snap.teardown.accountsDone}
					/>
				</div>
			</div>
		);
	}
	// run / done
	return (
		<div className="flex flex-col gap-3">
			<ProgressBar
				color="bg-green-500"
				total={snap.run.total}
				value={snap.run.done}
			/>
			<div className="flex flex-wrap gap-2">
				<Pill tone="green">✓ {snap.run.passed}</Pill>
				<Pill tone="red">✗ {snap.run.failed}</Pill>
				<Pill tone="blue">{snap.run.running} running</Pill>
				<Pill tone={snap.run.retrying > 0 ? "yellow" : "muted"}>
					{snap.run.retrying} retrying
				</Pill>
			</div>
		</div>
	);
}

function LiveStats({ snap }: { snap: Snapshot }) {
	if (snap.summary) {
		return (
			<div className="flex flex-col gap-1.5">
				<InfoRow label="passed" value={snap.summary.passed} />
				<InfoRow label="failed" value={snap.summary.failed} />
				<InfoRow label="crashed" value={snap.summary.crashed} />
				<InfoRow label="wall" mono value={fmtWall(snap.summary.wallMs)} />
				{snap.summary.costLine ? (
					<InfoRow label="cost" mono value={snap.summary.costLine} />
				) : null}
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-1.5">
			<InfoRow label="tests" value={`${snap.run.done}/${snap.run.total}`} />
			<InfoRow label="passed" value={snap.run.passed} />
			<InfoRow label="failed" value={snap.run.failed} />
			<InfoRow label="running" value={snap.run.running} />
		</div>
	);
}

/** File table — `ui/table` primitives styled to match the app's real tables. */
function FileTable({
	snap,
	onOpenFile,
}: {
	snap: Snapshot;
	onOpenFile: (file: string) => void;
}) {
	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
			<UiTable className="w-full overflow-auto p-0">
				<TableHeader className="sticky top-0 z-20 bg-card">
					<TableRow className="border-b bg-card text-subtle">
						<TableHead className="h-7 px-2 pl-4 font-medium text-subtle text-xs">
							File
						</TableHead>
						<TableHead className="h-7 w-28 px-2 font-medium text-subtle text-xs">
							Status
						</TableHead>
						<TableHead className="h-7 w-20 px-2 font-medium text-subtle text-xs">
							✓ / ✗
						</TableHead>
						<TableHead className="h-7 w-56 px-2 font-medium text-subtle text-xs">
							Worker
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody className="divide-y bg-interactive-secondary">
					{snap.files.map((f) => (
						<TableRow
							className="h-12 cursor-pointer text-tertiary-foreground transition-none hover:bg-interactive-secondary-hover"
							key={f.file}
							onClick={() => onOpenFile(f.file)}
						>
							<TableCell className="h-4 px-2 pl-4 font-medium font-mono text-muted-foreground text-xs">
								{f.name}
							</TableCell>
							<TableCell className="h-4 px-2">
								<FileStatusBadge status={f.status} />
							</TableCell>
							<TableCell className="h-4 px-2 font-mono text-xs tabular-nums">
								<span className="text-green-500">{f.passed}</span>
								{" / "}
								<span className="text-red-500">{f.failed}</span>
							</TableCell>
							<TableCell className="h-4 px-2 font-mono text-tertiary-foreground text-xs">
								{f.worker ?? "—"}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</UiTable>
		</div>
	);
}

export function Overall({
	snap,
	onOpenFile,
}: {
	snap: Snapshot;
	onOpenFile: (file: string) => void;
}) {
	const completedRate =
		snap.completions.length > 1
			? `${snap.completions.length} done`
			: "warming up";
	return (
		<div className="flex h-full flex-col gap-5 overflow-hidden">
			<Section
				actions={
					<span className="text-muted-foreground text-xs">
						{snap.phase === "warm" || snap.phase === "fanout" ? (
							<>
								elapsed <Elapsed since={snap.phaseStartedAt} />
							</>
						) : (
							`${snap.run.done}/${snap.run.total} files`
						)}
					</span>
				}
				icon={<Activity className="size-4 text-subtle" />}
				title={
					<span className="flex items-center gap-2">
						Run
						<Pill tone={PHASE_TONE[snap.phase]}>{snap.phase}</Pill>
						<span className="font-normal text-muted-foreground text-sm">
							{snap.target} · {snap.workerCount} workers
						</span>
					</span>
				}
			>
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
					<div className="lg:col-span-2">
						<PhaseProgress snap={snap} />
					</div>
					<LiveStats snap={snap} />
				</div>
			</Section>

			<Section
				actions={
					<span className="text-muted-foreground text-xs">{completedRate}</span>
				}
				className="shrink-0"
				icon={<Zap className="size-4 text-subtle" />}
				title="Speed — files / sec"
			>
				<SpeedChart completions={snap.completions} />
			</Section>

			<Section
				className="flex min-h-0 flex-1 flex-col"
				icon={<FileText className="size-4 text-subtle" />}
				title={
					<span className="flex items-center gap-2">
						Files
						<span className="font-normal text-muted-foreground text-sm">
							{snap.files.length}
						</span>
					</span>
				}
			>
				<FileTable onOpenFile={onOpenFile} snap={snap} />
			</Section>
		</div>
	);
}
