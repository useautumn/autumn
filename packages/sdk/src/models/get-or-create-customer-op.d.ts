import * as z from "zod/v4-mini";
import { ClosedEnum } from "../types/enums.js";
export type GetOrCreateCustomerGlobals = {
    xApiVersion?: string | undefined;
};
/**
 * The time interval for the purchase limit window.
 */
export declare const GetOrCreateCustomerInterval: {
    readonly Hour: "hour";
    readonly Day: "day";
    readonly Week: "week";
    readonly Month: "month";
};
/**
 * The time interval for the purchase limit window.
 */
export type GetOrCreateCustomerInterval = ClosedEnum<typeof GetOrCreateCustomerInterval>;
/**
 * Optional rate limit to cap how often auto top-ups occur.
 */
export type GetOrCreateCustomerPurchaseLimit = {
    /**
     * The time interval for the purchase limit window.
     */
    interval: GetOrCreateCustomerInterval;
    /**
     * Number of intervals in the purchase limit window.
     */
    intervalCount?: number | undefined;
    /**
     * Maximum number of auto top-ups allowed within the interval.
     */
    limit: number;
};
export type GetOrCreateCustomerAutoTopup = {
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
    purchaseLimit?: GetOrCreateCustomerPurchaseLimit | undefined;
};
export type GetOrCreateCustomerSpendLimit = {
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
export type GetOrCreateCustomerBillingControls = {
    /**
     * List of auto top-up configurations per feature.
     */
    autoTopups?: Array<GetOrCreateCustomerAutoTopup> | undefined;
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<GetOrCreateCustomerSpendLimit> | undefined;
};
export type GetOrCreateCustomerParams = {
    customerId: string | null;
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
     * Whether to create the customer in Stripe
     */
    createInStripe?: boolean | undefined;
    /**
     * The ID of the free plan to auto-enable for the customer
     */
    autoEnablePlanId?: string | undefined;
    /**
     * Whether to send email receipts to this customer
     */
    sendEmailReceipts?: boolean | undefined;
    /**
     * Billing controls for the customer (auto top-ups, etc.)
     */
    billingControls?: GetOrCreateCustomerBillingControls | undefined;
    /**
     * Fields to expand in the returned customer response, such as subscriptions.plan, purchases.plan, balances.feature, or flags.feature.
     */
    expand?: Array<string> | undefined;
};
/** @internal */
export declare const GetOrCreateCustomerInterval$outboundSchema: z.ZodMiniEnum<typeof GetOrCreateCustomerInterval>;
/** @internal */
export type GetOrCreateCustomerPurchaseLimit$Outbound = {
    interval: string;
    interval_count: number;
    limit: number;
};
/** @internal */
export declare const GetOrCreateCustomerPurchaseLimit$outboundSchema: z.ZodMiniType<GetOrCreateCustomerPurchaseLimit$Outbound, GetOrCreateCustomerPurchaseLimit>;
export declare function getOrCreateCustomerPurchaseLimitToJSON(getOrCreateCustomerPurchaseLimit: GetOrCreateCustomerPurchaseLimit): string;
/** @internal */
export type GetOrCreateCustomerAutoTopup$Outbound = {
    feature_id: string;
    enabled: boolean;
    threshold: number;
    quantity: number;
    purchase_limit?: GetOrCreateCustomerPurchaseLimit$Outbound | undefined;
};
/** @internal */
export declare const GetOrCreateCustomerAutoTopup$outboundSchema: z.ZodMiniType<GetOrCreateCustomerAutoTopup$Outbound, GetOrCreateCustomerAutoTopup>;
export declare function getOrCreateCustomerAutoTopupToJSON(getOrCreateCustomerAutoTopup: GetOrCreateCustomerAutoTopup): string;
/** @internal */
export type GetOrCreateCustomerSpendLimit$Outbound = {
    feature_id?: string | undefined;
    enabled: boolean;
    overage_limit?: number | undefined;
};
/** @internal */
export declare const GetOrCreateCustomerSpendLimit$outboundSchema: z.ZodMiniType<GetOrCreateCustomerSpendLimit$Outbound, GetOrCreateCustomerSpendLimit>;
export declare function getOrCreateCustomerSpendLimitToJSON(getOrCreateCustomerSpendLimit: GetOrCreateCustomerSpendLimit): string;
/** @internal */
export type GetOrCreateCustomerBillingControls$Outbound = {
    auto_topups?: Array<GetOrCreateCustomerAutoTopup$Outbound> | undefined;
    spend_limits?: Array<GetOrCreateCustomerSpendLimit$Outbound> | undefined;
};
/** @internal */
export declare const GetOrCreateCustomerBillingControls$outboundSchema: z.ZodMiniType<GetOrCreateCustomerBillingControls$Outbound, GetOrCreateCustomerBillingControls>;
export declare function getOrCreateCustomerBillingControlsToJSON(getOrCreateCustomerBillingControls: GetOrCreateCustomerBillingControls): string;
/** @internal */
export type GetOrCreateCustomerParams$Outbound = {
    customer_id: string | null;
    name?: string | null | undefined;
    email?: string | null | undefined;
    fingerprint?: string | null | undefined;
    metadata?: {
        [k: string]: any;
    } | null | undefined;
    stripe_id?: string | null | undefined;
    create_in_stripe?: boolean | undefined;
    auto_enable_plan_id?: string | undefined;
    send_email_receipts?: boolean | undefined;
    billing_controls?: GetOrCreateCustomerBillingControls$Outbound | undefined;
    expand?: Array<string> | undefined;
};
/** @internal */
export declare const GetOrCreateCustomerParams$outboundSchema: z.ZodMiniType<GetOrCreateCustomerParams$Outbound, GetOrCreateCustomerParams>;
export declare function getOrCreateCustomerParamsToJSON(getOrCreateCustomerParams: GetOrCreateCustomerParams): string;
