import { useRef } from "react";
import type { EventsData } from "../components/analytics-types";
import type { ChartSeriesConfig } from "../utils/transformGroupedChartData";

export interface ShownChart {
	chartData: EventsData;
	chartConfig: ChartSeriesConfig[];
	chartTicks: number[] | undefined;
	interval: string;
}

/** The chart to display: the fresh one, else the last one shown while a new query loads. */
export const useLastShownChart = ({
	chart,
	isLoading,
}: {
	chart: ShownChart | null;
	isLoading: boolean;
}) => {
	const lastShownRef = useRef<ShownChart | null>(null);

	if (chart) {
		lastShownRef.current = chart;
	} else if (!isLoading) {
		// A settled empty result must not resurrect an old chart on the next load.
		lastShownRef.current = null;
	}

	const displayedChart = chart ?? (isLoading ? lastShownRef.current : null);
	return { displayedChart, isStale: !chart && displayedChart !== null };
};
