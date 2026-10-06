import { Link } from "react-router-dom";
import type { RunSummary } from "../../../../src/api/contract.ts";
import { CostValue } from "../../components/cost.tsx";
import { RunLabel } from "../../components/runLabel.tsx";
import { Pill, RunProgress, RunStatusBadge } from "../../components/status.tsx";
import { Skeleton } from "../../components/ui.tsx";
import { cn, formatMs, num, sha7 } from "../../lib/format.ts";
import { EmptyNote, RunCard, ScrollFade } from "../runDetail/runCard.tsx";
import { WORKER_COLOR } from "../runDetail/workersCard.tsx";
import { scopeLabel } from "./runFacts.ts";

type Status = keyof NonNullable<RunSummary["live"]>["workers"];
/** Attached workers first in grid order; dead ones have handed their account back. */
const GRID_ORDER: Status[] = [
	"busy",
	"ready",
	"booting",
	"provisioning",
	"failed",
];

const MiniWorkerGrid = ({ run }: { run: RunSummary }) => {
	const counts = run.live?.workers ?? {};
	const cells = GRID_ORDER.flatMap((status) =>
		Array.from({ length: counts[status] ?? 0 }, () => status),
	);
	const empty = Math.max(0, (run.workersWanted ?? 0) - cells.length);
	if (cells.length + empty === 0) return null;
	return (
		<div className="flex max-h-[62px] flex-wrap gap-[2px] overflow-hidden">
			{cells.map((status, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: cells of one status are interchangeable
					key={i}
					className={cn(
						"size-[5px] shrink-0 rounded-[1px]",
						WORKER_COLOR[status],
						status === "busy" && "twd-pulse",
					)}
				/>
			))}
			{Array.from({ length: empty }, (_, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: interchangeable empty slots
					key={`empty-${i}`}
					className="size-[5px] shrink-0 rounded-[1px] border border-dashed border-subtle/50"
				/>
			))}
		</div>
	);
};

/** ETA once the server has one; otherwise what the run is waiting on. */
const statusNote = (run: RunSummary) => {
	if (run.live?.etaMs != null) return `ETA ${formatMs(run.live.etaMs)}`;
	if (run.queuePosition !== null) return "waiting for accounts";
	if (run.status === "queued") return "waiting for warm image";
	if (run.status === "warming") return "building image";
	if (run.status === "provisioning") return "booting workers";
	if (run.status === "tearing_down") return "tearing down";
	return "estimating…";
};

const LiveRunRow = ({ run }: { run: RunSummary }) => {
	const total = run.fileCount ?? 0;
	const hasEta = run.live?.etaMs != null;
	return (
		<Link
			to={`/runs/${run.id}`}
			className="flex flex-col gap-[7px] border-b border-border/60 py-3 outline-none last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/40"
		>
			<div className="flex min-w-0 items-center gap-1.5">
				<RunLabel
					run={run}
					showSha={false}
					className="min-w-0 text-[12.5px]"
					primaryClassName="font-semibold text-foreground"
				/>
				<span className="flex-1" />
				{run.queuePosition !== null ? (
					<Pill className="tabular-nums">Queued · #{run.queuePosition}</Pill>
				) : (
					<RunStatusBadge status={run.status} />
				)}
			</div>
			<div className="flex min-w-0 items-center gap-1.5 text-[11px]">
				<span className="shrink-0 font-mono text-subtle">{sha7(run.sha)}</span>
				<span className="min-w-0 truncate font-mono text-tertiary-foreground">
					{scopeLabel(run)}
				</span>
				<span className="flex-1" />
				<span
					className={cn(
						"shrink-0 tabular-nums",
						hasEta
							? "text-[11.5px] font-semibold text-foreground"
							: "text-subtle",
					)}
				>
					{statusNote(run)}
				</span>
			</div>
			<MiniWorkerGrid run={run} />
			<div className="flex items-center gap-1.5 text-[11.5px] tabular-nums">
				<RunProgress
					className="w-[150px] shrink-0"
					passed={run.passed}
					failed={run.failed}
					total={total}
				/>
				<span className="font-medium whitespace-nowrap text-muted-foreground">
					{num(run.passed + run.failed)}/{total ? num(total) : "—"}
					{run.failed > 0 && (
						<span className="text-red-600 dark:text-red-400">
							{" "}
							· {num(run.failed)} failed
						</span>
					)}
				</span>
				<span className="flex-1" />
				<CostValue cost={run.cost} className="font-medium" />
			</div>
		</Link>
	);
};

export const LiveNowCard = ({
	runs,
	isLoading,
	filtered,
}: {
	runs: RunSummary[] | undefined;
	isLoading: boolean;
	filtered: boolean;
}) => (
	<RunCard
		title="Live now"
		className="w-[340px] shrink-0 max-lg:w-[300px] max-sm:h-80 max-sm:w-full"
		right={
			<span className="text-xs text-subtle tabular-nums">
				{runs ? num(runs.length) : ""}
			</span>
		}
	>
		{isLoading && !runs ? (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
		) : runs?.length ? (
			<ScrollFade className="-mt-2.5">
				{runs.map((run) => (
					<LiveRunRow key={run.id} run={run} />
				))}
			</ScrollFade>
		) : (
			<EmptyNote>
				{filtered
					? "No live runs match the branch filter."
					: "Nothing running. Runs appear here the moment they are queued."}
			</EmptyNote>
		)}
	</RunCard>
);
