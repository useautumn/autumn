import * as z from "zod/v4-mini";
import { ClosedEnum, OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { Balance } from "./balance.js";
import { Plan } from "./plan.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type UpdateCustomerGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * The time interval for the purchase limit window.
 */
export declare const UpdateCustomerIntervalRequest: {
    readonly Hour: "hour";
    readonly Day: "day";
    readonly Week: "week";
    readonly Month: "month";
};
/**
 * The time interval for the purchase limit window.
 */
export type UpdateCustomerIntervalRequest = ClosedEnum<typeof UpdateCustomerIntervalRequest>;
/**
 * Optional rate limit to cap how often auto top-ups occur.
 */
export type UpdateCustomerPurchaseLimitRequest = {
    /**
     * The time interval for the purchase limit window.
     */
    interval: UpdateCustomerIntervalRequest;
    /**
     * Number of intervals in the purchase limit window.
     */
    intervalCount?: number | undefined;
    /**
     * Maximum number of auto top-ups allowed within the interval.
     */
    limit: number;
};
export type UpdateCustomerAutoTopupRequest = {
    /**
     * The ID of the feature (credit balance) to auto top-up.
     */
    featureId: string;
    /**
     * Whether auto top-up is enabled.
     */
    enabled?: boolean | undefined;
    /**
     * When the balance drops below this threshold, an auto top-up will be purchased.
     */
    threshold: number;
    /**
     * Amount of credits to add per auto top-up.
     */
    quantity: number;
    /**
     * Optional rate limit to cap how often auto top-ups occur.
     */
    purchaseLimit?: UpdateCustomerPurchaseLimitRequest | undefined;
};
export type UpdateCustomerSpendLimitRequest = {
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
 * Billing controls for the customer (auto top-ups, etc.)
 */
export type UpdateCustomerBillingControlsRequest = {
    /**
     * List of auto top-up configurations per feature.
     */
    autoTopups?: Array<UpdateCustomerAutoTopupRequest> | undefined;
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<UpdateCustomerSpendLimitRequest> | undefined;
};
export type UpdateCustomerParams = {
    /**
     * ID of the customer to update
     */
    customerId: string;
    /**
     * Customer's name
     */
    name?: string | null | undefined;
    /**
     * Customer's email address
     */
    email?: string | null | undefined;
    /**
     * Unique identifier (eg, serial number) to detect duplicate customers and prevent free trial abuse
     */
    fingerprint?: string | null | undefined;
    /**
     * Additional metadata for the customer
     */
    metadata?: {
        [k: string]: any;
    } | null | undefined;
    /**
     * Stripe customer ID if you already have one
     */
    stripeId?: string | null | undefined;
    /**
     * Whether to send email receipts to this customer
     */
    sendEmailReceipts?: boolean | undefined;
    /**
     * Billing controls for the customer (auto top-ups, etc.)
     */
    billingControls?: UpdateCustomerBillingControlsRequest | undefined;
    /**
     * Your unique identifier for the customer
     */
    newCustomerId?: string | undefined;
};
/**
 * The environment this customer was created in.
 */
export declare const UpdateCustomerEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * The environment this customer was created in.
 */
export type UpdateCustomerEnv = OpenEnum<typeof UpdateCustomerEnv>;
/**
 * The time interval for the purchase limit window.
 */
export declare const UpdateCustomerIntervalResponse: {
    readonly Hour: "hour";
    readonly Day: "day";
    readonly Week: "week";
    readonly Month: "month";
};
/**
 * The time interval for the purchase limit window.
 */
export type UpdateCustomerIntervalResponse = OpenEnum<typeof UpdateCustomerIntervalResponse>;
/**
 * Optional rate limit to cap how often auto top-ups occur.
 */
export type UpdateCustomerPurchaseLimitResponse = {
    /**
     * The time interval for the purchase limit window.
     */
    interval: UpdateCustomerIntervalResponse;
    /**
     * Number of intervals in the purchase limit window.
     */
    intervalCount: number;
    /**
     * Maximum number of auto top-ups allowed within the interval.
     */
    limit: number;
};
export type UpdateCustomerAutoTopupResponse = {
    /**
     * The ID of the feature (credit balance) to auto top-up.
     */
    featureId: string;
    /**
     * Whether auto top-up is enabled.
     */
    enabled: boolean;
    /**
     * When the balance drops below this threshold, an auto top-up will be purchased.
     */
    threshold: number;
    /**
     * Amount of credits to add per auto top-up.
     */
    quantity: number;
    /**
     * Optional rate limit to cap how often auto top-ups occur.
     */
    purchaseLimit?: UpdateCustomerPurchaseLimitResponse | undefined;
};
export type UpdateCustomerSpendLimitResponse = {
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
 * Billing controls for the customer (auto top-ups, etc.)
 */
export type UpdateCustomerBillingControlsResponse = {
    /**
     * List of auto top-up configurations per feature.
     */
    autoTopups?: Array<UpdateCustomerAutoTopupResponse> | undefined;
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<UpdateCustomerSpendLimitResponse> | undefined;
};
/**
 * Current status of the subscription.
 */
export declare const UpdateCustomerStatus: {
    readonly Active: "active";
    readonly Scheduled: "scheduled";
};
/**
 * Current status of the subscription.
 */
export type UpdateCustomerStatus = OpenEnum<typeof UpdateCustomerStatus>;
export type UpdateCustomerSubscription = {
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
    status: UpdateCustomerStatus;
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
export type UpdateCustomerPurchase = {
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
export declare const UpdateCustomerType: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export type UpdateCustomerType = OpenEnum<typeof UpdateCustomerType>;
export type UpdateCustomerCreditSchema = {
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
export type UpdateCustomerDisplay = {
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
export type UpdateCustomerFeature = {
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
    type: UpdateCustomerType;
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
    creditSchema?: Array<UpdateCustomerCreditSchema> | undefined;
    /**
     * Display names for the feature in billing UI and customer-facing components.
     */
    display?: UpdateCustomerDisplay | undefined;
    /**
     * Whether the feature is archived and hidden from the dashboard.
     */
    archived: boolean;
};
export type UpdateCustomerFlags = {
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
    feature?: UpdateCustomerFeature | undefined;
};
/**
 * OK
 */
export type UpdateCustomerResponse = {
    /**
     * Your unique identifier for the customer.
     */
    id: string | null;
    /**
     * The name of the customer.
     */
    name: string | null;
    /**
     * The email address of the customer.
     */
    email: string | null;
    /**
     * Timestamp of customer creation in milliseconds since epoch.
     */
    createdAt: number;
    /**
     * A unique identifier (eg. serial number) to de-duplicate customers across devices or browsers. For example: apple device ID.
     */
    fingerprint: string | null;
    /**
     * Stripe customer ID.
     */
    stripeId: string | null;
    /**
     * The environment this customer was created in.
     */
    env: UpdateCustomerEnv;
    /**
     * The metadata for the customer.
     */
    metadata: {
        [k: string]: any;
    };
    /**
     * Whether to send email receipts to the customer.
     */
    sendEmailReceipts: boolean;
    /**
     * Billing controls for the customer (auto top-ups, etc.)
     */
    billingControls: UpdateCustomerBillingControlsResponse;
    /**
     * Active and scheduled recurring plans that this customer has attached.
     */
    subscriptions: Array<UpdateCustomerSubscription>;
    /**
     * One-time purchases made by the customer.
     */
    purchases: Array<UpdateCustomerPurchase>;
    /**
     * Feature balances keyed by feature ID, showing usage limits and remaining amounts.
     */
    balances: {
        [k: string]: Balance;
    };
    /**
     * Boolean feature flags keyed by feature ID, showing enabled access for on/off features.
     */
    flags: {
        [k: string]: UpdateCustomerFlags;
    };
};
/** @internal */
export declare const UpdateCustomerIntervalRequest$outboundSchema: z.ZodMiniEnum<typeof UpdateCustomerIntervalRequest>;
/** @internal */
export type UpdateCustomerPurchaseLimitRequest$Outbound = {
    interval: string;
    interval_count: number;
    limit: number;
};
/** @internal */
export declare const UpdateCustomerPurchaseLimitRequest$outboundSchema: z.ZodMiniType<UpdateCustomerPurchaseLimitRequest$Outbound, UpdateCustomerPurchaseLimitRequest>;
export declare function updateCustomerPurchaseLimitRequestToJSON(updateCustomerPurchaseLimitRequest: UpdateCustomerPurchaseLimitRequest): string;
/** @internal */
export type UpdateCustomerAutoTopupRequest$Outbound = {
    feature_id: string;
    enabled: boolean;
    threshold: number;
    quantity: number;
    purchase_limit?: UpdateCustomerPurchaseLimitRequest$Outbound | undefined;
};
/** @internal */
export declare const UpdateCustomerAutoTopupRequest$outboundSchema: z.ZodMiniType<UpdateCustomerAutoTopupRequest$Outbound, UpdateCustomerAutoTopupRequest>;
export declare function updateCustomerAutoTopupRequestToJSON(updateCustomerAutoTopupRequest: UpdateCustomerAutoTopupRequest): string;
/** @internal */
export type UpdateCustomerSpendLimitRequest$Outbound = {
    feature_id?: string | undefined;
    enabled: boolean;
    overage_limit?: number | undefined;
};
/** @internal */
export declare const UpdateCustomerSpendLimitRequest$outboundSchema: z.ZodMiniType<UpdateCustomerSpendLimitRequest$Outbound, UpdateCustomerSpendLimitRequest>;
export declare function updateCustomerSpendLimitRequestToJSON(updateCustomerSpendLimitRequest: UpdateCustomerSpendLimitRequest): string;
/** @internal */
export type UpdateCustomerBillingControlsRequest$Outbound = {
    auto_topups?: Array<UpdateCustomerAutoTopupRequest$Outbound> | undefined;
    spend_limits?: Array<UpdateCustomerSpendLimitRequest$Outbound> | undefined;
};
/** @internal */
export declare const UpdateCustomerBillingControlsRequest$outboundSchema: z.ZodMiniType<UpdateCustomerBillingControlsRequest$Outbound, UpdateCustomerBillingControlsRequest>;
export declare function updateCustomerBillingControlsRequestToJSON(updateCustomerBillingControlsRequest: UpdateCustomerBillingControlsRequest): string;
/** @internal */
export type UpdateCustomerParams$Outbound = {
    customer_id: string;
    name?: string | null | undefined;
    email?: string | null | undefined;
    fingerprint?: string | null | undefined;
    metadata?: {
        [k: string]: any;
    } | null | undefined;
    stripe_id?: string | null | undefined;
    send_email_receipts?: boolean | undefined;
    billing_controls?: UpdateCustomerBillingControlsRequest$Outbound | undefined;
    new_customer_id?: string | undefined;
};
/** @internal */
export declare const UpdateCustomerParams$outboundSchema: z.ZodMiniType<UpdateCustomerParams$Outbound, UpdateCustomerParams>;
export declare function updateCustomerParamsToJSON(updateCustomerParams: UpdateCustomerParams): string;
/** @internal */
export declare const UpdateCustomerEnv$inboundSchema: z.ZodMiniType<UpdateCustomerEnv, unknown>;
/** @internal */
export declare const UpdateCustomerIntervalResponse$inboundSchema: z.ZodMiniType<UpdateCustomerIntervalResponse, unknown>;
/** @internal */
export declare const UpdateCustomerPurchaseLimitResponse$inboundSchema: z.ZodMiniType<UpdateCustomerPurchaseLimitResponse, unknown>;
export declare function updateCustomerPurchaseLimitResponseFromJSON(jsonString: string): SafeParseResult<UpdateCustomerPurchaseLimitResponse, SDKValidationError>;
/** @internal */
export declare const UpdateCustomerAutoTopupResponse$inboundSchema: z.ZodMiniType<UpdateCustomerAutoTopupResponse, unknown>;
export declare function updateCustomerAutoTopupResponseFromJSON(jsonString: string): SafeParseResult<UpdateCustomerAutoTopupResponse, SDKValidationError>;
/** @internal */
export declare const UpdateCustomerSpendLimitResponse$inboundSchema: z.ZodMiniType<UpdateCustomerSpendLimitResponse, unknown>;
export declare function updateCustomerSpendLimitResponseFromJSON(jsonString: string): SafeParseResult<UpdateCustomerSpendLimitResponse, SDKValidationError>;
/** @internal */
export declare const UpdateCustomerBillingControlsResponse$inboundSchema: z.ZodMiniType<UpdateCustomerBillingControlsResponse, unknown>;
export declare function updateCustomerBillingControlsResponseFromJSON(jsonString: string): SafeParseResult<UpdateCustomerBillingControlsResponse, SDKValidationError>;
/** @internal */
export declare const UpdateCustomerStatus$inboundSchema: z.ZodMiniType<UpdateCustomerStatus, unknown>;
/** @internal */
export declare const UpdateCustomerSubscription$inboundSchema: z.ZodMiniType<UpdateCustomerSubscription, unknown>;
export declare function updateCustomerSubscriptionFromJSON(jsonString: string): SafeParseResult<UpdateCustomerSubscription, SDKValidationError>;
/** @internal */
export declare const UpdateCustomerPurchase$inboundSchema: z.ZodMiniType<UpdateCustomerPurchase, unknown>;
export declare function updateCustomerPurchaseFromJSON(jsonString: string): SafeParseResult<UpdateCustomerPurchase, SDKValidationError>;
/** @internal */
export declare const UpdateCustomerType$inboundSchema: z.ZodMiniType<UpdateCustomerType, unknown>;
/** @internal */
export declare const UpdateCustomerCreditSchema$inboundSchema: z.ZodMiniType<UpdateCustomerCreditSchema, unknown>;
export declare function updateCustomerCreditSchemaFromJSON(jsonString: string): SafeParseResult<UpdateCustomerCreditSchema, SDKValidationError>;
/** @internal */
export declare const UpdateCustomerDisplay$inboundSchema: z.ZodMiniType<UpdateCustomerDisplay, unknown>;
export declare function updateCustomerDisplayFromJSON(jsonString: string): SafeParseResult<UpdateCustomerDisplay, SDKValidationError>;
/** @internal */
export declare const UpdateCustomerFeature$inboundSchema: z.ZodMiniType<UpdateCustomerFeature, unknown>;
export declare function updateCustomerFeatureFromJSON(jsonString: string): SafeParseResult<UpdateCustomerFeature, SDKValidationError>;
/** @internal */
export declare const UpdateCustomerFlags$inboundSchema: z.ZodMiniType<UpdateCustomerFlags, unknown>;
export declare function updateCustomerFlagsFromJSON(jsonString: string): SafeParseResult<UpdateCustomerFlags, SDKValidationError>;
/** @internal */
export declare const UpdateCustomerResponse$inboundSchema: z.ZodMiniType<UpdateCustomerResponse, unknown>;
export declare function updateCustomerResponseFromJSON(jsonString: string): SafeParseResult<UpdateCustomerResponse, SDKValidationError>;
