import { getEffectiveBinSize } from "./intervals";

/** What decides where the chart's bars sit: same geometry means the same bins on the same dates. */
export interface ChartGeometry {
	interval: string;
	binSize: string;
	start: number | null;
	end: number | null;
}

/** "dim" keeps the last chart up behind the load; "stubs" lays out the new bins before data lands. */
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

/** Dim the last chart when only the data changes; show stubs when the bins move or nothing has loaded. */
export const chartLoadingState = ({
	current,
	previous,
}: {
	current: ChartGeometry;
	previous: ChartGeometry | null;
}): ChartLoadingState =>
	previous && isSameGeometry(current, previous) ? "dim" : "stubs";
