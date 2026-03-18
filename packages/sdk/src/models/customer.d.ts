import * as z from "zod/v4-mini";
import { OpenEnum } from "../types/enums.js";
import { Result as SafeParseResult } from "../types/fp.js";
import { Balance } from "./balance.js";
import { Plan } from "./plan.js";
import { SDKValidationError } from "./sdk-validation-error.js";
/**
 * The environment this customer was created in.
 */
export declare const CustomerEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * The environment this customer was created in.
 */
export type CustomerEnv = OpenEnum<typeof CustomerEnv>;
/**
 * The time interval for the purchase limit window.
 */
export declare const CustomerInterval: {
    readonly Hour: "hour";
    readonly Day: "day";
    readonly Week: "week";
    readonly Month: "month";
};
/**
 * The time interval for the purchase limit window.
 */
export type CustomerInterval = OpenEnum<typeof CustomerInterval>;
/**
 * Optional rate limit to cap how often auto top-ups occur.
 */
export type CustomerPurchaseLimit = {
    /**
     * The time interval for the purchase limit window.
     */
    interval: CustomerInterval;
    /**
     * Number of intervals in the purchase limit window.
     */
    intervalCount: number;
    /**
     * Maximum number of auto top-ups allowed within the interval.
     */
    limit: number;
};
export type CustomerAutoTopup = {
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
    purchaseLimit?: CustomerPurchaseLimit | undefined;
};
export type CustomerSpendLimit = {
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
export type CustomerBillingControls = {
    /**
     * List of auto top-up configurations per feature.
     */
    autoTopups?: Array<CustomerAutoTopup> | undefined;
    /**
     * List of overage spend limits per feature.
     */
    spendLimits?: Array<CustomerSpendLimit> | undefined;
};
/**
 * Current status of the subscription.
 */
export declare const CustomerStatus: {
    readonly Active: "active";
    readonly Scheduled: "scheduled";
};
/**
 * Current status of the subscription.
 */
export type CustomerStatus = OpenEnum<typeof CustomerStatus>;
export type Subscription = {
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
    status: CustomerStatus;
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
export type Purchase = {
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
export declare const CustomerFlagsType: {
    readonly Boolean: "boolean";
    readonly Metered: "metered";
    readonly CreditSystem: "credit_system";
};
/**
 * Feature type: 'boolean' for on/off access, 'metered' for usage-tracked features, 'credit_system' for unified credit pools.
 */
export type CustomerFlagsType = OpenEnum<typeof CustomerFlagsType>;
export type CustomerCreditSchema = {
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
export type CustomerDisplay = {
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
export type CustomerFeature = {
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
    type: CustomerFlagsType;
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
    creditSchema?: Array<CustomerCreditSchema> | undefined;
    /**
     * Display names for the feature in billing UI and customer-facing components.
     */
    display?: CustomerDisplay | undefined;
    /**
     * Whether the feature is archived and hidden from the dashboard.
     */
    archived: boolean;
};
export type Flags = {
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
    feature?: CustomerFeature | undefined;
};
export type Invoice = {
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
 * The environment (sandbox/live)
 */
export declare const EntityEnv: {
    readonly Sandbox: "sandbox";
    readonly Live: "live";
};
/**
 * The environment (sandbox/live)
 */
export type EntityEnv = OpenEnum<typeof EntityEnv>;
export type Entity = {
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
    env: EntityEnv;
};
export type TrialsUsed = {
    planId: string;
    customerId: string;
    fingerprint?: string | null | undefined;
};
/**
 * The type of reward
 */
export declare const RewardsType: {
    readonly PercentageDiscount: "percentage_discount";
    readonly FixedDiscount: "fixed_discount";
    readonly FreeProduct: "free_product";
    readonly InvoiceCredits: "invoice_credits";
};
/**
 * The type of reward
 */
export type RewardsType = OpenEnum<typeof RewardsType>;
/**
 * How long the discount lasts
 */
export declare const CustomerDurationType: {
    readonly OneOff: "one_off";
    readonly Months: "months";
    readonly Forever: "forever";
};
/**
 * How long the discount lasts
 */
export type CustomerDurationType = OpenEnum<typeof CustomerDurationType>;
export type Discount = {
    /**
     * The unique identifier for this discount
     */
    id: string;
    /**
     * The name of the discount or coupon
     */
    name: string;
    /**
     * The type of reward
     */
    type: RewardsType;
    /**
     * The discount value (percentage or fixed amount)
     */
    discountValue: number;
    /**
     * How long the discount lasts
     */
    durationType: CustomerDurationType;
    /**
     * Number of billing periods the discount applies for repeating durations
     */
    durationValue?: number | null | undefined;
    /**
     * The currency code for fixed amount discounts
     */
    currency?: string | null | undefined;
    /**
     * Timestamp when the discount becomes active
     */
    start?: number | null | undefined;
    /**
     * Timestamp when the discount expires
     */
    end?: number | null | undefined;
    /**
     * The Stripe subscription ID this discount is applied to
     */
    subscriptionId?: string | null | undefined;
    /**
     * Total amount saved from this discount
     */
    totalDiscountAmount?: number | null | undefined;
};
export type Rewards = {
    /**
     * Array of active discounts applied to the customer
     */
    discounts: Array<Discount>;
};
export type ReferralCustomer = {
    id: string;
    name?: string | null | undefined;
    email?: string | null | undefined;
};
export type Referral = {
    programId: string;
    customer: ReferralCustomer;
    rewardApplied: boolean;
    createdAt: number;
};
export type Customer = {
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
    env: CustomerEnv;
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
    billingControls: CustomerBillingControls;
    /**
     * Active and scheduled recurring plans that this customer has attached.
     */
    subscriptions: Array<Subscription>;
    /**
     * One-time purchases made by the customer.
     */
    purchases: Array<Purchase>;
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
        [k: string]: Flags;
    };
    /**
     * Invoices for this customer.
     */
    invoices?: Array<Invoice> | undefined;
    /**
     * Entities associated with this customer.
     */
    entities?: Array<Entity> | undefined;
    /**
     * Trial usage history for this customer.
     */
    trialsUsed?: Array<TrialsUsed> | undefined;
    /**
     * Rewards earned or applied for this customer.
     */
    rewards?: Rewards | null | undefined;
    /**
     * Referral records for this customer.
     */
    referrals?: Array<Referral> | undefined;
    /**
     * The customer's default payment method.
     */
    paymentMethod?: any | null | undefined;
};
/** @internal */
export declare const CustomerEnv$inboundSchema: z.ZodMiniType<CustomerEnv, unknown>;
/** @internal */
export declare const CustomerInterval$inboundSchema: z.ZodMiniType<CustomerInterval, unknown>;
/** @internal */
export declare const CustomerPurchaseLimit$inboundSchema: z.ZodMiniType<CustomerPurchaseLimit, unknown>;
export declare function customerPurchaseLimitFromJSON(jsonString: string): SafeParseResult<CustomerPurchaseLimit, SDKValidationError>;
/** @internal */
export declare const CustomerAutoTopup$inboundSchema: z.ZodMiniType<CustomerAutoTopup, unknown>;
export declare function customerAutoTopupFromJSON(jsonString: string): SafeParseResult<CustomerAutoTopup, SDKValidationError>;
/** @internal */
export declare const CustomerSpendLimit$inboundSchema: z.ZodMiniType<CustomerSpendLimit, unknown>;
export declare function customerSpendLimitFromJSON(jsonString: string): SafeParseResult<CustomerSpendLimit, SDKValidationError>;
/** @internal */
export declare const CustomerBillingControls$inboundSchema: z.ZodMiniType<CustomerBillingControls, unknown>;
export declare function customerBillingControlsFromJSON(jsonString: string): SafeParseResult<CustomerBillingControls, SDKValidationError>;
/** @internal */
export declare const CustomerStatus$inboundSchema: z.ZodMiniType<CustomerStatus, unknown>;
/** @internal */
export declare const Subscription$inboundSchema: z.ZodMiniType<Subscription, unknown>;
export declare function subscriptionFromJSON(jsonString: string): SafeParseResult<Subscription, SDKValidationError>;
/** @internal */
export declare const Purchase$inboundSchema: z.ZodMiniType<Purchase, unknown>;
export declare function purchaseFromJSON(jsonString: string): SafeParseResult<Purchase, SDKValidationError>;
/** @internal */
export declare const CustomerFlagsType$inboundSchema: z.ZodMiniType<CustomerFlagsType, unknown>;
/** @internal */
export declare const CustomerCreditSchema$inboundSchema: z.ZodMiniType<CustomerCreditSchema, unknown>;
export declare function customerCreditSchemaFromJSON(jsonString: string): SafeParseResult<CustomerCreditSchema, SDKValidationError>;
/** @internal */
export declare const CustomerDisplay$inboundSchema: z.ZodMiniType<CustomerDisplay, unknown>;
export declare function customerDisplayFromJSON(jsonString: string): SafeParseResult<CustomerDisplay, SDKValidationError>;
/** @internal */
export declare const CustomerFeature$inboundSchema: z.ZodMiniType<CustomerFeature, unknown>;
export declare function customerFeatureFromJSON(jsonString: string): SafeParseResult<CustomerFeature, SDKValidationError>;
/** @internal */
export declare const Flags$inboundSchema: z.ZodMiniType<Flags, unknown>;
export declare function flagsFromJSON(jsonString: string): SafeParseResult<Flags, SDKValidationError>;
/** @internal */
export declare const Invoice$inboundSchema: z.ZodMiniType<Invoice, unknown>;
export declare function invoiceFromJSON(jsonString: string): SafeParseResult<Invoice, SDKValidationError>;
/** @internal */
export declare const EntityEnv$inboundSchema: z.ZodMiniType<EntityEnv, unknown>;
/** @internal */
export declare const Entity$inboundSchema: z.ZodMiniType<Entity, unknown>;
export declare function entityFromJSON(jsonString: string): SafeParseResult<Entity, SDKValidationError>;
/** @internal */
export declare const TrialsUsed$inboundSchema: z.ZodMiniType<TrialsUsed, unknown>;
export declare function trialsUsedFromJSON(jsonString: string): SafeParseResult<TrialsUsed, SDKValidationError>;
/** @internal */
export declare const RewardsType$inboundSchema: z.ZodMiniType<RewardsType, unknown>;
/** @internal */
export declare const CustomerDurationType$inboundSchema: z.ZodMiniType<CustomerDurationType, unknown>;
/** @internal */
export declare const Discount$inboundSchema: z.ZodMiniType<Discount, unknown>;
export declare function discountFromJSON(jsonString: string): SafeParseResult<Discount, SDKValidationError>;
/** @internal */
export declare const Rewards$inboundSchema: z.ZodMiniType<Rewards, unknown>;
export declare function rewardsFromJSON(jsonString: string): SafeParseResult<Rewards, SDKValidationError>;
/** @internal */
export declare const ReferralCustomer$inboundSchema: z.ZodMiniType<ReferralCustomer, unknown>;
export declare function referralCustomerFromJSON(jsonString: string): SafeParseResult<ReferralCustomer, SDKValidationError>;
/** @internal */
export declare const Referral$inboundSchema: z.ZodMiniType<Referral, unknown>;
export declare function referralFromJSON(jsonString: string): SafeParseResult<Referral, SDKValidationError>;
/** @internal */
export declare const Customer$inboundSchema: z.ZodMiniType<Customer, unknown>;
export declare function customerFromJSON(jsonString: string): SafeParseResult<Customer, SDKValidationError>;
