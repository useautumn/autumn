import { getEffectiveBinSize } from "./intervals";

export interface ChartGeometry {
	interval: string;
	binSize: string;
	start: number | null;
	end: number | null;
}

export type ChartLoadingState = "dim" | "stubs";

export const chartGeometryOf = ({
	interval,
	binSize,
	start,
	end,
}: {
	interval: string;
	binSize: string | null;
	start: number | null;
	end: number | null;
}): ChartGeometry => ({
	interval,
	binSize: getEffectiveBinSize({ interval, binSize }),
	start: interval === "custom" ? start : null,
	end: interval === "custom" ? end : null,
});

const isSameGeometry = (a: ChartGeometry, b: ChartGeometry) =>
	a.interval === b.interval &&
	a.binSize === b.binSize &&
	a.start === b.start &&
	a.end === b.end;

export const chartLoadingState = ({
	current,
	previous,
}: {
	current: ChartGeometry;
	previous: ChartGeometry | null;
}): ChartLoadingState =>
	previous && isSameGeometry(current, previous) ? "dim" : "stubs";
