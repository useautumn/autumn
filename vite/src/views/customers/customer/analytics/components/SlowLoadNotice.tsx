import { overlaySurfaceClassName } from "@autumn/ui/lib/overlay-classes";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useFadeTransition } from "../hooks/useFadeTransition";
import { useTimeRange } from "./query/useTimeRange";

const FAST_FALLBACK_INTERVAL = "30d";
const LONG_INTERVALS = new Set(["90d", "3bc", "6m", "12m", "custom"]);

/** Over the stubs once a load turns slow; its spinner is the only motion left, and it offers a shorter range. */
export const SlowLoadNotice = ({ seconds }: { seconds: number }) => {
	const { interval, selectPreset } = useTimeRange();
	const canShortenRange = LONG_INTERVALS.has(interval);
	const fade = useFadeTransition();

	return (
		<motion.div
			className="absolute inset-0 flex items-center justify-center pointer-events-none"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={fade}
		>
			<div
				className={cn(
					overlaySurfaceClassName,
					"pointer-events-auto flex items-center gap-3 px-4 py-3",
				)}
			>
				<CircleNotchIcon className="size-4 shrink-0 animate-spin text-tertiary-foreground motion-reduce:animate-none" />
				<div className="flex flex-col gap-0.5">
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
						className="ml-2 h-7 shrink-0 rounded-md border bg-interactive-secondary px-2.5 text-xs text-foreground hover:bg-muted"
					>
						Try last 30 days
					</button>
				)}
			</div>
		</motion.div>
	);
};
