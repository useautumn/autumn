import * as z from "zod/v4-mini";
import { ClosedEnum, OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { Balance } from "./balance.js";
import { Plan } from "./plan.js";
import { SDKValidationError } from "./sdk-validation-error.js";
export type ListCustomersGlobals = {
    xApiVersion?: string | undefined;
};
export type ListCustomersPlan = {
    id: string;
    versions?: Array<number> | undefined;
};
/**
 * Filter by customer product status. Defaults to active and scheduled
 */
export declare const SubscriptionStatus: {
    readonly Active: "active";
    readonly Scheduled: "scheduled";
};
/**
 * Filter by customer product status. Defaults to active and scheduled
 */
export type SubscriptionStatus = ClosedEnum<typeof SubscriptionStatus>;
export type ListCustomersParams = {
    /**
     * Number of items to skip
     */
    offset?: number | undefined;
    /**
     * Number of items to return. Default 10, max 1000.
     */
    limit?: number | undefined;
    /**
     * Filter by plan ID and version. Returns customers with active subscriptions to this plan.
     */
    plans?: Array<ListCustomersPlan> | undefined;
    /**
     * Filter by customer product status. Defaults to active and scheduled
     */
    subscriptionStatus?: SubscriptionStatus | undefined;
    /**
     * Search customers by id, name, or email
     */
    search?: string | undefined;
};
/**
 * The environment this customer was created in.
 */
export declare const ListCustomersEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * The environment this customer was created in.
 */
export type ListCustomersEnv = OpenEnum<typeof ListCustomersEnv>;
/**
 * The time interval for the purchase limit window.
 */
export declare const ListCustomersInterval: {
    readonly Hour: "hour";
    readonly Day: "day";
    readonly Week: "week";
    readonly Month: "month";
};
/**
 * The time interval for the purchase limit window.
 */
export type ListCustomersInterval = OpenEnum<typeof ListCustomersInterval>;
/**
 * Optional rate limit to cap how often auto top-ups occur.
 */
export type ListCustomersPurchaseLimit = {
    /**
     * The time interval for the purchase limit window.
     */
    interval: ListCustomersInterval;
    /**
     * Number of intervals in the purchase limit window.
     */
    intervalCount: number;
    /**
     * Maximum number of auto top-ups allowed within the interval.
     */
    limit: number;
};
export type ListCustomersAutoTopup = {
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
    purchaseLimit?: ListCustomersPurchaseLimit | undefined;
};
export type ListCustomersSpendLimit = {
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
export type ListCustomersBillingControls = {
    /**
     * List of auto top-up configurations per feature.
     */
    autoTopups?: Array<ListCustomersAutoTopup> | undefined;
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<ListCustomersSpendLimit> | undefined;
};
/**
 * Current status of the subscription.
 */
export declare const ListCustomersStatus: {
    readonly Active: "active";
    readonly Scheduled: "scheduled";
};
/**
 * Current status of the subscription.
 */
export type ListCustomersStatus = OpenEnum<typeof ListCustomersStatus>;
export type ListCustomersSubscription = {
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
    status: ListCustomersStatus;
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
export type ListCustomersPurchase = {
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
export declare const ListCustomersType: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export type ListCustomersType = OpenEnum<typeof ListCustomersType>;
export type ListCustomersCreditSchema = {
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
export type ListCustomersDisplay = {
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
export type ListCustomersFeature = {
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
    type: ListCustomersType;
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
    creditSchema?: Array<ListCustomersCreditSchema> | undefined;
    /**
     * Display names for the feature in billing UI and customer-facing components.
     */
    display?: ListCustomersDisplay | undefined;
    /**
     * Whether the feature is archived and hidden from the dashboard.
     */
    archived: boolean;
};
export type ListCustomersFlags = {
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
    feature?: ListCustomersFeature | undefined;
};
export type ListCustomersList = {
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
    env: ListCustomersEnv;
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
    billingControls: ListCustomersBillingControls;
    /**
     * Active and scheduled recurring plans that this customer has attached.
     */
    subscriptions: Array<ListCustomersSubscription>;
    /**
     * One-time purchases made by the customer.
     */
    purchases: Array<ListCustomersPurchase>;
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
        [k: string]: ListCustomersFlags;
    };
};
/**
 * OK
 */
export type ListCustomersResponse = {
    /**
     * Array of items for current page
     */
    list: Array<ListCustomersList>;
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
export type ListCustomersPlan$Outbound = {
    id: string;
    versions?: Array<number> | undefined;
};
/** @internal */
export declare const ListCustomersPlan$outboundSchema: z.ZodMiniType<ListCustomersPlan$Outbound, ListCustomersPlan>;
export declare function listCustomersPlanToJSON(listCustomersPlan: ListCustomersPlan): string;
/** @internal */
export declare const SubscriptionStatus$outboundSchema: z.ZodMiniEnum<typeof SubscriptionStatus>;
/** @internal */
export type ListCustomersParams$Outbound = {
    offset: number;
    limit: number;
    plans?: Array<ListCustomersPlan$Outbound> | undefined;
    subscription_status?: string | undefined;
    search?: string | undefined;
};
/** @internal */
export declare const ListCustomersParams$outboundSchema: z.ZodMiniType<ListCustomersParams$Outbound, ListCustomersParams>;
export declare function listCustomersParamsToJSON(listCustomersParams: ListCustomersParams): string;
/** @internal */
export declare const ListCustomersEnv$inboundSchema: z.ZodMiniType<ListCustomersEnv, unknown>;
/** @internal */
export declare const ListCustomersInterval$inboundSchema: z.ZodMiniType<ListCustomersInterval, unknown>;
/** @internal */
export declare const ListCustomersPurchaseLimit$inboundSchema: z.ZodMiniType<ListCustomersPurchaseLimit, unknown>;
export declare function listCustomersPurchaseLimitFromJSON(jsonString: string): SafeParseResult<ListCustomersPurchaseLimit, SDKValidationError>;
/** @internal */
export declare const ListCustomersAutoTopup$inboundSchema: z.ZodMiniType<ListCustomersAutoTopup, unknown>;
export declare function listCustomersAutoTopupFromJSON(jsonString: string): SafeParseResult<ListCustomersAutoTopup, SDKValidationError>;
/** @internal */
export declare const ListCustomersSpendLimit$inboundSchema: z.ZodMiniType<ListCustomersSpendLimit, unknown>;
export declare function listCustomersSpendLimitFromJSON(jsonString: string): SafeParseResult<ListCustomersSpendLimit, SDKValidationError>;
/** @internal */
export declare const ListCustomersBillingControls$inboundSchema: z.ZodMiniType<ListCustomersBillingControls, unknown>;
export declare function listCustomersBillingControlsFromJSON(jsonString: string): SafeParseResult<ListCustomersBillingControls, SDKValidationError>;
/** @internal */
export declare const ListCustomersStatus$inboundSchema: z.ZodMiniType<ListCustomersStatus, unknown>;
/** @internal */
export declare const ListCustomersSubscription$inboundSchema: z.ZodMiniType<ListCustomersSubscription, unknown>;
export declare function listCustomersSubscriptionFromJSON(jsonString: string): SafeParseResult<ListCustomersSubscription, SDKValidationError>;
/** @internal */
export declare const ListCustomersPurchase$inboundSchema: z.ZodMiniType<ListCustomersPurchase, unknown>;
export declare function listCustomersPurchaseFromJSON(jsonString: string): SafeParseResult<ListCustomersPurchase, SDKValidationError>;
/** @internal */
export declare const ListCustomersType$inboundSchema: z.ZodMiniType<ListCustomersType, unknown>;
/** @internal */
export declare const ListCustomersCreditSchema$inboundSchema: z.ZodMiniType<ListCustomersCreditSchema, unknown>;
export declare function listCustomersCreditSchemaFromJSON(jsonString: string): SafeParseResult<ListCustomersCreditSchema, SDKValidationError>;
/** @internal */
export declare const ListCustomersDisplay$inboundSchema: z.ZodMiniType<ListCustomersDisplay, unknown>;
export declare function listCustomersDisplayFromJSON(jsonString: string): SafeParseResult<ListCustomersDisplay, SDKValidationError>;
/** @internal */
export declare const ListCustomersFeature$inboundSchema: z.ZodMiniType<ListCustomersFeature, unknown>;
export declare function listCustomersFeatureFromJSON(jsonString: string): SafeParseResult<ListCustomersFeature, SDKValidationError>;
/** @internal */
export declare const ListCustomersFlags$inboundSchema: z.ZodMiniType<ListCustomersFlags, unknown>;
export declare function listCustomersFlagsFromJSON(jsonString: string): SafeParseResult<ListCustomersFlags, SDKValidationError>;
/** @internal */
export declare const ListCustomersList$inboundSchema: z.ZodMiniType<ListCustomersList, unknown>;
export declare function listCustomersListFromJSON(jsonString: string): SafeParseResult<ListCustomersList, SDKValidationError>;
/** @internal */
export declare const ListCustomersResponse$inboundSchema: z.ZodMiniType<ListCustomersResponse, unknown>;
export declare function listCustomersResponseFromJSON(jsonString: string): SafeParseResult<ListCustomersResponse, SDKValidationError>;
