import { cn } from "@/lib/utils";
import {
	barLayout,
	DEFAULT_PLOT_INSETS,
	type PlotInsets,
} from "../utils/chartGeometry";
import { formatBinStartLabel } from "../utils/parseTimestamp";
import { StubSweep } from "./StubSweep";

const Y_POSITIONS = [0, 25, 50, 75] as const;
/** Roughly what recharts fits on the x-axis at dashboard widths. */
const MAX_X_LABELS = 16;

/** The new range's bins as 6px stubs on the real axis, each exactly where its bar will grow. */
export const ChartSkeleton = ({
	binStarts,
	interval,
	isSweeping,
	seriesCount,
	geometry = DEFAULT_PLOT_INSETS,
}: {
	binStarts: number[];
	interval: string;
	isSweeping: boolean;
	seriesCount: number;
	geometry?: PlotInsets;
}) => {
	const { fillInset, fillWidth } = barLayout({
		barCount: binStarts.length,
		seriesCount,
	});
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
					<div key={binStart} className="min-w-0 flex-1">
						<div
							className="h-full rounded-t-[2px] bg-tertiary-foreground/20"
							style={{ marginLeft: fillInset, width: fillWidth }}
						/>
					</div>
				))}
				{isSweeping && <StubSweep />}
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
