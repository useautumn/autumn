import * as z from "zod/v4-mini";
import { ClosedEnum, OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type CreateFeatureGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system.
 */
export declare const CreateFeatureTypeRequest: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system.
 */
export type CreateFeatureTypeRequest = ClosedEnum<typeof CreateFeatureTypeRequest>;
/**
 * Singular and plural display names for the feature in your user interface.
 */
export type CreateFeatureDisplayRequest = {
    singular: string;
    plural: string;
};
export type CreateFeatureCreditSchemaRequest = {
    meteredFeatureId: string;
    creditCost: number;
};
export type CreateFeatureParams = {
    /**
     * The name of the feature.
     */
    name: string;
    /**
     * The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system.
     */
    type: CreateFeatureTypeRequest;
    /**
     * Whether this feature is consumable. A consumable feature is one that periodically resets and is consumed rather than allocated (like credits, API requests, etc.). Applicable only for 'metered' features.
     */
    consumable?: boolean | undefined;
    /**
     * Singular and plural display names for the feature in your user interface.
     */
    display?: CreateFeatureDisplayRequest | undefined;
    /**
     * A schema that maps 'single_use' feature IDs to credit costs. Applicable only for 'credit_system' features.
     */
    creditSchema?: Array<CreateFeatureCreditSchemaRequest> | undefined;
    eventNames?: Array<string> | undefined;
    /**
     * The ID of the feature to create.
     */
    featureId: string;
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export declare const CreateFeatureTypeResponse: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export type CreateFeatureTypeResponse = OpenEnum<typeof CreateFeatureTypeResponse>;
export type CreateFeatureCreditSchemaResponse = {
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
export type CreateFeatureDisplayResponse = {
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
export type CreateFeatureResponse = {
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
    type: CreateFeatureTypeResponse;
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
    creditSchema?: Array<CreateFeatureCreditSchemaResponse> | undefined;
    /**
     * Display names for the feature in billing UI and customer-facing components.
     */
    display?: CreateFeatureDisplayResponse | undefined;
    /**
     * Whether the feature is archived and hidden from the dashboard.
     */
    archived: boolean;
};
/** @internal */
export declare const CreateFeatureTypeRequest$outboundSchema: z.ZodMiniEnum<typeof CreateFeatureTypeRequest>;
/** @internal */
export type CreateFeatureDisplayRequest$Outbound = {
    singular: string;
    plural: string;
};
/** @internal */
export declare const CreateFeatureDisplayRequest$outboundSchema: z.ZodMiniType<CreateFeatureDisplayRequest$Outbound, CreateFeatureDisplayRequest>;
export declare function createFeatureDisplayRequestToJSON(createFeatureDisplayRequest: CreateFeatureDisplayRequest): string;
/** @internal */
export type CreateFeatureCreditSchemaRequest$Outbound = {
    metered_feature_id: string;
    credit_cost: number;
};
/** @internal */
export declare const CreateFeatureCreditSchemaRequest$outboundSchema: z.ZodMiniType<CreateFeatureCreditSchemaRequest$Outbound, CreateFeatureCreditSchemaRequest>;
export declare function createFeatureCreditSchemaRequestToJSON(createFeatureCreditSchemaRequest: CreateFeatureCreditSchemaRequest): string;
/** @internal */
export type CreateFeatureParams$Outbound = {
    name: string;
    type: string;
    consumable?: boolean | undefined;
    display?: CreateFeatureDisplayRequest$Outbound | undefined;
    credit_schema?: Array<CreateFeatureCreditSchemaRequest$Outbound> | undefined;
    event_names?: Array<string> | undefined;
    feature_id: string;
};
/** @internal */
export declare const CreateFeatureParams$outboundSchema: z.ZodMiniType<CreateFeatureParams$Outbound, CreateFeatureParams>;
export declare function createFeatureParamsToJSON(createFeatureParams: CreateFeatureParams): string;
/** @internal */
export declare const CreateFeatureTypeResponse$inboundSchema: z.ZodMiniType<CreateFeatureTypeResponse, unknown>;
/** @internal */
export declare const CreateFeatureCreditSchemaResponse$inboundSchema: z.ZodMiniType<CreateFeatureCreditSchemaResponse, unknown>;
export declare function createFeatureCreditSchemaResponseFromJSON(jsonString: string): SafeParseResult<CreateFeatureCreditSchemaResponse, SDKValidationError>;
/** @internal */
export declare const CreateFeatureDisplayResponse$inboundSchema: z.ZodMiniType<CreateFeatureDisplayResponse, unknown>;
export declare function createFeatureDisplayResponseFromJSON(jsonString: string): SafeParseResult<CreateFeatureDisplayResponse, SDKValidationError>;
/** @internal */
export declare const CreateFeatureResponse$inboundSchema: z.ZodMiniType<CreateFeatureResponse, unknown>;
export declare function createFeatureResponseFromJSON(jsonString: string): SafeParseResult<CreateFeatureResponse, SDKValidationError>;
