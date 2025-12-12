import type { BinSizeEnum, FullCustomer, RangeEnum } from "@autumn/shared";

export type ClickHouseResult = {
	data: Array<Record<string, string | number>>;
};

export type TotalEventsParams = {
	event_names: string[];
	customer_id?: string;
	aggregateAll?: boolean;
	custom_range?: { start: number; end: number };
	interval: RangeEnum;
	customer?: FullCustomer;
	bin_size?: BinSizeEnum;
};

export type TimeseriesEventsParams = TotalEventsParams & {
	group_by?: string;
	no_count?: boolean;
};

export type CalculateDateRangeParams = Omit<
	TotalEventsParams,
	"event_names" | "customer_id"
>;

export type DateRangeResult = {
	startDate: string;
	endDate: string;
};

export type BillingCycleResult = {
	startDate: string;
	endDate: string;
	gap: number;
};

export type TimeseriesEventRow = Record<string, string | number>;

export type ProcessedEventRow = Record<string, string | number> & {
	period: number;
};

export type FlatAggregatedRow = {
	period: number;
	[featureName: string]: number;
};

export type GroupedAggregatedRow = {
	period: number;
} & {
	[featureName: string]: Record<string, number>;
};

export type AggregatedEventRow = FlatAggregatedRow | GroupedAggregatedRow;
