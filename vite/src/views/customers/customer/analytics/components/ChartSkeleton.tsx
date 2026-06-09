import { useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyticsQueryState } from "../hooks/useAnalyticsQueryState";
import {
	bandGridStyle,
	buildSkeletonBars,
	DEFAULT_PLOT_INSETS,
	type PlotInsets,
	predictBarCount,
} from "../utils/chartGeometry";
import { SkeletonBar } from "./SkeletonBar";

const Y_POSITIONS = [0, 25, 50, 75, 100] as const;
const X_LABELS = 7;

/** Loading placeholder for the usage chart that morphs into the real chart. */
export const ChartSkeleton = ({
	targets,
	geometry = DEFAULT_PLOT_INSETS,
}: {
	targets?: number[] | null;
	geometry?: PlotInsets;
}) => {
	const { queryStates } = useAnalyticsQueryState();
	const prefersReducedMotion = useReducedMotion();
	const settledHeights = targets && targets.length > 0 ? targets : null;
	const barCount =
		settledHeights?.length ??
		predictBarCount({
			interval: queryStates.interval,
			binSize: queryStates.bin_size,
			start: queryStates.start,
			end: queryStates.end,
		});
	const bars = useMemo(() => buildSkeletonBars(barCount), [barCount]);

	return (
		<div className="relative flex flex-1 flex-col">
			<div className="flex h-7 shrink-0 items-center gap-4 border-b bg-card px-2">
				{[72, 56, 64].map((width, i) => (
					<div key={i} className="flex items-center gap-1.5">
						<Skeleton className="size-2 rounded-sm" />
						<Skeleton className="h-2.5 rounded-sm" style={{ width }} />
						<Skeleton className="h-2.5 w-8 rounded-sm" />
					</div>
				))}
			</div>

			<div
				className="flex min-h-0 flex-1 flex-col"
				style={{ paddingTop: geometry.top, paddingRight: geometry.right }}
			>
				<div className="flex min-h-0 flex-1">
					<div className="relative shrink-0" style={{ width: geometry.left }}>
						{Y_POSITIONS.map((top) => (
							<Skeleton
								key={top}
								className="absolute right-2 h-2 w-5 -translate-y-1/2 rounded-sm"
								style={{ top: `${top}%` }}
							/>
						))}
					</div>

					<div className="relative min-w-0 flex-1" style={bandGridStyle(barCount)}>
						<div className="pointer-events-none absolute inset-0">
							{Y_POSITIONS.map((top) => (
								<div
									key={top}
									className="absolute inset-x-0 border-t border-dashed"
									style={{ top: `${top}%`, borderColor: "var(--chart-grid-stroke)" }}
								/>
							))}
						</div>
						{bars.map((bar, i) => (
							<SkeletonBar
								key={i}
								bar={bar}
								targetHeight={settledHeights ? settledHeights[i] : null}
								reducedMotion={!!prefersReducedMotion}
							/>
						))}
					</div>
				</div>

				<div
					className="flex shrink-0 justify-between pt-1"
					style={{ height: geometry.bottom, paddingLeft: geometry.left }}
				>
					{Array.from({ length: X_LABELS }, (_, i) => (
						<Skeleton key={i} className="h-2 w-6 rounded-sm" />
					))}
				</div>
			</div>

			<div className="bg-white/40 dark:bg-black/40 pointer-events-none absolute inset-0" />
		</div>
	);
};
