import { Hourglass } from "lucide-react";
import type { RunDetail } from "../../../../src/api/contract.ts";
import { summariseBoot } from "../../../../src/internal/runs/boot/summariseBoot.ts";
import { Tooltip } from "../../components/ui.tsx";
import { cn, formatMs, num } from "../../lib/format.ts";
import { EmptyNote, RunCard } from "./runCard.tsx";
import { shortWorker } from "./runFiles.ts";

type WorkerStatus = RunDetail["workers"][number]["status"];

export const WORKER_COLOR: Record<WorkerStatus, string> = {
	busy: "bg-blue-500",
	ready: "bg-green-500/35",
	booting: "bg-orange-400/60",
	provisioning: "bg-subtle/40",
	failed: "bg-red-500",
	dead: "bg-subtle/60",
};
const LEGEND_ORDER = Object.keys(WORKER_COLOR) as WorkerStatus[];

/** Big runs get smaller squares so the grid keeps to a few rows. */
const boxClass = (slots: number) =>
	slots > 160
		? { box: "size-2.5 rounded-[2px]", gap: "gap-[3px]" }
		: { box: "size-4 rounded-[3px]", gap: "gap-[5px]" };

const WorkerGrid = ({
	workers,
	wanted,
	onOpen,
}: {
	workers: RunDetail["workers"];
	wanted: number;
	onOpen: (worker: string) => void;
}) => {
	const empty = Math.max(0, wanted - workers.length);
	const { box, gap } = boxClass(workers.length + empty);
	return (
		<div className={cn("flex max-h-36 flex-wrap overflow-y-auto p-px", gap)}>
			{workers.map((w) => (
				<Tooltip
					key={w.name}
					content={
						<span>
							<span className="font-mono">{shortWorker(w.name)}</span> ·{" "}
							{w.status}
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
							"twd-pop shrink-0 cursor-pointer outline-none hover:ring-1 hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/60",
							box,
							WORKER_COLOR[w.status],
							w.status === "busy" && "twd-pulse",
						)}
						aria-label={`${w.name} ${w.status}, open logs`}
					/>
				</Tooltip>
			))}
			{Array.from({ length: empty }, (_, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: interchangeable empty slots
					key={i}
					className={cn("shrink-0 border border-dashed border-subtle/50", box)}
					aria-hidden
				/>
			))}
		</div>
	);
};

/** Worker squares (click one for its log), a status legend, and boot p50 · p90. */
export const WorkersCard = ({
	run,
	live,
	onOpenWorker,
}: {
	run: RunDetail;
	live: boolean;
	onOpenWorker: (worker: string) => void;
}) => {
	const wanted = live ? (run.workersWanted ?? 0) : 0;
	const counts = new Map<WorkerStatus, number>();
	for (const w of run.workers)
		counts.set(w.status, (counts.get(w.status) ?? 0) + 1);
	const boot = summariseBoot(run.workers);
	const waiting = Math.max(0, wanted - run.workers.length);
	return (
		<RunCard
			title="Workers"
			className="shrink-0"
			right={
				<span className="text-xs font-medium text-foreground tabular-nums">
					{!live && "peak "}
					{num(run.workerCount ?? 0)}
					{run.workersWanted !== null && ` / ${num(run.workersWanted)}`}
				</span>
			}
		>
			{run.queuePosition !== null && (
				<p className="flex items-center gap-2 text-xs text-tertiary-foreground">
					<Hourglass className="size-3.5 text-subtle" />
					Waiting for accounts ·{" "}
					<span className="text-foreground tabular-nums">
						#{run.queuePosition}
					</span>{" "}
					in queue
				</p>
			)}
			{run.workers.length || wanted ? (
				<WorkerGrid
					workers={run.workers}
					wanted={wanted}
					onOpen={onOpenWorker}
				/>
			) : (
				<EmptyNote>No workers yet.</EmptyNote>
			)}
			{(run.workers.length > 0 || waiting > 0) && (
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-tertiary-foreground tabular-nums">
					<div className="flex flex-wrap gap-x-3 gap-y-1">
						{LEGEND_ORDER.filter((s) => counts.has(s)).map((s) => (
							<span key={s} className="flex items-center gap-1.5">
								<span className={cn("size-2 rounded-[2px]", WORKER_COLOR[s])} />
								{num(counts.get(s) ?? 0)} {s}
							</span>
						))}
						{waiting > 0 && (
							<span className="flex items-center gap-1.5">
								<span className="size-2 rounded-[2px] border border-dashed border-subtle/60" />
								{num(waiting)} waiting for accounts
							</span>
						)}
					</div>
					{boot && (
						<span className="text-subtle">
							boot p50 {formatMs(boot.total.p50)} · p90{" "}
							{formatMs(boot.total.p90)}
						</span>
					)}
				</div>
			)}
		</RunCard>
	);
};
