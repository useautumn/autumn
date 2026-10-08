import { Skeleton } from "@autumn/ui";
import {
	barSpacing,
	DEFAULT_PLOT_INSETS,
	type PlotInsets,
} from "../utils/chartGeometry";

const Y_POSITIONS = [0, 25, 50, 75, 100] as const;
const MIN_BAR_HEIGHT = 0.25;
const BAR_HEIGHT_RANGE = 0.6;

/** A stable 25–85% height per bar, so the skeleton never reshuffles between renders. */
const barHeight = (index: number) => {
	const noise = Math.sin(index * 12.9898) * 43758.5453;
	return MIN_BAR_HEIGHT + (noise - Math.floor(noise)) * BAR_HEIGHT_RANGE;
};

/** Static bars on the real plot geometry; the shared Skeleton pulse is its only motion. */
export const ChartSkeleton = ({
	barCount,
	geometry = DEFAULT_PLOT_INSETS,
}: {
	barCount: number;
	geometry?: PlotInsets;
}) => {
	const { barWidth } = barSpacing({ barCount });

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
			<div className="absolute inset-0 flex items-end">
				{Array.from({ length: barCount }, (_, index) => (
					<div
						key={index}
						className="flex h-full min-w-0 flex-1 items-end justify-center"
					>
						<Skeleton
							className="rounded-t-[3px] rounded-b-none"
							style={{ width: barWidth, height: `${barHeight(index) * 100}%` }}
						/>
					</div>
				))}
			</div>
		</div>
	);
};
