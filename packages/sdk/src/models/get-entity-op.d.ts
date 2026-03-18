import * as z from "zod/v4-mini";
import { OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { Balance } from "./balance.js";
import { Plan } from "./plan.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type GetEntityGlobals = {
    xApiVersion?: string | undefined;
};
export type GetEntityParams = {
    /**
     * The ID of the customer to create the entity for.
     */
    customerId?: string | undefined;
    /**
     * The ID of the entity.
     */
    entityId: string;
};
/**
 * The environment (sandbox/live)
 */
export declare const GetEntityEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * The environment (sandbox/live)
 */
export type GetEntityEnv = OpenEnum<typeof GetEntityEnv>;
/**
 * Current status of the subscription.
 */
export declare const GetEntityStatus: {
    readonly Active: "active";
    readonly Scheduled: "scheduled";
};
/**
 * Current status of the subscription.
 */
export type GetEntityStatus = OpenEnum<typeof GetEntityStatus>;
export type GetEntitySubscription = {
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
    status: GetEntityStatus;
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
export type GetEntityPurchase = {
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
export declare const GetEntityType: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export type GetEntityType = OpenEnum<typeof GetEntityType>;
export type GetEntityCreditSchema = {
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
export type GetEntityDisplay = {
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
export type GetEntityFeature = {
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
    type: GetEntityType;
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
    creditSchema?: Array<GetEntityCreditSchema> | undefined;
    /**
     * Display names for the feature in billing UI and customer-facing components.
     */
    display?: GetEntityDisplay | undefined;
    /**
     * Whether the feature is archived and hidden from the dashboard.
     */
    archived: boolean;
};
export type GetEntityFlags = {
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
    feature?: GetEntityFeature | undefined;
};
export type GetEntitySpendLimit = {
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
export type GetEntityBillingControls = {
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<GetEntitySpendLimit> | undefined;
};
export type GetEntityInvoice = {
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
export type GetEntityResponse = {
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
    env: GetEntityEnv;
    subscriptions: Array<GetEntitySubscription>;
    purchases: Array<GetEntityPurchase>;
    balances: {
        [k: string]: Balance;
    };
    flags: {
        [k: string]: GetEntityFlags;
    };
    /**
     * Billing controls for the entity.
     */
    billingControls?: GetEntityBillingControls | undefined;
    /**
     * Invoices for this entity (only included when expand=invoices)
     */
    invoices?: Array<GetEntityInvoice> | undefined;
};
/** @internal */
export type GetEntityParams$Outbound = {
    customer_id?: string | undefined;
    entity_id: string;
};
/** @internal */
export declare const GetEntityParams$outboundSchema: z.ZodMiniType<GetEntityParams$Outbound, GetEntityParams>;
export declare function getEntityParamsToJSON(getEntityParams: GetEntityParams): string;
/** @internal */
export declare const GetEntityEnv$inboundSchema: z.ZodMiniType<GetEntityEnv, unknown>;
/** @internal */
export declare const GetEntityStatus$inboundSchema: z.ZodMiniType<GetEntityStatus, unknown>;
/** @internal */
export declare const GetEntitySubscription$inboundSchema: z.ZodMiniType<GetEntitySubscription, unknown>;
export declare function getEntitySubscriptionFromJSON(jsonString: string): SafeParseResult<GetEntitySubscription, SDKValidationError>;
/** @internal */
export declare const GetEntityPurchase$inboundSchema: z.ZodMiniType<GetEntityPurchase, unknown>;
export declare function getEntityPurchaseFromJSON(jsonString: string): SafeParseResult<GetEntityPurchase, SDKValidationError>;
/** @internal */
export declare const GetEntityType$inboundSchema: z.ZodMiniType<GetEntityType, unknown>;
/** @internal */
export declare const GetEntityCreditSchema$inboundSchema: z.ZodMiniType<GetEntityCreditSchema, unknown>;
export declare function getEntityCreditSchemaFromJSON(jsonString: string): SafeParseResult<GetEntityCreditSchema, SDKValidationError>;
/** @internal */
export declare const GetEntityDisplay$inboundSchema: z.ZodMiniType<GetEntityDisplay, unknown>;
export declare function getEntityDisplayFromJSON(jsonString: string): SafeParseResult<GetEntityDisplay, SDKValidationError>;
/** @internal */
export declare const GetEntityFeature$inboundSchema: z.ZodMiniType<GetEntityFeature, unknown>;
export declare function getEntityFeatureFromJSON(jsonString: string): SafeParseResult<GetEntityFeature, SDKValidationError>;
/** @internal */
export declare const GetEntityFlags$inboundSchema: z.ZodMiniType<GetEntityFlags, unknown>;
export declare function getEntityFlagsFromJSON(jsonString: string): SafeParseResult<GetEntityFlags, SDKValidationError>;
/** @internal */
export declare const GetEntitySpendLimit$inboundSchema: z.ZodMiniType<GetEntitySpendLimit, unknown>;
export declare function getEntitySpendLimitFromJSON(jsonString: string): SafeParseResult<GetEntitySpendLimit, SDKValidationError>;
/** @internal */
export declare const GetEntityBillingControls$inboundSchema: z.ZodMiniType<GetEntityBillingControls, unknown>;
export declare function getEntityBillingControlsFromJSON(jsonString: string): SafeParseResult<GetEntityBillingControls, SDKValidationError>;
/** @internal */
export declare const GetEntityInvoice$inboundSchema: z.ZodMiniType<GetEntityInvoice, unknown>;
export declare function getEntityInvoiceFromJSON(jsonString: string): SafeParseResult<GetEntityInvoice, SDKValidationError>;
/** @internal */
export declare const GetEntityResponse$inboundSchema: z.ZodMiniType<GetEntityResponse, unknown>;
export declare function getEntityResponseFromJSON(jsonString: string): SafeParseResult<GetEntityResponse, SDKValidationError>;
