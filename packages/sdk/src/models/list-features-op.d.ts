import * as z from "zod/v4-mini";
import { OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type ListFeaturesGlobals = {
    xApiVersion?: string | undefined;
};
export type ListFeaturesRequest = {};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export declare const ListFeaturesType: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export type ListFeaturesType = OpenEnum<typeof ListFeaturesType>;
export type ListFeaturesCreditSchema = {
    /**
     * ID of the metered feature that draws from this credit system.
     */
    meteredFeatureId: string;
    /**
     * Credits consumed per unit of the metered feature.
     */
    creditCost: number;
};
/**
 * Display names for the feature in billing UI and customer-facing components.
 */
export type ListFeaturesDisplay = {
    /**
     * Singular form for UI display (e.g., 'API call', 'seat').
     */
    singular?: string | null | undefined;
    /**
     * Plural form for UI display (e.g., 'API calls', 'seats').
     */
    plural?: string | null | undefined;
};
export type ListFeaturesList = {
    /**
     * The unique identifier for this feature, used in /check and /track calls.
     */
    id: string;
    /**
     * Human-readable name displayed in the dashboard and billing UI.
     */
    name: string;
    /**
     * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
     */
    type: ListFeaturesType;
    /**
     * For metered features: true if usage resets periodically (API calls, credits), false if allocated persistently (seats, storage).
     */
    consumable: boolean;
    /**
     * Event names that trigger this feature's balance. Allows multiple features to respond to a single event.
     */
    eventNames?: Array<string> | undefined;
    /**
     * For credit_system features: maps metered features to their credit costs.
     */
    creditSchema?: Array<ListFeaturesCreditSchema> | undefined;
    /**
     * Display names for the feature in billing UI and customer-facing components.
     */
    display?: ListFeaturesDisplay | undefined;
    /**
     * Whether the feature is archived and hidden from the dashboard.
     */
    archived: boolean;
};
/**
 * OK
 */
export type ListFeaturesResponse = {
    list: Array<ListFeaturesList>;
};
/** @internal */
export type ListFeaturesRequest$Outbound = {};
/** @internal */
export declare const ListFeaturesRequest$outboundSchema: z.ZodMiniType<ListFeaturesRequest$Outbound, ListFeaturesRequest>;
export declare function listFeaturesRequestToJSON(listFeaturesRequest: ListFeaturesRequest): string;
/** @internal */
export declare const ListFeaturesType$inboundSchema: z.ZodMiniType<ListFeaturesType, unknown>;
/** @internal */
export declare const ListFeaturesCreditSchema$inboundSchema: z.ZodMiniType<ListFeaturesCreditSchema, unknown>;
export declare function listFeaturesCreditSchemaFromJSON(jsonString: string): SafeParseResult<ListFeaturesCreditSchema, SDKValidationError>;
/** @internal */
export declare const ListFeaturesDisplay$inboundSchema: z.ZodMiniType<ListFeaturesDisplay, unknown>;
export declare function listFeaturesDisplayFromJSON(jsonString: string): SafeParseResult<ListFeaturesDisplay, SDKValidationError>;
/** @internal */
export declare const ListFeaturesList$inboundSchema: z.ZodMiniType<ListFeaturesList, unknown>;
export declare function listFeaturesListFromJSON(jsonString: string): SafeParseResult<ListFeaturesList, SDKValidationError>;
/** @internal */
export declare const ListFeaturesResponse$inboundSchema: z.ZodMiniType<ListFeaturesResponse, unknown>;
export declare function listFeaturesResponseFromJSON(jsonString: string): SafeParseResult<ListFeaturesResponse, SDKValidationError>;
