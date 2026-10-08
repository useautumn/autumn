import { overlaySurfaceClassName } from "@autumn/ui/lib/overlay-classes";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import { useFadeTransition } from "../hooks/useFadeTransition";
import { useTimeRange } from "./query/useTimeRange";

const SLOW_AFTER_SECONDS = 5;
const FAST_FALLBACK_INTERVAL = "30d";
const LONG_INTERVALS = new Set(["90d", "3bc", "6m", "12m", "custom"]);

/** Shown over the chart skeleton only once a first load turns slow; offers a shorter range. */
export const FirstLoadNotice = ({ active }: { active: boolean }) => {
	const seconds = useElapsedSeconds({ active });
	const { interval, selectPreset } = useTimeRange();
	const isSlow = seconds >= SLOW_AFTER_SECONDS;
	const canShortenRange = LONG_INTERVALS.has(interval);
	const fade = useFadeTransition();

	return (
		<AnimatePresence>
			{active && isSlow && (
				<motion.div
					key="first-load"
					className="absolute inset-0 flex items-center justify-center pointer-events-none"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={fade}
				>
					<div
						className={cn(
							overlaySurfaceClassName,
							"pointer-events-auto flex flex-col items-center gap-3 px-6 py-4",
						)}
					>
						<div className="flex flex-col items-center gap-1">
							<p className="text-sm font-medium text-foreground">
								Still counting events
							</p>
							<p className="text-xs text-tertiary-foreground tabular-nums">
								{seconds}s so far · longer ranges take more time
							</p>
						</div>
						{canShortenRange && (
							<button
								type="button"
								onClick={() => selectPreset(FAST_FALLBACK_INTERVAL)}
								className="h-7 rounded-md border bg-interactive-secondary px-2.5 text-xs text-foreground hover:bg-muted"
							>
								Try last 30 days
							</button>
						)}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
};
