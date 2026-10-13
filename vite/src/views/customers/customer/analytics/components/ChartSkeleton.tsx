import { motion } from "motion/react";
import { Bar } from "recharts";
import { useFadeTransition } from "../hooks/useFadeTransition";
import {
	barLayout,
	PLOT_INSETS,
	SKELETON_Y_TICKS,
} from "../utils/chartGeometry";
import { formatBinStartLabel } from "../utils/parseTimestamp";
import { StubSweep } from "./StubSweep";
import { UsageChartFrame } from "./UsageChartFrame";

const NO_SERIES = {};
const STUB_BAND_STYLE = {
	left: PLOT_INSETS.left,
	right: PLOT_INSETS.right,
	bottom: PLOT_INSETS.bottom,
};

/** The new range's bins as 6px stubs on the real axis, each exactly where its bar will grow. */
export const ChartSkeleton = ({
	binStarts,
	interval,
	isSweeping,
	seriesCount,
}: {
	binStarts: number[];
	interval: string;
	isSweeping: boolean;
	seriesCount: number;
}) => {
	const fade = useFadeTransition();
	const { categoryGap, fillInset, fillWidth } = barLayout({
		barCount: binStarts.length,
		seriesCount,
	});

	return (
		<div className="relative min-h-0 flex-1">
			<UsageChartFrame
				config={NO_SERIES}
				data={binStarts.map((binStart) => ({ period: binStart, value: 0 }))}
				ticks={SKELETON_Y_TICKS}
				barCategoryGap={categoryGap}
				formatXTick={(binStart: number) =>
					formatBinStartLabel({ binStart, interval })
				}
				showYTicks={false}
			>
				{/* An all-zero series: recharts builds the y scale, and so the gridlines, only from a series. */}
				<Bar dataKey="value" isAnimationActive={false} />
			</UsageChartFrame>
			{/* Only the stubs fade out: the axes stay opaque under the chart fading in on top, so they never dim. */}
			<motion.div
				className="absolute flex h-1.5 overflow-hidden"
				style={STUB_BAND_STYLE}
				exit={{ opacity: 0 }}
				transition={fade}
			>
				{binStarts.map((binStart) => (
					<div key={binStart} className="min-w-0 flex-1">
						<div
							className="h-full rounded-t-[2px] bg-tertiary-foreground/20"
							style={{ marginLeft: fillInset, width: fillWidth }}
						/>
					</div>
				))}
				{isSweeping && <StubSweep />}
			</motion.div>
		</div>
	);
};
