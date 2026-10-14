import { useRef } from "react";
import type { EventsData } from "../components/analytics-types";
import type { ChartGeometry } from "../utils/chartLoadingState";
import type { ChartSeriesConfig } from "../utils/transformGroupedChartData";

export interface ShownChart {
	chartData: EventsData;
	chartConfig: ChartSeriesConfig[];
	chartTicks: number[] | undefined;
	geometry: ChartGeometry;
	unit?: string;
}

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
		lastShownRef.current = null;
	}

	return lastShownRef.current;
};
