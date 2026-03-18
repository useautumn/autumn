import * as z from "zod/v4-mini";
import { OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { Balance } from "./balance.js";
import { Plan } from "./plan.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type UpdateEntityGlobals = {
    xApiVersion?: string | undefined;
};
export type UpdateEntitySpendLimitRequest = {
    /**
     * Optional feature ID this spend limit applies to.
     */
    featureId?: string | undefined;
    /**
     * Whether this spend limit is enabled.
     */
    enabled?: boolean | undefined;
    /**
     * Maximum allowed overage spend for the target feature.
     */
    overageLimit?: number | undefined;
};
/**
 * Billing controls to replace on the entity.
 */
export type UpdateEntityBillingControlsRequest = {
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<UpdateEntitySpendLimitRequest> | undefined;
};
export type UpdateEntityParams = {
    /**
     * The ID of the customer that owns the entity.
     */
    customerId?: string | undefined;
    /**
     * The ID of the entity.
     */
    entityId: string;
    /**
     * Billing controls to replace on the entity.
     */
    billingControls?: UpdateEntityBillingControlsRequest | undefined;
};
/**
 * The environment (sandbox/live)
 */
export declare const UpdateEntityEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * The environment (sandbox/live)
 */
export type UpdateEntityEnv = OpenEnum<typeof UpdateEntityEnv>;
/**
 * Current status of the subscription.
 */
export declare const UpdateEntityStatus: {
    readonly Active: "active";
    readonly Scheduled: "scheduled";
};
/**
 * Current status of the subscription.
 */
