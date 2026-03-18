import * as z from "zod/v4-mini";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type ListEventsGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * Filter by specific feature ID(s)
 */
export type ListEventsFeatureId = string | Array<string>;
/**
 * Filter events by time range
 */
export type ListEventsCustomRange = {
    /**
     * Filter events after this timestamp (epoch milliseconds)
     */
    start?: number | undefined;
    /**
     * Filter events before this timestamp (epoch milliseconds)
     */
    end?: number | undefined;
};
export type EventsListParams = {
    /**
     * Number of items to skip
     */
    offset?: number | undefined;
    /**
     * Number of items to return. Default 100, max 1000.
     */
    limit?: number | undefined;
    /**
     * Filter events by customer ID
     */
    customerId?: string | undefined;
    /**
     * Filter events by entity ID (e.g., per-seat or per-resource)
     */
    entityId?: string | undefined;
    /**
     * Filter by specific feature ID(s)
     */
    featureId?: string | Array<string> | undefined;
    /**
     * Filter events by time range
     */
    customRange?: ListEventsCustomRange | undefined;
};
/**
 * Event properties (JSONB)
 */
export type ListEventsProperties = {};
export type ListEventsList = {
    /**
     * Event ID (KSUID)
     */
    id: string;
    /**
     * Event timestamp (epoch milliseconds)
     */
    timestamp: number;
    /**
     * ID of the feature that the event belongs to
     */
    featureId: string;
    /**
     * Customer identifier
     */
    customerId: string;
    /**
     * Event value/count
     */
    value: number;
    /**
     * Event properties (JSONB)
     */
    properties: ListEventsProperties;
};
/**
 * OK
 */
export type ListEventsResponse = {
    /**
     * Array of items for current page
     */
    list: Array<ListEventsList>;
    /**
     * Whether more results exist after this page
     */
    hasMore: boolean;
    /**
     * Current offset position
     */
    offset: number;
    /**
     * Limit passed in the request
     */
    limit: number;
    /**
     * Total number of items returned in the current page
     */
    total: number;
};
/** @internal */
export type ListEventsFeatureId$Outbound = string | Array<string>;
/** @internal */
export declare const ListEventsFeatureId$outboundSchema: z.ZodMiniType<ListEventsFeatureId$Outbound, ListEventsFeatureId>;
export declare function listEventsFeatureIdToJSON(listEventsFeatureId: ListEventsFeatureId): string;
/** @internal */
export type ListEventsCustomRange$Outbound = {
    start?: number | undefined;
    end?: number | undefined;
};
/** @internal */
export declare const ListEventsCustomRange$outboundSchema: z.ZodMiniType<ListEventsCustomRange$Outbound, ListEventsCustomRange>;
export declare function listEventsCustomRangeToJSON(listEventsCustomRange: ListEventsCustomRange): string;
/** @internal */
export type EventsListParams$Outbound = {
    offset: number;
    limit: number;
    customer_id?: string | undefined;
    entity_id?: string | undefined;
    feature_id?: string | Array<string> | undefined;
    custom_range?: ListEventsCustomRange$Outbound | undefined;
};
/** @internal */
export declare const EventsListParams$outboundSchema: z.ZodMiniType<EventsListParams$Outbound, EventsListParams>;
export declare function eventsListParamsToJSON(eventsListParams: EventsListParams): string;
/** @internal */
export declare const ListEventsProperties$inboundSchema: z.ZodMiniType<ListEventsProperties, unknown>;
export declare function listEventsPropertiesFromJSON(jsonString: string): SafeParseResult<ListEventsProperties, SDKValidationError>;
/** @internal */
export declare const ListEventsList$inboundSchema: z.ZodMiniType<ListEventsList, unknown>;
export declare function listEventsListFromJSON(jsonString: string): SafeParseResult<ListEventsList, SDKValidationError>;
/** @internal */
export declare const ListEventsResponse$inboundSchema: z.ZodMiniType<ListEventsResponse, unknown>;
export declare function listEventsResponseFromJSON(jsonString: string): SafeParseResult<ListEventsResponse, SDKValidationError>;
