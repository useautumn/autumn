import { CircleNotchIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import { useTimeRange } from "./query/useTimeRange";

const SLOW_AFTER_SECONDS = 5;
const FAST_FALLBACK_INTERVAL = "30d";
const LONG_INTERVALS = new Set(["90d", "3bc", "6m", "12m", "custom"]);
const FADE = { duration: 0.2 } as const;

/** Spinner over the empty chart; once the load turns slow, says so and offers a shorter range. */
export const FirstLoadNotice = ({ active }: { active: boolean }) => {
	const seconds = useElapsedSeconds({ active });
	const { interval, selectPreset } = useTimeRange();
	const isSlow = seconds >= SLOW_AFTER_SECONDS;
	const canShortenRange = LONG_INTERVALS.has(interval);

	return (
		<AnimatePresence>
			{active && (
				<motion.div
					key="first-load"
					className="absolute inset-0 flex items-center justify-center pointer-events-none"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={FADE}
				>
					<div className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg bg-background px-7 py-5">
						<CircleNotchIcon size={18} className="animate-spin text-primary" />
						<AnimatePresence>
							{isSlow && (
								<motion.div
									key="slow"
									className="flex flex-col items-center gap-3"
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									transition={FADE}
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
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
};
