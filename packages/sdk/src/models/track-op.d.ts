import * as z from "zod/v4-mini";
import { Result as SafeParseResult } from "../types/fp.js";
import { Balance } from "./balance.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type TrackGlobals = {
    xApiVersion?: string | undefined;
};
export type TrackLock = {
    /**
     * A unique identifier for this lock. Used to finalize the lock later via balances.finalize.
     */
    lockId: string;
    /**
     * Must be true to enable locking.
     */
    enabled: true;
    /**
     * Unix timestamp (ms) when the lock automatically expires and releases the held balance.
     */
    expiresAt?: number | undefined;
};
export type TrackParams = {
    /**
     * The ID of the customer.
     */
    customerId: string;
    /**
     * The ID of the feature to track usage for. Required if event_name is not provided.
     */
    featureId?: string | undefined;
    /**
     * The ID of the entity for entity-scoped balances (e.g., per-seat limits).
     */
    entityId?: string | undefined;
    /**
     * Event name to track usage for. Use instead of feature_id when multiple features should be tracked from a single event.
     */
    eventName?: string | undefined;
    /**
     * The amount of usage to record. Defaults to 1. Use negative values to credit balance (e.g., when removing a seat).
     */
    value?: number | undefined;
    /**
     * Additional properties to attach to this usage event.
     */
    properties?: {
        [k: string]: any;
    } | undefined;
    lock?: TrackLock | undefined;
};
/**
 * OK
 */
export type TrackResponse = {
    /**
     * The ID of the customer whose usage was tracked.
     */
    customerId: string;
    /**
     * The ID of the entity, if entity-scoped tracking was performed.
     */
    entityId?: string | undefined;
    /**
     * The event name that was tracked, if event_name was used instead of feature_id.
     */
    eventName?: string | undefined;
    /**
     * The amount of usage that was recorded.
     */
    value: number;
    /**
     * The updated balance for the tracked feature. Null if tracking by event_name that affects multiple features.
     */
    balance: Balance | null;
    /**
     * Map of feature_id to updated balance when tracking by event_name affects multiple features.
     */
    balances?: {
        [k: string]: Balance;
    } | undefined;
};
/** @internal */
export type TrackLock$Outbound = {
    lock_id: string;
    enabled: true;
    expires_at?: number | undefined;
};
/** @internal */
export declare const TrackLock$outboundSchema: z.ZodMiniType<TrackLock$Outbound, TrackLock>;
export declare function trackLockToJSON(trackLock: TrackLock): string;
/** @internal */
export type TrackParams$Outbound = {
    customer_id: string;
    feature_id?: string | undefined;
    entity_id?: string | undefined;
    event_name?: string | undefined;
    value?: number | undefined;
    properties?: {
        [k: string]: any;
    } | undefined;
    lock?: TrackLock$Outbound | undefined;
};
/** @internal */
export declare const TrackParams$outboundSchema: z.ZodMiniType<TrackParams$Outbound, TrackParams>;
export declare function trackParamsToJSON(trackParams: TrackParams): string;
/** @internal */
export declare const TrackResponse$inboundSchema: z.ZodMiniType<TrackResponse, unknown>;
export declare function trackResponseFromJSON(jsonString: string): SafeParseResult<TrackResponse, SDKValidationError>;
