import { DEFAULT_PLOT_INSETS, type PlotInsets } from "../utils/chartGeometry";

const Y_POSITIONS = [0, 25, 50, 75, 100] as const;

/** Empty grid for the usage chart's first load, laid out on the real plot geometry. */
export const ChartSkeleton = ({
	geometry = DEFAULT_PLOT_INSETS,
}: {
	geometry?: PlotInsets;
}) => (
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
	</div>
);
