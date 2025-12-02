import { z } from "zod/v4";
import type { AppEnv, BillingInterval, Organization } from "@autumn/shared";
import type { ProcessorType } from "@autumn/shared/models/genModels/genEnums.js";

/**
 * Payment Provider Interface
 * 
 * This interface defines the contract that all payment providers must implement.
 * It abstracts away provider-specific details and provides a unified API for
 * payment operations across different providers.
 */
export interface PaymentProvider {
	/**
	 * Get the provider type identifier
	 */
	getProviderType(): ProcessorType;

	/**
	 * Customer Operations
	 */
	customers: {
		create(params: CreateCustomerParams): Promise<Customer>;
		retrieve(customerId: string): Promise<Customer | null>;
		update(customerId: string, params: UpdateCustomerParams): Promise<Customer>;
		delete(customerId: string): Promise<void>;
		list(params?: ListCustomersParams): Promise<Customer[]>;
	};

	/**
	 * Product Operations
	 */
	products: {
		create(params: CreateProductParams): Promise<Product>;
		retrieve(productId: string): Promise<Product | null>;
		update(productId: string, params: UpdateProductParams): Promise<Product>;
		delete(productId: string): Promise<void>;
		list(params?: ListProductsParams): Promise<Product[]>;
	};

	/**
	 * Price Operations
	 */
	prices: {
		create(params: CreatePriceParams): Promise<Price>;
		retrieve(priceId: string): Promise<Price | null>;
		update(priceId: string, params: UpdatePriceParams): Promise<Price>;
	};

	/**
	 * Subscription Operations
	 */
	subscriptions: {
		create(params: CreateSubscriptionParams): Promise<Subscription>;
		retrieve(subscriptionId: string): Promise<Subscription | null>;
		update(subscriptionId: string, params: UpdateSubscriptionParams): Promise<Subscription>;
		cancel(subscriptionId: string, params?: CancelSubscriptionParams): Promise<Subscription>;
		deleteDiscount(subscriptionId: string, discountId: string): Promise<void>;
		migrate(subscriptionId: string, params: MigrateSubscriptionParams): Promise<Subscription>;
	};

	/**
	 * Subscription Schedule Operations (optional - may not be supported by all providers)
	 */
	subscriptionSchedules?: {
		create(params: CreateSubscriptionScheduleParams): Promise<SubscriptionSchedule>;
		retrieve(scheduleId: string): Promise<SubscriptionSchedule | null>;
		cancel(scheduleId: string): Promise<SubscriptionSchedule>;
	};

	/**
	 * Checkout Operations
	 */
	checkout: {
		createSession(params: CreateCheckoutSessionParams): Promise<CheckoutSession>;
	};

	/**
	 * Invoice Operations
	 */
	invoices: {
		create(params: CreateInvoiceParams): Promise<Invoice>;
		retrieve(invoiceId: string, options?: RetrieveInvoiceOptions): Promise<Invoice | null>;
		update(invoiceId: string, params: UpdateInvoiceParams): Promise<Invoice>;
		finalize(invoiceId: string, params?: FinalizeInvoiceParams): Promise<Invoice>;
		pay(invoiceId: string, params: PayInvoiceParams): Promise<Invoice>;
		void(invoiceId: string): Promise<Invoice>;
	};

	/**
	 * Payment Method Operations
	 */
	paymentMethods: {
		create(params: CreatePaymentMethodParams): Promise<PaymentMethod>;
		retrieve(paymentMethodId: string): Promise<PaymentMethod | null>;
		attach(paymentMethodId: string, customerId: string): Promise<PaymentMethod>;
		detach(paymentMethodId: string): Promise<PaymentMethod>;
		list(customerId: string): Promise<PaymentMethod[]>;
	};

	/**
	 * Coupon/Discount Operations
	 */
	coupons: {
		create(params: CreateCouponParams): Promise<Coupon>;
		delete(couponId: string): Promise<void>;
		retrieve(couponId: string): Promise<Coupon | null>;
	};

	/**
	 * Promotion Code Operations
	 */
	promotionCodes: {
		create(params: CreatePromotionCodeParams): Promise<PromotionCode>;
		retrieve(code: string): Promise<PromotionCode | null>;
	};

	/**
	 * Usage-Based Billing Operations (optional - may not be supported by all providers)
	 */
	billingMeters?: {
		create(params: CreateBillingMeterParams): Promise<BillingMeter>;
		retrieve(meterId: string): Promise<BillingMeter | null>;
		list(params?: ListBillingMetersParams): Promise<BillingMeter[]>;
		deactivate(meterId: string): Promise<void>;
		createEvent(params: CreateMeterEventParams): Promise<void>;
	};

	/**
	 * Webhook Operations
	 */
	webhooks: {
		verifySignature(payload: string | Buffer, signature: string, secret: string): Promise<WebhookEvent>;
	};
}

/**
 * Re-export ProcessorType from genEnums for convenience
 * The enum is defined in @autumn/shared/models/genModels/genEnums
 */
