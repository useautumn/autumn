import {
	CustomerExportPhase,
	type CustomerExportProgress,
	type CustomerExportResponse,
} from "@autumn/shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const EASE_OUT = [0.32, 0.72, 0, 1] as const;

const ENTER_TRANSITION = { duration: 0.3, ease: EASE_OUT };
/** Held back so the bar visibly completes to 100% before it collapses. */
const EXIT_TRANSITION = { duration: 0.25, ease: EASE_OUT, delay: 0.55 };
const FILL_TRANSITION = { duration: 0.45, ease: EASE_OUT };
/** The scan has no total, so the bar sweeps instead of filling; reduced
 * motion parks the segment mid-track instead. */
const SCAN_TRANSITION = {
	duration: 1.4,
	ease: "easeInOut",
	repeat: Infinity,
} as const;

const PERCENT_MAX = 100;

const toPercent = ({
	processed_rows,
	total_rows,
}: {
	processed_rows: number;
	total_rows: number;
}) => {
	if (total_rows === 0) return 0;
	return Math.min(
		PERCENT_MAX,
		Math.round((processed_rows / total_rows) * PERCENT_MAX),
	);
};

const toCount = ({ progress }: { progress: CustomerExportProgress }) =>
	progress.phase === CustomerExportPhase.Scanning
		? `${progress.processed_rows.toLocaleString()} subscriptions found`
		: `${progress.processed_rows.toLocaleString()} of ${progress.total_rows.toLocaleString()} rows`;

const toLabel = ({
	activeExport,
	scanningLabel,
	runningLabel,
}: {
	activeExport: CustomerExportResponse;
	scanningLabel: string;
	runningLabel: string;
}) => {
	if (activeExport.status === "queued") return "Export queued";
	return activeExport.progress?.phase === CustomerExportPhase.Scanning
		? scanningLabel
		: runningLabel;
};

export function CustomerExportActiveProgress({
	activeExport,
	runningLabel,
	scanningLabel = runningLabel,
}: {
	activeExport: CustomerExportResponse | undefined;
	scanningLabel?: string;
	runningLabel: string;
}) {
	const shouldReduceMotion = useReducedMotion();

	const progress = activeExport?.progress;
	const isScanning = progress?.phase === CustomerExportPhase.Scanning;
	const percent = progress ? toPercent(progress) : 0;

	return (
		<AnimatePresence initial={false}>
			{activeExport && (
				<motion.output
					key="export-progress"
					className="block overflow-hidden"
					initial={{ opacity: 0, height: 0 }}
					animate={{ opacity: 1, height: "auto" }}
					exit={{
						opacity: 0,
						height: 0,
						transition: shouldReduceMotion ? { duration: 0 } : EXIT_TRANSITION,
					}}
					transition={shouldReduceMotion ? { duration: 0 } : ENTER_TRANSITION}
				>
					<div className="flex flex-col gap-1.5 pb-2">
						<div className="flex items-center justify-between gap-2 text-xs">
							<span className="text-foreground">
								{toLabel({ activeExport, scanningLabel, runningLabel })}
							</span>
							{progress ? (
								<span className="text-tertiary-foreground tabular-nums">
									{toCount({ progress })}
								</span>
							) : null}
						</div>

						<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
							{isScanning ? (
								<motion.div
									key="scan"
									className="h-full w-1/3 rounded-full bg-primary"
									initial={shouldReduceMotion ? false : { x: "-100%" }}
									animate={{ x: shouldReduceMotion ? "100%" : "300%" }}
									transition={
										shouldReduceMotion ? { duration: 0 } : SCAN_TRANSITION
									}
								/>
							) : (
								<motion.div
									key="fill"
									className="h-full rounded-full bg-primary"
									initial={false}
									animate={{ width: `${percent}%` }}
									exit={{
										width: "100%",
										transition: shouldReduceMotion
											? { duration: 0 }
											: FILL_TRANSITION,
									}}
									transition={
										shouldReduceMotion ? { duration: 0 } : FILL_TRANSITION
									}
								/>
							)}
						</div>
					</div>
				</motion.output>
			)}
		</AnimatePresence>
	);
}
