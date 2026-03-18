import * as z from "zod/v4-mini";
import { ClosedEnum, OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type UpdateFeatureGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system.
 */
export declare const UpdateFeatureTypeRequest: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system.
 */
export type UpdateFeatureTypeRequest = ClosedEnum<typeof UpdateFeatureTypeRequest>;
/**
 * Singular and plural display names for the feature in your user interface.
 */
export type UpdateFeatureDisplayRequest = {
    singular: string;
    plural: string;
};
export type UpdateFeatureCreditSchemaRequest = {
    meteredFeatureId: string;
    creditCost: number;
};
export type UpdateFeatureParams = {
    /**
     * The name of the feature.
     */
    name?: string | undefined;
    /**
     * The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system.
     */
    type?: UpdateFeatureTypeRequest | undefined;
    /**
     * Whether this feature is consumable. A consumable feature is one that periodically resets and is consumed rather than allocated (like credits, API requests, etc.). Applicable only for 'metered' features.
     */
    consumable?: boolean | undefined;
    /**
     * Singular and plural display names for the feature in your user interface.
     */
    display?: UpdateFeatureDisplayRequest | undefined;
    /**
     * A schema that maps 'single_use' feature IDs to credit costs. Applicable only for 'credit_system' features.
     */
    creditSchema?: Array<UpdateFeatureCreditSchemaRequest> | undefined;
    eventNames?: Array<string> | undefined;
    /**
     * Whether the feature is archived. Archived features are hidden from the dashboard.
     */
    archived?: boolean | undefined;
    /**
     * The ID of the feature to update.
     */
    featureId: string;
    /**
     * The new ID of the feature. Feature ID can only be updated if it's not being used by any customers.
     */
    newFeatureId?: string | undefined;
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export declare const UpdateFeatureTypeResponse: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export type UpdateFeatureTypeResponse = OpenEnum<typeof UpdateFeatureTypeResponse>;
export type UpdateFeatureCreditSchemaResponse = {
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
export type UpdateFeatureDisplayResponse = {
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
export type UpdateFeatureResponse = {
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
    type: UpdateFeatureTypeResponse;
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
    creditSchema?: Array<UpdateFeatureCreditSchemaResponse> | undefined;
    /**
     * Display names for the feature in billing UI and customer-facing components.
     */
    display?: UpdateFeatureDisplayResponse | undefined;
    /**
     * Whether the feature is archived and hidden from the dashboard.
     */
    archived: boolean;
};
/** @internal */
export declare const UpdateFeatureTypeRequest$outboundSchema: z.ZodMiniEnum<typeof UpdateFeatureTypeRequest>;
/** @internal */
export type UpdateFeatureDisplayRequest$Outbound = {
    singular: string;
    plural: string;
};
/** @internal */
export declare const UpdateFeatureDisplayRequest$outboundSchema: z.ZodMiniType<UpdateFeatureDisplayRequest$Outbound, UpdateFeatureDisplayRequest>;
export declare function updateFeatureDisplayRequestToJSON(updateFeatureDisplayRequest: UpdateFeatureDisplayRequest): string;
/** @internal */
export type UpdateFeatureCreditSchemaRequest$Outbound = {
    metered_feature_id: string;
    credit_cost: number;
};
/** @internal */
export declare const UpdateFeatureCreditSchemaRequest$outboundSchema: z.ZodMiniType<UpdateFeatureCreditSchemaRequest$Outbound, UpdateFeatureCreditSchemaRequest>;
export declare function updateFeatureCreditSchemaRequestToJSON(updateFeatureCreditSchemaRequest: UpdateFeatureCreditSchemaRequest): string;
/** @internal */
export type UpdateFeatureParams$Outbound = {
    name?: string | undefined;
    type?: string | undefined;
    consumable?: boolean | undefined;
    display?: UpdateFeatureDisplayRequest$Outbound | undefined;
    credit_schema?: Array<UpdateFeatureCreditSchemaRequest$Outbound> | undefined;
    event_names?: Array<string> | undefined;
    archived?: boolean | undefined;
    feature_id: string;
    new_feature_id?: string | undefined;
};
/** @internal */
export declare const UpdateFeatureParams$outboundSchema: z.ZodMiniType<UpdateFeatureParams$Outbound, UpdateFeatureParams>;
export declare function updateFeatureParamsToJSON(updateFeatureParams: UpdateFeatureParams): string;
/** @internal */
export declare const UpdateFeatureTypeResponse$inboundSchema: z.ZodMiniType<UpdateFeatureTypeResponse, unknown>;
/** @internal */
export declare const UpdateFeatureCreditSchemaResponse$inboundSchema: z.ZodMiniType<UpdateFeatureCreditSchemaResponse, unknown>;
export declare function updateFeatureCreditSchemaResponseFromJSON(jsonString: string): SafeParseResult<UpdateFeatureCreditSchemaResponse, SDKValidationError>;
/** @internal */
export declare const UpdateFeatureDisplayResponse$inboundSchema: z.ZodMiniType<UpdateFeatureDisplayResponse, unknown>;
export declare function updateFeatureDisplayResponseFromJSON(jsonString: string): SafeParseResult<UpdateFeatureDisplayResponse, SDKValidationError>;
/** @internal */
export declare const UpdateFeatureResponse$inboundSchema: z.ZodMiniType<UpdateFeatureResponse, unknown>;
export declare function updateFeatureResponseFromJSON(jsonString: string): SafeParseResult<UpdateFeatureResponse, SDKValidationError>;