export { ProcessorType } from "@autumn/shared/models/genModels/genEnums.js";

/**
 * Type Definitions
 */

export interface Customer {
	id: string;
	email?: string | null;
	name?: string | null;
	metadata?: Record<string, string>;
	created: number;
	deleted?: boolean;
	[key: string]: unknown; // Allow provider-specific fields
}

export interface Product {
	id: string;
	name: string;
	active: boolean;
	metadata?: Record<string, string>;
	created: number;
	[key: string]: unknown;
}

export interface Price {
	id: string;
	product: string | Product;
	active: boolean;
	currency: string;
	unit_amount?: number | null;
	recurring?: {
		interval: BillingInterval;
		interval_count: number;
	};
	metadata?: Record<string, string>;
	created: number;
	[key: string]: unknown;
}

export interface Subscription {
	id: string;
	customer: string | Customer;
	status: SubscriptionStatus;
	items: SubscriptionItem[];
	current_period_start: number;
	current_period_end: number;
	billing_cycle_anchor?: number;
	cancel_at?: number | null;
	cancel_at_period_end: boolean;
	canceled_at?: number | null;
	collection_method: "charge_automatically" | "send_invoice";
	days_until_due?: number | null;
	default_payment_method?: string | null;
	metadata?: Record<string, string>;
	schedule?: string | null;
	trial_end?: number | null;
	trial_start?: number | null;
	created: number;
	[key: string]: unknown;
}

export type SubscriptionStatus =
	| "trialing"
	| "active"
	| "past_due"
	| "canceled"
	| "unpaid"
	| "incomplete"
	| "incomplete_expired"
	| "paused";

export interface SubscriptionItem {
	id: string;
	price: string | Price;
	quantity?: number | null;
	[key: string]: unknown;
}

export interface SubscriptionSchedule {
	id: string;
	subscription: string;
	status: "not_started" | "active" | "completed" | "released" | "canceled";
	phases: SubscriptionSchedulePhase[];
	[key: string]: unknown;
}

export interface SubscriptionSchedulePhase {
	items: SubscriptionSchedulePhaseItem[];
	start_date: number;
	end_date?: number;
	[key: string]: unknown;
}

export interface SubscriptionSchedulePhaseItem {
	price: string | Price;
	quantity?: number | null;
	[key: string]: unknown;
}

export interface CheckoutSession {
	id: string;
	url: string | null;
	customer?: string | Customer | null;
	mode: "payment" | "subscription" | "setup";
	payment_status?: "paid" | "unpaid" | "no_payment_required";
	subscription?: string | Subscription | null;
	metadata?: Record<string, string>;
	[key: string]: unknown;
}

export interface Invoice {
	id: string;
	customer: string | Customer;
	subscription?: string | Subscription | null;
	status: InvoiceStatus;
	amount_due: number;
	amount_paid: number;
	total: number;
	currency: string;
	hosted_invoice_url?: string | null;
	invoice_pdf?: string | null;
	description?: string | null;
	metadata?: Record<string, string>;
	discounts?: Discount[];
	created: number;
	[key: string]: unknown;
}

export type InvoiceStatus =
	| "draft"
	| "open"
	| "paid"
	| "uncollectible"
	| "void";

export interface Discount {
	id: string;
	coupon?: string | Coupon | null;
	[key: string]: unknown;
}

export interface PaymentMethod {
	id: string;
	type: string;
	customer?: string | Customer | null;
	[key: string]: unknown;
}

export interface Coupon {
	id: string;
	name?: string | null;
	duration: "once" | "repeating" | "forever";
	duration_in_months?: number | null;
	percent_off?: number | null;
	amount_off?: number | null;
	currency?: string | null;
	metadata?: Record<string, string>;
	[key: string]: unknown;
}

export interface PromotionCode {
	id: string;
	code: string;
	coupon: string | Coupon;
	active: boolean;
	[key: string]: unknown;
}

export interface BillingMeter {
	id: string;
	event_name: string;
	status: "active" | "inactive";
	[key: string]: unknown;
}

export interface WebhookEvent {
	id: string;
	type: string;
	data: {
		object: unknown;
		previous_attributes?: unknown;
	};
	created: number;
	[key: string]: unknown;
}

/**
 * Parameter Types
 */

export interface CreateCustomerParams {
	name?: string;
	email?: string;
	metadata?: Record<string, string>;
	testClockId?: string;
}

export interface UpdateCustomerParams {
	name?: string;
	email?: string;
	metadata?: Record<string, string>;
	invoice_settings?: {
		default_payment_method?: string;
	};
}

export interface ListCustomersParams {
	limit?: number;
	starting_after?: string;
}

export interface CreateProductParams {
	name: string;
	metadata?: Record<string, string>;
}

export interface UpdateProductParams {
	name?: string;
	active?: boolean;
	metadata?: Record<string, string>;
}

export interface ListProductsParams {
	limit?: number;
	active?: boolean;
}

export interface CreatePriceParams {
	product: string;
	currency: string;
	unit_amount?: number;
	recurring?: {
		interval: BillingInterval;
		interval_count?: number;
	};
	metadata?: Record<string, string>;
}

