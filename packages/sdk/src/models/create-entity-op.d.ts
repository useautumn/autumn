import * as z from "zod/v4-mini";
import { OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { Balance } from "./balance.js";
import { CustomerData, CustomerData$Outbound } from "./customer-data.js";
import { Plan } from "./plan.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type CreateEntityGlobals = {
    xApiVersion?: string | undefined;
};
export type CreateEntitySpendLimitRequest = {
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
 * Billing controls for the entity.
 */
export type CreateEntityBillingControlsRequest = {
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<CreateEntitySpendLimitRequest> | undefined;
};
export type CreateEntityParams = {
    /**
     * The name of the entity
     */
    name?: string | null | undefined;
    /**
     * The ID of the feature this entity is associated with
     */
    featureId: string;
    /**
     * Billing controls for the entity.
     */
    billingControls?: CreateEntityBillingControlsRequest | undefined;
    /**
     * Customer details to set when creating a customer
     */
    customerData?: CustomerData | undefined;
    /**
     * The ID of the customer to create the entity for.
     */
    customerId: string;
    /**
     * The ID of the entity.
     */
    entityId: string;
};
/**
 * The environment (sandbox/live)
 */
export declare const CreateEntityEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * The environment (sandbox/live)
 */
export type CreateEntityEnv = OpenEnum<typeof CreateEntityEnv>;
/**
 * Current status of the subscription.
 */
export declare const CreateEntityStatus: {
    readonly Active: "active";
    readonly Scheduled: "scheduled";
};
/**
 * Current status of the subscription.
 */
export type CreateEntityStatus = OpenEnum<typeof CreateEntityStatus>;
export type CreateEntitySubscription = {
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
    status: CreateEntityStatus;
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
export type CreateEntityPurchase = {
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
export declare const CreateEntityType: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export type CreateEntityType = OpenEnum<typeof CreateEntityType>;
export type CreateEntityCreditSchema = {
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
export type CreateEntityDisplay = {
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
export type CreateEntityFeature = {
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
    type: CreateEntityType;
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
    creditSchema?: Array<CreateEntityCreditSchema> | undefined;
    /**
     * Display names for the feature in billing UI and customer-facing components.
     */
    display?: CreateEntityDisplay | undefined;
    /**
     * Whether the feature is archived and hidden from the dashboard.
     */
    archived: boolean;
};
export type CreateEntityFlags = {
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
    feature?: CreateEntityFeature | undefined;
};
export type CreateEntitySpendLimitResponse = {
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
export type CreateEntityBillingControlsResponse = {
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<CreateEntitySpendLimitResponse> | undefined;
};
export type CreateEntityInvoice = {
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
export type CreateEntityResponse = {
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
    env: CreateEntityEnv;
    subscriptions: Array<CreateEntitySubscription>;
    purchases: Array<CreateEntityPurchase>;
    balances: {
        [k: string]: Balance;
    };
    flags: {
        [k: string]: CreateEntityFlags;
    };
    /**
     * Billing controls for the entity.
     */
    billingControls?: CreateEntityBillingControlsResponse | undefined;
    /**
     * Invoices for this entity (only included when expand=invoices)
     */
    invoices?: Array<CreateEntityInvoice> | undefined;
};
/** @internal */
export type CreateEntitySpendLimitRequest$Outbound = {
    feature_id?: string | undefined;
    enabled: boolean;
    overage_limit?: number | undefined;
};
/** @internal */
export declare const CreateEntitySpendLimitRequest$outboundSchema: z.ZodMiniType<CreateEntitySpendLimitRequest$Outbound, CreateEntitySpendLimitRequest>;
export declare function createEntitySpendLimitRequestToJSON(createEntitySpendLimitRequest: CreateEntitySpendLimitRequest): string;
/** @internal */
export type CreateEntityBillingControlsRequest$Outbound = {
    spend_limits?: Array<CreateEntitySpendLimitRequest$Outbound> | undefined;
};
/** @internal */
export declare const CreateEntityBillingControlsRequest$outboundSchema: z.ZodMiniType<CreateEntityBillingControlsRequest$Outbound, CreateEntityBillingControlsRequest>;
export declare function createEntityBillingControlsRequestToJSON(createEntityBillingControlsRequest: CreateEntityBillingControlsRequest): string;
/** @internal */
export type CreateEntityParams$Outbound = {
    name?: string | null | undefined;
    feature_id: string;
    billing_controls?: CreateEntityBillingControlsRequest$Outbound | undefined;
    customer_data?: CustomerData$Outbound | undefined;
    customer_id: string;
    entity_id: string;
};
/** @internal */
export declare const CreateEntityParams$outboundSchema: z.ZodMiniType<CreateEntityParams$Outbound, CreateEntityParams>;
export declare function createEntityParamsToJSON(createEntityParams: CreateEntityParams): string;
/** @internal */
export declare const CreateEntityEnv$inboundSchema: z.ZodMiniType<CreateEntityEnv, unknown>;
/** @internal */
export declare const CreateEntityStatus$inboundSchema: z.ZodMiniType<CreateEntityStatus, unknown>;
/** @internal */
export declare const CreateEntitySubscription$inboundSchema: z.ZodMiniType<CreateEntitySubscription, unknown>;
export declare function createEntitySubscriptionFromJSON(jsonString: string): SafeParseResult<CreateEntitySubscription, SDKValidationError>;
/** @internal */
export declare const CreateEntityPurchase$inboundSchema: z.ZodMiniType<CreateEntityPurchase, unknown>;
export declare function createEntityPurchaseFromJSON(jsonString: string): SafeParseResult<CreateEntityPurchase, SDKValidationError>;
/** @internal */
export declare const CreateEntityType$inboundSchema: z.ZodMiniType<CreateEntityType, unknown>;
/** @internal */
export declare const CreateEntityCreditSchema$inboundSchema: z.ZodMiniType<CreateEntityCreditSchema, unknown>;
export declare function createEntityCreditSchemaFromJSON(jsonString: string): SafeParseResult<CreateEntityCreditSchema, SDKValidationError>;
/** @internal */
export declare const CreateEntityDisplay$inboundSchema: z.ZodMiniType<CreateEntityDisplay, unknown>;
export declare function createEntityDisplayFromJSON(jsonString: string): SafeParseResult<CreateEntityDisplay, SDKValidationError>;
/** @internal */
export declare const CreateEntityFeature$inboundSchema: z.ZodMiniType<CreateEntityFeature, unknown>;
export declare function createEntityFeatureFromJSON(jsonString: string): SafeParseResult<CreateEntityFeature, SDKValidationError>;
/** @internal */
export declare const CreateEntityFlags$inboundSchema: z.ZodMiniType<CreateEntityFlags, unknown>;
export declare function createEntityFlagsFromJSON(jsonString: string): SafeParseResult<CreateEntityFlags, SDKValidationError>;
/** @internal */
export declare const CreateEntitySpendLimitResponse$inboundSchema: z.ZodMiniType<CreateEntitySpendLimitResponse, unknown>;
export declare function createEntitySpendLimitResponseFromJSON(jsonString: string): SafeParseResult<CreateEntitySpendLimitResponse, SDKValidationError>;
/** @internal */
export declare const CreateEntityBillingControlsResponse$inboundSchema: z.ZodMiniType<CreateEntityBillingControlsResponse, unknown>;
export declare function createEntityBillingControlsResponseFromJSON(jsonString: string): SafeParseResult<CreateEntityBillingControlsResponse, SDKValidationError>;
/** @internal */
export declare const CreateEntityInvoice$inboundSchema: z.ZodMiniType<CreateEntityInvoice, unknown>;
export declare function createEntityInvoiceFromJSON(jsonString: string): SafeParseResult<CreateEntityInvoice, SDKValidationError>;
/** @internal */
export declare const CreateEntityResponse$inboundSchema: z.ZodMiniType<CreateEntityResponse, unknown>;
export declare function createEntityResponseFromJSON(jsonString: string): SafeParseResult<CreateEntityResponse, SDKValidationError>;
