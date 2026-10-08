import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import {
	barSpacing,
	DEFAULT_PLOT_INSETS,
	type PlotInsets,
} from "../utils/chartGeometry";
import { formatBinStartLabel } from "../utils/parseTimestamp";

const Y_POSITIONS = [0, 25, 50, 75] as const;
/** Roughly what recharts fits on the x-axis at dashboard widths. */
const MAX_X_LABELS = 16;
const SWEEP = {
	duration: 1.6,
	ease: "easeInOut",
	repeat: Number.POSITIVE_INFINITY,
} as const;

/** The new range's bins as 6px stubs on the real axis; the bars grow out of them when data lands. */
export const ChartSkeleton = ({
	binStarts,
	interval,
	isSweeping,
	geometry = DEFAULT_PLOT_INSETS,
}: {
	binStarts: number[];
	interval: string;
	isSweeping: boolean;
	geometry?: PlotInsets;
}) => {
	const prefersReducedMotion = useReducedMotion();
	const { barWidth } = barSpacing({ barCount: binStarts.length });
	const labelEvery = Math.ceil(binStarts.length / MAX_X_LABELS);

	return (
		<div
			className="relative flex-1"
			style={{
				marginTop: geometry.top,
				marginRight: geometry.right,
				marginBottom: geometry.bottom,
				marginLeft: geometry.left,
			}}
		>
			{Y_POSITIONS.map((top) => (
				<div
					key={top}
					className="absolute inset-x-0 border-t border-dashed"
					style={{ top: `${top}%`, borderColor: "var(--chart-grid-stroke)" }}
				/>
			))}
			<div className="absolute inset-x-0 bottom-0 flex h-1.5 overflow-hidden">
				{binStarts.map((binStart) => (
					<div key={binStart} className="flex min-w-0 flex-1 justify-center">
						<div
							className="h-full rounded-t-[2px] bg-tertiary-foreground/20"
							style={{ width: barWidth }}
						/>
					</div>
				))}
				{isSweeping && !prefersReducedMotion && (
					// x is a share of the band's own width: -100% starts it off the left edge, 400% clears the right.
					<motion.div
						className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
						initial={{ x: "-100%" }}
						animate={{ x: "400%" }}
						transition={SWEEP}
					/>
				)}
			</div>
			<div className="absolute inset-x-0 top-full flex pt-1">
				{binStarts.map((binStart, index) => (
					<span
						key={binStart}
						className={cn(
							"flex min-w-0 flex-1 justify-center whitespace-nowrap text-[11px] leading-4 text-tertiary-foreground",
							index % labelEvery !== 0 && "invisible",
						)}
					>
						{formatBinStartLabel({ binStart, interval })}
					</span>
				))}
			</div>
		</div>
	);
};
