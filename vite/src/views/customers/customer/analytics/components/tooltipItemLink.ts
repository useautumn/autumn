import type { ChartSeriesConfig } from "../utils/transformGroupedChartData";

export type TooltipEntry = Pick<
	ChartSeriesConfig,
	"customerId" | "entityId" | "entityCustomerId"
> & {
	dataKey: string;
	value: number;
	color: string;
};

export type TooltipItemLink = {
	path: string;
	queryParams?: Record<string, string>;
	preserveParams?: boolean;
};

/** The page a tooltip row points at, or undefined when the row is not a link. */
export const tooltipItemLink = ({
	item,
}: {
	item: TooltipEntry;
}): TooltipItemLink | undefined => {
	if (item.customerId) {
		return {
			path: `/customers/${item.customerId}`,
			preserveParams: false,
		};
	}
	if (item.entityId && item.entityCustomerId) {
		return {
			path: `/customers/${item.entityCustomerId}`,
			queryParams: { entity_id: item.entityId },
		};
	}
	return undefined;
};
