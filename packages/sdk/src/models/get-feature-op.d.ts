import * as z from "zod/v4-mini";
import { OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type GetFeatureGlobals = {
    xApiVersion?: string | undefined;
};
export type GetFeatureParams = {
    /**
     * The ID of the feature.
     */
    featureId: string;
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export declare const GetFeatureType: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export type GetFeatureType = OpenEnum<typeof GetFeatureType>;
export type GetFeatureCreditSchema = {
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
export type GetFeatureDisplay = {
    /**
     * Singular form for UI display (e.g., 'API call', 'seat').
     */
    singular?: string | null | undefined;
    /**
     * Plural form for UI display (e.g., 'API calls', 'seats').
     */
    plural?: string | null | undefined;
};
/**
 * OK
 */
export type GetFeatureResponse = {
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
    type: GetFeatureType;
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
    creditSchema?: Array<GetFeatureCreditSchema> | undefined;
    /**
     * Display names for the feature in billing UI and customer-facing components.
     */
    display?: GetFeatureDisplay | undefined;
    /**
     * Whether the feature is archived and hidden from the dashboard.
     */
    archived: boolean;
};
/** @internal */
export type GetFeatureParams$Outbound = {
    feature_id: string;
};
/** @internal */
export declare const GetFeatureParams$outboundSchema: z.ZodMiniType<GetFeatureParams$Outbound, GetFeatureParams>;
export declare function getFeatureParamsToJSON(getFeatureParams: GetFeatureParams): string;
/** @internal */
export declare const GetFeatureType$inboundSchema: z.ZodMiniType<GetFeatureType, unknown>;
/** @internal */
export declare const GetFeatureCreditSchema$inboundSchema: z.ZodMiniType<GetFeatureCreditSchema, unknown>;
export declare function getFeatureCreditSchemaFromJSON(jsonString: string): SafeParseResult<GetFeatureCreditSchema, SDKValidationError>;
/** @internal */
export declare const GetFeatureDisplay$inboundSchema: z.ZodMiniType<GetFeatureDisplay, unknown>;
export declare function getFeatureDisplayFromJSON(jsonString: string): SafeParseResult<GetFeatureDisplay, SDKValidationError>;
/** @internal */
export declare const GetFeatureResponse$inboundSchema: z.ZodMiniType<GetFeatureResponse, unknown>;
export declare function getFeatureResponseFromJSON(jsonString: string): SafeParseResult<GetFeatureResponse, SDKValidationError>;
