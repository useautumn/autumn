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
				<Bar dataKey="value" isAnimationActive={false} />
			</UsageChartFrame>
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