export type UpdateEntityStatus = OpenEnum<typeof UpdateEntityStatus>;
export type UpdateEntitySubscription = {
    /**
     * The unique identifier of this subscription. If a subscription_id was provided at attach time, it is used; otherwise, falls back to the internal ID.
     */
    id: string;
    plan?: Plan | undefined;
    /**
     * The unique identifier of the subscribed plan.
     */
    planId: string;
    /**
     * Whether the plan was automatically enabled for the customer.
     */
    autoEnable: boolean;
    /**
     * Whether this is an add-on plan rather than a base subscription.
     */
    addOn: boolean;
    /**
     * Current status of the subscription.
     */
    status: UpdateEntityStatus;
    /**
     * Whether the subscription has overdue payments.
     */
    pastDue: boolean;
    /**
     * Timestamp when the subscription was canceled, or null if not canceled.
     */
    canceledAt: number | null;
    /**
     * Timestamp when the subscription will expire, or null if no expiry set.
     */
    expiresAt: number | null;
    /**
     * Timestamp when the trial period ends, or null if not on trial.
     */
    trialEndsAt: number | null;
    /**
     * Timestamp when the subscription started.
     */
    startedAt: number;
    /**
     * Start timestamp of the current billing period.
     */
    currentPeriodStart: number | null;
    /**
     * End timestamp of the current billing period.
     */
    currentPeriodEnd: number | null;
    /**
     * Number of units of this subscription (for per-seat plans).
     */
    quantity: number;
};
export type UpdateEntityPurchase = {
    plan?: Plan | undefined;
    /**
     * The unique identifier of the purchased plan.
     */
    planId: string;
    /**
     * Timestamp when the purchase expires, or null for lifetime access.
     */
    expiresAt: number | null;
    /**
     * Timestamp when the purchase was made.
     */
    startedAt: number;
    /**
     * Number of units purchased.
     */
    quantity: number;
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export declare const UpdateEntityType: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export type UpdateEntityType = OpenEnum<typeof UpdateEntityType>;
export type UpdateEntityCreditSchema = {
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
export type UpdateEntityDisplay = {
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
 * The full feature object if expanded.
 */
export type UpdateEntityFeature = {
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
    type: UpdateEntityType;
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
    creditSchema?: Array<UpdateEntityCreditSchema> | undefined;
    /**
     * Display names for the feature in billing UI and customer-facing components.
     */
    display?: UpdateEntityDisplay | undefined;
    /**
     * Whether the feature is archived and hidden from the dashboard.
     */
    archived: boolean;
};
export type UpdateEntityFlags = {
    /**
     * The unique identifier for this flag.
     */
    id: string;
    /**
     * The plan ID this flag originates from, or null for standalone flags.
     */
    planId: string | null;
    /**
     * Timestamp when this flag expires, or null for no expiration.
     */
    expiresAt: number | null;
    /**
     * The feature ID this flag is for.
     */
    featureId: string;
    /**
     * The full feature object if expanded.
     */
    feature?: UpdateEntityFeature | undefined;
};
export type UpdateEntitySpendLimitResponse = {
    /**
     * Optional feature ID this spend limit applies to.
     */
    featureId?: string | undefined;
    /**
     * Whether this spend limit is enabled.
     */
    enabled: boolean;
    /**
     * Maximum allowed overage spend for the target feature.
     */
    overageLimit?: number | undefined;
};
/**
 * Billing controls for the entity.
 */
export type UpdateEntityBillingControlsResponse = {
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<UpdateEntitySpendLimitResponse> | undefined;
};
export type UpdateEntityInvoice = {
    /**
     * Array of plan IDs included in this invoice
     */
    planIds: Array<string>;
    /**
     * The Stripe invoice ID
     */
    stripeId: string;
    /**
     * The status of the invoice
     */
    status: string;
    /**
     * The total amount of the invoice
     */
    total: number;
    /**
     * The currency code for the invoice
     */
    currency: string;
    /**
     * Timestamp when the invoice was created
     */
    createdAt: number;
    /**
     * URL to the Stripe-hosted invoice page
     */
    hostedInvoiceUrl?: string | null | undefined;
};
/**
 * OK
 */
export type UpdateEntityResponse = {
    /**
     * The unique identifier of the entity
     */
    id: string | null;
    /**
     * The name of the entity
     */
    name: string | null;
    /**
     * The customer ID this entity belongs to
     */
    customerId?: string | null | undefined;
    /**
     * The feature ID this entity belongs to
     */
    featureId?: string | null | undefined;
    /**
     * Unix timestamp when the entity was created
     */
    createdAt: number;
    /**
     * The environment (sandbox/live)
     */
    env: UpdateEntityEnv;
    subscriptions: Array<UpdateEntitySubscription>;
    purchases: Array<UpdateEntityPurchase>;
    balances: {
        [k: string]: Balance;
    };
    flags: {
        [k: string]: UpdateEntityFlags;
    };
    /**
     * Billing controls for the entity.
     */
    billingControls?: UpdateEntityBillingControlsResponse | undefined;
    /**
     * Invoices for this entity (only included when expand=invoices)
     */
    invoices?: Array<UpdateEntityInvoice> | undefined;
};
/** @internal */
export type UpdateEntitySpendLimitRequest$Outbound = {
    feature_id?: string | undefined;
    enabled: boolean;
    overage_limit?: number | undefined;
};
/** @internal */
export declare const UpdateEntitySpendLimitRequest$outboundSchema: z.ZodMiniType<UpdateEntitySpendLimitRequest$Outbound, UpdateEntitySpendLimitRequest>;
export declare function updateEntitySpendLimitRequestToJSON(updateEntitySpendLimitRequest: UpdateEntitySpendLimitRequest): string;
/** @internal */
export type UpdateEntityBillingControlsRequest$Outbound = {
    spend_limits?: Array<UpdateEntitySpendLimitRequest$Outbound> | undefined;
};
/** @internal */
export declare const UpdateEntityBillingControlsRequest$outboundSchema: z.ZodMiniType<UpdateEntityBillingControlsRequest$Outbound, UpdateEntityBillingControlsRequest>;
export declare function updateEntityBillingControlsRequestToJSON(updateEntityBillingControlsRequest: UpdateEntityBillingControlsRequest): string;
/** @internal */
export type UpdateEntityParams$Outbound = {
    customer_id?: string | undefined;
    entity_id: string;
    billing_controls?: UpdateEntityBillingControlsRequest$Outbound | undefined;
};
/** @internal */
export declare const UpdateEntityParams$outboundSchema: z.ZodMiniType<UpdateEntityParams$Outbound, UpdateEntityParams>;
export declare function updateEntityParamsToJSON(updateEntityParams: UpdateEntityParams): string;
/** @internal */
export declare const UpdateEntityEnv$inboundSchema: z.ZodMiniType<UpdateEntityEnv, unknown>;
/** @internal */
export declare const UpdateEntityStatus$inboundSchema: z.ZodMiniType<UpdateEntityStatus, unknown>;
/** @internal */
export declare const UpdateEntitySubscription$inboundSchema: z.ZodMiniType<UpdateEntitySubscription, unknown>;
export declare function updateEntitySubscriptionFromJSON(jsonString: string): SafeParseResult<UpdateEntitySubscription, SDKValidationError>;
/** @internal */
export declare const UpdateEntityPurchase$inboundSchema: z.ZodMiniType<UpdateEntityPurchase, unknown>;
export declare function updateEntityPurchaseFromJSON(jsonString: string): SafeParseResult<UpdateEntityPurchase, SDKValidationError>;
/** @internal */
export declare const UpdateEntityType$inboundSchema: z.ZodMiniType<UpdateEntityType, unknown>;
/** @internal */
export declare const UpdateEntityCreditSchema$inboundSchema: z.ZodMiniType<UpdateEntityCreditSchema, unknown>;
export declare function updateEntityCreditSchemaFromJSON(jsonString: string): SafeParseResult<UpdateEntityCreditSchema, SDKValidationError>;
/** @internal */
export declare const UpdateEntityDisplay$inboundSchema: z.ZodMiniType<UpdateEntityDisplay, unknown>;
export declare function updateEntityDisplayFromJSON(jsonString: string): SafeParseResult<UpdateEntityDisplay, SDKValidationError>;
/** @internal */
export declare const UpdateEntityFeature$inboundSchema: z.ZodMiniType<UpdateEntityFeature, unknown>;
export declare function updateEntityFeatureFromJSON(jsonString: string): SafeParseResult<UpdateEntityFeature, SDKValidationError>;
/** @internal */
export declare const UpdateEntityFlags$inboundSchema: z.ZodMiniType<UpdateEntityFlags, unknown>;
export declare function updateEntityFlagsFromJSON(jsonString: string): SafeParseResult<UpdateEntityFlags, SDKValidationError>;
/** @internal */
export declare const UpdateEntitySpendLimitResponse$inboundSchema: z.ZodMiniType<UpdateEntitySpendLimitResponse, unknown>;
export declare function updateEntitySpendLimitResponseFromJSON(jsonString: string): SafeParseResult<UpdateEntitySpendLimitResponse, SDKValidationError>;
/** @internal */
export declare const UpdateEntityBillingControlsResponse$inboundSchema: z.ZodMiniType<UpdateEntityBillingControlsResponse, unknown>;
export declare function updateEntityBillingControlsResponseFromJSON(jsonString: string): SafeParseResult<UpdateEntityBillingControlsResponse, SDKValidationError>;
/** @internal */
export declare const UpdateEntityInvoice$inboundSchema: z.ZodMiniType<UpdateEntityInvoice, unknown>;
export declare function updateEntityInvoiceFromJSON(jsonString: string): SafeParseResult<UpdateEntityInvoice, SDKValidationError>;
/** @internal */
export declare const UpdateEntityResponse$inboundSchema: z.ZodMiniType<UpdateEntityResponse, unknown>;
export declare function updateEntityResponseFromJSON(jsonString: string): SafeParseResult<UpdateEntityResponse, SDKValidationError>;
