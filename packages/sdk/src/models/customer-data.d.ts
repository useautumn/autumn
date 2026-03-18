import * as z from "zod/v4-mini";
import { ClosedEnum } from "../types/enums.js";
/**
 * The time interval for the purchase limit window.
 */
export declare const CustomerDataInterval: {
    readonly Hour: "hour";
    readonly Day: "day";
    readonly Week: "week";
    readonly Month: "month";
};
/**
 * The time interval for the purchase limit window.
 */
export type CustomerDataInterval = ClosedEnum<typeof CustomerDataInterval>;
/**
 * Optional rate limit to cap how often auto top-ups occur.
 */
export type CustomerDataPurchaseLimit = {
    /**
     * The time interval for the purchase limit window.
     */
    interval: CustomerDataInterval;
    /**
     * Number of intervals in the purchase limit window.
     */
    intervalCount?: number | undefined;
    /**
     * Maximum number of auto top-ups allowed within the interval.
     */
    limit: number;
};
export type CustomerDataAutoTopup = {
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
    purchaseLimit?: CustomerDataPurchaseLimit | undefined;
};
export type CustomerDataSpendLimit = {
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
export type CustomerDataBillingControls = {
    /**
     * List of auto top-up configurations per feature.
     */
    autoTopups?: Array<CustomerDataAutoTopup> | undefined;
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<CustomerDataSpendLimit> | undefined;
};
/**
 * Customer details to set when creating a customer
 */
export type CustomerData = {
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
    billingControls?: CustomerDataBillingControls | undefined;
};
/** @internal */
export declare const CustomerDataInterval$outboundSchema: z.ZodMiniEnum<typeof CustomerDataInterval>;
/** @internal */
export type CustomerDataPurchaseLimit$Outbound = {
    interval: string;
    interval_count: number;
    limit: number;
};
/** @internal */
export declare const CustomerDataPurchaseLimit$outboundSchema: z.ZodMiniType<CustomerDataPurchaseLimit$Outbound, CustomerDataPurchaseLimit>;
export declare function customerDataPurchaseLimitToJSON(customerDataPurchaseLimit: CustomerDataPurchaseLimit): string;
/** @internal */
export type CustomerDataAutoTopup$Outbound = {
    feature_id: string;
    enabled: boolean;
    threshold: number;
    quantity: number;
    purchase_limit?: CustomerDataPurchaseLimit$Outbound | undefined;
};
/** @internal */
export declare const CustomerDataAutoTopup$outboundSchema: z.ZodMiniType<CustomerDataAutoTopup$Outbound, CustomerDataAutoTopup>;
export declare function customerDataAutoTopupToJSON(customerDataAutoTopup: CustomerDataAutoTopup): string;
/** @internal */
export type CustomerDataSpendLimit$Outbound = {
    feature_id?: string | undefined;
    enabled: boolean;
    overage_limit?: number | undefined;
};
/** @internal */
export declare const CustomerDataSpendLimit$outboundSchema: z.ZodMiniType<CustomerDataSpendLimit$Outbound, CustomerDataSpendLimit>;
export declare function customerDataSpendLimitToJSON(customerDataSpendLimit: CustomerDataSpendLimit): string;
/** @internal */
export type CustomerDataBillingControls$Outbound = {
    auto_topups?: Array<CustomerDataAutoTopup$Outbound> | undefined;
    spend_limits?: Array<CustomerDataSpendLimit$Outbound> | undefined;
};
/** @internal */
export declare const CustomerDataBillingControls$outboundSchema: z.ZodMiniType<CustomerDataBillingControls$Outbound, CustomerDataBillingControls>;
export declare function customerDataBillingControlsToJSON(customerDataBillingControls: CustomerDataBillingControls): string;
/** @internal */
export type CustomerData$Outbound = {
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
    billing_controls?: CustomerDataBillingControls$Outbound | undefined;
};
/** @internal */
export declare const CustomerData$outboundSchema: z.ZodMiniType<CustomerData$Outbound, CustomerData>;
export declare function customerDataToJSON(customerData: CustomerData): string;
