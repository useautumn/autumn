import type { CustomerExportResponse } from "@autumn/shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const EASE_OUT = [0.32, 0.72, 0, 1] as const;

const ENTER_TRANSITION = { duration: 0.3, ease: EASE_OUT };
/** Held back so the bar visibly completes to 100% before it collapses. */
const EXIT_TRANSITION = { duration: 0.25, ease: EASE_OUT, delay: 0.55 };
const FILL_TRANSITION = { duration: 0.45, ease: EASE_OUT };

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

export function CustomerExportActiveProgress({
	activeExport,
}: {
	activeExport: CustomerExportResponse | undefined;
}) {
	const shouldReduceMotion = useReducedMotion();

	const progress = activeExport?.progress;
	const percent = progress ? toPercent(progress) : 0;
	const label =
		activeExport?.status === "queued" ? "Export queued" : "Exporting customers";

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
							<span className="text-foreground">{label}</span>
							{progress ? (
								<span className="text-tertiary-foreground tabular-nums">
									{progress.processed_rows.toLocaleString()} of{" "}
									{progress.total_rows.toLocaleString()} rows
								</span>
							) : null}
						</div>

						<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
							<motion.div
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
						</div>
					</div>
				</motion.output>
			)}
		</AnimatePresence>
	);
}
