import { cn } from "../../lib/format.ts";

/** A bare trend line (values oldest first); the floor follows the data so small dips stay visible. */
export const Sparkline = ({
	values,
	width,
	height,
	className,
}: {
	values: number[];
	width: number;
	height: number;
	className?: string;
}) => {
	if (values.length < 2) return null;
	const lo = Math.min(...values) - 0.3;
	const hi = Math.max(...values, lo + 1) + 0.2;
	const points = values.map((v, i) => [
		(i / (values.length - 1)) * (width - 4) + 2,
		height - 2 - ((v - lo) / (hi - lo)) * (height - 4),
	]);
	const line = points
		.map(([x, y], i) => `${i ? "L" : "M"}${x?.toFixed(1)},${y?.toFixed(1)}`)
		.join(" ");
	return (
		<svg
			role="img"
			aria-label={`Trend over ${values.length} runs`}
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			className={cn("shrink-0 text-green-500", className)}
		>
			<path
				d={line}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				strokeLinejoin="round"
			/>
		</svg>
	);
};
