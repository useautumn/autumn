import * as z from "zod/v4-mini";
import { ClosedEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type AggregateEventsGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Feature ID(s) to aggregate events for
 */
export type AggregateEventsFeatureId = string | Array<string>;
/**
 * Time range to aggregate events for. Either range or custom_range must be provided
 */
export declare const Range: {
    readonly TwentyFourh: "24h";
    readonly Sevend: "7d";
    readonly Thirtyd: "30d";
    readonly Ninetyd: "90d";
    readonly LastCycle: "last_cycle";
    readonly Onebc: "1bc";
    readonly Threebc: "3bc";
};
/**
 * Time range to aggregate events for. Either range or custom_range must be provided
 */
export type Range = ClosedEnum<typeof Range>;
/**
 * Size of the time bins to aggregate events for. Defaults to hour if range is 24h, otherwise day
 */
export declare const BinSize: {
    readonly Day: "day";
    readonly Hour: "hour";
    readonly Month: "month";
};
/**
 * Size of the time bins to aggregate events for. Defaults to hour if range is 24h, otherwise day
 */
export type BinSize = ClosedEnum<typeof BinSize>;
/**
 * Custom time range to aggregate events for. If provided, range must not be provided
 */
export type AggregateEventsCustomRange = {
    start: number;
    end: number;
};
export type EventsAggregateParams = {
    /**
     * Customer ID to aggregate events for
     */
    customerId?: string | undefined;
    /**
     * Entity ID to filter aggregated events for (e.g., per-seat or per-resource limits)
     */
    entityId?: string | undefined;
    /**
     * Feature ID(s) to aggregate events for
     */
    featureId: string | Array<string>;
    /**
     * Property to group events by (e.g. "properties.region"), or "$customer_id" / "$entity_id" to group by those columns
     */
    groupBy?: string | undefined;
    /**
     * Time range to aggregate events for. Either range or custom_range must be provided
     */
    range?: Range | undefined;
    /**
     * Size of the time bins to aggregate events for. Defaults to hour if range is 24h, otherwise day
     */
    binSize?: BinSize | undefined;
    /**
     * Custom time range to aggregate events for. If provided, range must not be provided
     */
    customRange?: AggregateEventsCustomRange | undefined;
};
export type AggregateEventsList = {
    /**
     * Unix timestamp (epoch ms) for this time period
     */
    period: number;
    /**
     * Aggregated values per feature: { [featureId]: number }
     */
    values: {
        [k: string]: number;
    };
    /**
     * Values broken down by group (only present when group_by is used): { [featureId]: { [groupValue]: number } }
     */
    groupedValues?: {
        [k: string]: {
            [k: string]: number;
        };
    } | undefined;
};
export type Total = {
    /**
     * Number of events for this feature
     */
    count: number;
    /**
     * Sum of event values for this feature
     */
    sum: number;
};
/**
 * OK
 */
export type AggregateEventsResponse = {
    /**
     * Array of time periods with aggregated values
     */
    list: Array<AggregateEventsList>;
    /**
     * Total aggregations per feature. Keys are feature IDs, values contain count and sum.
     */
    total: {
        [k: string]: Total;
    };
};
/** @internal */
export type AggregateEventsFeatureId$Outbound = string | Array<string>;
/** @internal */
export declare const AggregateEventsFeatureId$outboundSchema: z.ZodMiniType<AggregateEventsFeatureId$Outbound, AggregateEventsFeatureId>;
export declare function aggregateEventsFeatureIdToJSON(aggregateEventsFeatureId: AggregateEventsFeatureId): string;
/** @internal */
export declare const Range$outboundSchema: z.ZodMiniEnum<typeof Range>;
/** @internal */
export declare const BinSize$outboundSchema: z.ZodMiniEnum<typeof BinSize>;
/** @internal */
export type AggregateEventsCustomRange$Outbound = {
    start: number;
    end: number;
};
/** @internal */
export declare const AggregateEventsCustomRange$outboundSchema: z.ZodMiniType<AggregateEventsCustomRange$Outbound, AggregateEventsCustomRange>;
export declare function aggregateEventsCustomRangeToJSON(aggregateEventsCustomRange: AggregateEventsCustomRange): string;
/** @internal */
export type EventsAggregateParams$Outbound = {
    customer_id?: string | undefined;
    entity_id?: string | undefined;
    feature_id: string | Array<string>;
    group_by?: string | undefined;
    range?: string | undefined;
    bin_size: string;
    custom_range?: AggregateEventsCustomRange$Outbound | undefined;
};
/** @internal */
export declare const EventsAggregateParams$outboundSchema: z.ZodMiniType<EventsAggregateParams$Outbound, EventsAggregateParams>;
export declare function eventsAggregateParamsToJSON(eventsAggregateParams: EventsAggregateParams): string;
/** @internal */
export declare const AggregateEventsList$inboundSchema: z.ZodMiniType<AggregateEventsList, unknown>;
export declare function aggregateEventsListFromJSON(jsonString: string): SafeParseResult<AggregateEventsList, SDKValidationError>;
/** @internal */
export declare const Total$inboundSchema: z.ZodMiniType<Total, unknown>;
export declare function totalFromJSON(jsonString: string): SafeParseResult<Total, SDKValidationError>;
/** @internal */
export declare const AggregateEventsResponse$inboundSchema: z.ZodMiniType<AggregateEventsResponse, unknown>;
export declare function aggregateEventsResponseFromJSON(jsonString: string): SafeParseResult<AggregateEventsResponse, SDKValidationError>;