export interface UpdatePriceParams {
	active?: boolean;
	metadata?: Record<string, string>;
}

export interface CreateSubscriptionParams {
	customer: string;
	items: Array<{
		price: string;
		quantity?: number;
	}>;
	billing_cycle_anchor?: number;
	trial_end?: number;
	trial_settings?: {
		end_behavior?: {
			missing_payment_method?: "cancel" | "pause";
		};
	};
	payment_behavior?: "default_incomplete" | "error_if_incomplete";
	collection_method?: "charge_automatically" | "send_invoice";
	days_until_due?: number;
	default_payment_method?: string;
	metadata?: Record<string, string>;
	discounts?: Array<{ coupon: string }>;
	add_invoice_items?: Array<{
		price?: string;
		price_data?: {
			product: string;
			unit_amount: number;
			currency: string;
		};
		description?: string;
		quantity?: number;
	}>;
	expand?: string[];
}

export interface UpdateSubscriptionParams {
	items?: Array<{
		id?: string;
		price?: string;
		quantity?: number;
		deleted?: boolean;
	}>;
	proration_behavior?: "always_invoice" | "create_prorations" | "none";
	trial_end?: number;
	cancel_at?: number | null;
	collection_method?: "charge_automatically" | "send_invoice";
	days_until_due?: number;
	metadata?: Record<string, string>;
	expand?: string[];
}

export interface CancelSubscriptionParams {
	prorate?: boolean;
	cancellation_details?: {
		comment?: string;
	};
}

export interface MigrateSubscriptionParams {
	billing_mode: {
		type: "flexible";
	};
}

export interface CreateSubscriptionScheduleParams {
	subscription: string;
	phases: Array<{
		items: Array<{
			price: string;
			quantity?: number;
		}>;
		start_date: number;
		end_date?: number;
	}>;
	metadata?: Record<string, string>;
}

export interface CreateCheckoutSessionParams {
	customer?: string;
	mode: "payment" | "subscription" | "setup";
	line_items?: Array<{
		price?: string;
		price_data?: {
			product: string;
			unit_amount: number;
			currency: string;
			recurring?: {
				interval: BillingInterval;
				interval_count?: number;
			};
		};
		quantity?: number;
	}>;
	subscription_data?: {
		trial_end?: number;
		trial_settings?: {
			end_behavior?: {
				missing_payment_method?: "cancel";
			};
		};
		billing_cycle_anchor?: number;
	};
	success_url: string;
	currency?: string;
	allow_promotion_codes?: boolean;
	discounts?: Array<{ coupon: string }>;
	payment_method_types?: string[];
	payment_method_collection?: "always" | "if_required";
	metadata?: Record<string, string>;
	invoice_creation?: {
		enabled: boolean;
	};
	saved_payment_method_options?: {
		payment_method_save?: "enabled" | "disabled";
	};
}

export interface CreateInvoiceParams {
	customer: string;
	subscription?: string;
	auto_advance?: boolean;
	collection_method?: "charge_automatically" | "send_invoice";
	days_until_due?: number;
	metadata?: Record<string, string>;
}

export interface RetrieveInvoiceOptions {
	expand?: string[];
}

export interface UpdateInvoiceParams {
	description?: string;
	metadata?: Record<string, string>;
}

export interface FinalizeInvoiceParams {
	auto_advance?: boolean;
}

export interface PayInvoiceParams {
	payment_method?: string;
}

export interface CreatePaymentMethodParams {
	type: string;
	[key: string]: unknown;
}

export interface CreateCouponParams {
	id?: string;
	name?: string;
	duration: "once" | "repeating" | "forever";
	duration_in_months?: number;
	percent_off?: number;
	amount_off?: number;
	currency?: string;
	applies_to?: {
		products?: string[];
	};
	metadata?: Record<string, string>;
}

export interface CreatePromotionCodeParams {
	promotion: {
		type: "coupon";
		coupon: string;
	};
	code: string;
}

export interface CreateBillingMeterParams {
	event_name: string;
	display_name?: string;
	value_settings?: {
		event_payload_key: string;
	};
	[key: string]: unknown;
}

export interface ListBillingMetersParams {
	limit?: number;
	status?: "active" | "inactive";
	starting_after?: string;
}

export interface CreateMeterEventParams {
	event_name: string;
	payload: {
		stripe_customer_id?: string;
		value: string | number;
		[key: string]: unknown;
	};
	timestamp?: number;
}

/**
 * Payment Provider Error Types
 */
export class PaymentProviderError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly statusCode?: number,
		public readonly data?: unknown,
	) {
		super(message);
		this.name = "PaymentProviderError";
	}
}

export class PaymentProviderNotSupportedError extends PaymentProviderError {
	constructor(feature: string) {
		super(
			`Feature '${feature}' is not supported by this payment provider`,
			"FEATURE_NOT_SUPPORTED",
			400,
		);
		this.name = "PaymentProviderNotSupportedError";
	}
}

