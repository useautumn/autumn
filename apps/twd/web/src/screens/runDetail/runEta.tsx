import { ChartPie } from "lucide-react";
import type { RunDetail } from "../../../../src/api/contract.ts";
import { roundEta } from "../../../../src/internal/runs/eta/smoothEta.ts";
import { StatusDot } from "../../components/status.tsx";
import { cn, formatMs } from "../../lib/format.ts";
import { useSmoothedEta } from "../../lib/useSmoothedEta.ts";
import { TERMINAL } from "./runFiles.ts";

const ESTIMATING = new Set(["provisioning", "running", "tearing_down"]);

/** The stats-row timing chip: live ETA (or wall time once finished); opens the Timing sheet. */
export const RunEtaButton = ({
	run,
	now,
	wallMs,
	open,
	onOpen,
}: {
	run: RunDetail;
	now: number;
	wallMs: number;
	open: boolean;
	onOpen: () => void;
}) => {
	const eta = useSmoothedEta({
		etaMs: run.etaMs,
		etaP90Ms: run.etaP90Ms,
		now,
	});
	const finished = TERMINAL.has(run.status);
	if (!finished && !ESTIMATING.has(run.status))
		return (
			<span className="flex items-center gap-2 text-xs text-tertiary-foreground">
				<StatusDot tone="info" pulse />
				{run.phase ?? run.status}
			</span>
		);
	if (finished && !run.startedAt) return null;

	const spread = eta ? roundEta(eta.etaP90Ms - eta.etaMs) : 0;
	return (
		<span className="flex items-baseline gap-3">
			{!finished && run.status !== "running" && run.phase && (
				<span className="text-xs text-subtle">{run.phase}</span>
			)}
			<button
				type="button"
				data-testid="run-eta"
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={onOpen}
				title="Timing & boot"
				className={cn(
					"group flex cursor-pointer items-baseline gap-1.5 rounded-[7px] border px-2 py-0.5 tabular-nums outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/40",
					open
						? "border-(--card-border) bg-muted"
						: "border-transparent hover:border-border hover:bg-interactive-secondary hover:shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
				)}
			>
				{finished ? (
					<>
						<span className="text-[22px] leading-7 font-semibold text-foreground">
							{formatMs(wallMs)}
						</span>
						<span className="text-xs text-tertiary-foreground">wall</span>
					</>
				) : eta ? (
					<>
						<span className="text-[22px] leading-7 font-semibold text-foreground">
							{formatMs(roundEta(eta.etaMs))}
						</span>
						<span className="text-xs text-tertiary-foreground">ETA</span>
						{spread > 5_000 && (
							<span className="text-xs text-subtle">± {formatMs(spread)}</span>
						)}
					</>
				) : (
					<span className="text-[13px] leading-7 text-subtle">estimating…</span>
				)}
				<ChartPie
					aria-hidden
					className={cn(
						"size-3 self-center transition-colors",
						open
							? "text-foreground"
							: "text-subtle group-hover:text-foreground",
					)}
					strokeWidth={2}
				/>
			</button>
		</span>
	);
};
