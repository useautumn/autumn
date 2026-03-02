import type { BinSizeEnum, FullCustomer, RangeEnum } from "@autumn/shared";

export type ClickHouseResult<T = Record<string, string | number>> = {
	data: T[];
	meta: { name: string }[];
	rows: number;
};

export interface RawEventFromClickHouse {
	id: string;
	timestamp: Date | string | null;
	event_name: string;
	customer_id: string;
	value: number | null;
	properties: string | null;
	idempotency_key?: string | null;
	entity_id?: string | null;
}

export type TotalEventsParams = {
	event_names: string[];
	customer_id?: string;
	aggregateAll?: boolean;
	custom_range?: { start: number; end: number };
	interval?: RangeEnum;
	customer?: FullCustomer;
	bin_size: BinSizeEnum;
};

export type TimeseriesEventsParams = TotalEventsParams & {
	group_by?: string;
	no_count?: boolean;
	timezone?: string;
	enforceGroupLimit?: boolean;
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

export type CalculateCustomRangeParamsInput = {
	customRange: { start: number; end: number };
	binSize: BinSizeEnum;
};

export type CalculateCustomRangeParamsOutput = {
	binCount: number;
	binEndDate: string;
	filterStartDate: string;
	filterEndDate: string;
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

export type EventListParams = {
	customer_id: string;
	feature_id: string | string[];
	time_range: { start: number; end: number };
};
