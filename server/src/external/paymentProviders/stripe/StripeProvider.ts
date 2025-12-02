import {
	BillingInterval,
	ErrCode,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import type {
	BillingMeter,
	CancelSubscriptionParams,
	CheckoutSession,
	Coupon,
	CreateBillingMeterParams,
	CreateCheckoutSessionParams,
	CreateCouponParams,
	CreateCustomerParams,
	CreateInvoiceParams,
	CreateMeterEventParams,
	CreatePaymentMethodParams,
	CreatePriceParams,
	CreateProductParams,
	CreatePromotionCodeParams,
	CreateSubscriptionParams,
	CreateSubscriptionScheduleParams,
	Customer,
	FinalizeInvoiceParams,
	Invoice,
	ListBillingMetersParams,
	ListCustomersParams,
	ListProductsParams,
	MigrateSubscriptionParams,
	PaymentMethod,
	PayInvoiceParams,
	Price,
	Product,
	PromotionCode,
	RetrieveInvoiceOptions,
	Subscription,
	SubscriptionSchedule,
	UpdateCustomerParams,
	UpdateInvoiceParams,
	UpdatePriceParams,
	UpdateProductParams,
	UpdateSubscriptionParams,
	WebhookEvent,
	type PaymentProvider,
	ProcessorType,
} from "@autumn/shared/utils/paymentProviders/types.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import Stripe from "stripe";
import type { AppEnv } from "@autumn/shared";

/**
 * Stripe implementation of the PaymentProvider interface
 * 
 * This wraps the Stripe SDK and provides a unified interface for payment operations.
 * It maintains backward compatibility with existing Stripe integrations.
 */
export class StripeProvider implements PaymentProvider {
	private stripeCli: Stripe;
	private org: Organization;
	private env: AppEnv;

	constructor({ org, env, legacyVersion }: { org: Organization; env: AppEnv; legacyVersion?: boolean }) {
		this.org = org;
		this.env = env;
		this.stripeCli = createStripeCli({ org, env, legacyVersion });
	}

	getProviderType(): ProcessorType {
		return ProcessorType.Stripe;
	}

	// Customer Operations
	customers = {
		create: async (params: CreateCustomerParams): Promise<Customer> => {
			const customer = await this.stripeCli.customers.create({
				name: params.name,
				email: params.email,
				metadata: params.metadata,
				test_clock: params.testClockId,
			});
			return this.mapStripeCustomer(customer);
		},

		retrieve: async (customerId: string): Promise<Customer | null> => {
			try {
				const customer = await this.stripeCli.customers.retrieve(customerId, {
					expand: ["test_clock", "invoice_settings.default_payment_method"],
				});
				if (customer.deleted) {
					return null;
				}
				return this.mapStripeCustomer(customer as Stripe.Customer);
			} catch (error: any) {
				if (error.code === "resource_missing") {
					return null;
				}
				throw error;
			}
		},

		update: async (customerId: string, params: UpdateCustomerParams): Promise<Customer> => {
			const customer = await this.stripeCli.customers.update(customerId, {
				name: params.name,
				email: params.email,
				metadata: params.metadata,
				invoice_settings: params.invoice_settings,
			});
			return this.mapStripeCustomer(customer);
		},

		delete: async (customerId: string): Promise<void> => {
			await this.stripeCli.customers.del(customerId);
		},

		list: async (params?: ListCustomersParams): Promise<Customer[]> => {
			const response = await this.stripeCli.customers.list({
				limit: params?.limit,
				starting_after: params?.starting_after,
			});
			return response.data.map((c) => this.mapStripeCustomer(c));
		},
	};

	// Product Operations
	products = {
		create: async (params: CreateProductParams): Promise<Product> => {
			const product = await this.stripeCli.products.create({
				name: params.name,
				metadata: params.metadata,
			});
			return this.mapStripeProduct(product);
		},

		retrieve: async (productId: string): Promise<Product | null> => {
			try {
				const product = await this.stripeCli.products.retrieve(productId);
				return this.mapStripeProduct(product);
			} catch (error: any) {
				if (error.code === "resource_missing") {
					return null;
				}
				throw error;
			}
		},

		update: async (productId: string, params: UpdateProductParams): Promise<Product> => {
			const product = await this.stripeCli.products.update(productId, {
				name: params.name,
				active: params.active,
				metadata: params.metadata,
			});
			return this.mapStripeProduct(product);
		},

		delete: async (productId: string): Promise<void> => {
			await this.stripeCli.products.del(productId);
		},

		list: async (params?: ListProductsParams): Promise<Product[]> => {
			const response = await this.stripeCli.products.list({
				limit: params?.limit,
				active: params?.active,
			});
			return response.data.map((p) => this.mapStripeProduct(p));
		},
	};

	// Price Operations
	prices = {
		create: async (params: CreatePriceParams): Promise<Price> => {
			const price = await this.stripeCli.prices.create({
				product: params.product,
				currency: params.currency,
				unit_amount: params.unit_amount,
				recurring: params.recurring
					? {
							interval: this.mapBillingIntervalToStripe(params.recurring.interval),
							interval_count: params.recurring.interval_count || 1,
						}
					: undefined,
				metadata: params.metadata,
			});
			return this.mapStripePrice(price);
		},

		retrieve: async (priceId: string): Promise<Price | null> => {
			try {
				const price = await this.stripeCli.prices.retrieve(priceId, {
					expand: ["product"],
				});
				return this.mapStripePrice(price);
			} catch (error: any) {
				if (error.code === "resource_missing") {
					return null;
				}
				throw error;
			}
		},

		update: async (priceId: string, params: UpdatePriceParams): Promise<Price> => {
			const price = await this.stripeCli.prices.update(priceId, {
				active: params.active,
				metadata: params.metadata,
			});
			return this.mapStripePrice(price);
		},
	};

	// Subscription Operations
	subscriptions = {
		create: async (params: CreateSubscriptionParams): Promise<Subscription> => {
			const subscription = await this.stripeCli.subscriptions.create({
				customer: params.customer,
				items: params.items.map((item) => ({
					price: item.price,
					quantity: item.quantity,
				})),
				billing_cycle_anchor: params.billing_cycle_anchor,
				trial_end: params.trial_end,
				trial_settings: params.trial_settings,
				payment_behavior: params.payment_behavior,
				collection_method: params.collection_method,
				days_until_due: params.days_until_due,
				default_payment_method: params.default_payment_method,
				metadata: params.metadata,
				discounts: params.discounts,
				add_invoice_items: params.add_invoice_items,
				expand: params.expand,
			});
			return this.mapStripeSubscription(subscription);
		},

		retrieve: async (subscriptionId: string): Promise<Subscription | null> => {
			try {
				const subscription = await this.stripeCli.subscriptions.retrieve(subscriptionId);
				return this.mapStripeSubscription(subscription);
			} catch (error: any) {
				if (error.code === "resource_missing") {
					return null;
				}
				throw error;
			}
		},

		update: async (
			subscriptionId: string,
			params: UpdateSubscriptionParams,
		): Promise<Subscription> => {
			const subscription = await this.stripeCli.subscriptions.update(subscriptionId, {
				items: params.items?.map((item) => ({
					id: item.id,
					price: item.price,
					quantity: item.quantity,
					deleted: item.deleted,
				})),
				proration_behavior: params.proration_behavior,
				trial_end: params.trial_end,
				cancel_at: params.cancel_at,
				collection_method: params.collection_method,
				days_until_due: params.days_until_due,
				metadata: params.metadata,
				expand: params.expand,
			});
			return this.mapStripeSubscription(subscription);
		},

		cancel: async (
			subscriptionId: string,
			params?: CancelSubscriptionParams,
		): Promise<Subscription> => {
			const subscription = await this.stripeCli.subscriptions.cancel(subscriptionId, {
				prorate: params?.prorate,
				cancellation_details: params?.cancellation_details,
			});
			return this.mapStripeSubscription(subscription);
		},

		deleteDiscount: async (subscriptionId: string, discountId: string): Promise<void> => {
			await this.stripeCli.subscriptions.deleteDiscount(subscriptionId);
		},

		migrate: async (
			subscriptionId: string,
			params: MigrateSubscriptionParams,
		): Promise<Subscription> => {
			const subscription = await this.stripeCli.subscriptions.migrate(subscriptionId, {
				billing_mode: params.billing_mode,
			});
			return this.mapStripeSubscription(subscription);
		},
	};

	// Subscription Schedule Operations
	subscriptionSchedules = {
		create: async (params: CreateSubscriptionScheduleParams): Promise<SubscriptionSchedule> => {
			const schedule = await this.stripeCli.subscriptionSchedules.create({
				subscription: params.subscription,
				phases: params.phases.map((phase) => ({
					items: phase.items.map((item) => ({
						price: item.price,
						quantity: item.quantity,
					})),
					start_date: phase.start_date,
					end_date: phase.end_date,
				})),
				metadata: params.metadata,
			});
			return this.mapStripeSubscriptionSchedule(schedule);
		},

		retrieve: async (scheduleId: string): Promise<SubscriptionSchedule | null> => {
			try {
				const schedule = await this.stripeCli.subscriptionSchedules.retrieve(scheduleId, {
					expand: ["phases.items.price"],
				});
				return this.mapStripeSubscriptionSchedule(schedule);
			} catch (error: any) {
				if (error.code === "resource_missing") {
					return null;
				}
				throw error;
			}
		},

		cancel: async (scheduleId: string): Promise<SubscriptionSchedule> => {
			const schedule = await this.stripeCli.subscriptionSchedules.cancel(scheduleId);
			return this.mapStripeSubscriptionSchedule(schedule);
		},
	};

	// Checkout Operations
	checkout = {
		createSession: async (params: CreateCheckoutSessionParams): Promise<CheckoutSession> => {
			const session = await this.stripeCli.checkout.sessions.create({
				customer: params.customer,
				mode: params.mode,
				line_items: params.line_items?.map((item) => ({
					price: item.price,
					price_data: item.price_data,
					quantity: item.quantity,
				})),
				subscription_data: params.subscription_data,
				success_url: params.success_url,
				currency: params.currency,
				allow_promotion_codes: params.allow_promotion_codes,
				discounts: params.discounts,
				payment_method_types: params.payment_method_types,
				payment_method_collection: params.payment_method_collection,
				metadata: params.metadata,
				invoice_creation: params.invoice_creation,
				saved_payment_method_options: params.saved_payment_method_options,
			});
			return this.mapStripeCheckoutSession(session);
		},
	};

	// Invoice Operations
	invoices = {
		create: async (params: CreateInvoiceParams): Promise<Invoice> => {
			const invoice = await this.stripeCli.invoices.create({
				customer: params.customer,
				subscription: params.subscription,
				auto_advance: params.auto_advance,
				collection_method: params.collection_method,
				days_until_due: params.days_until_due,
				metadata: params.metadata,
			});
			return this.mapStripeInvoice(invoice);
		},

		retrieve: async (
			invoiceId: string,
			options?: RetrieveInvoiceOptions,
		): Promise<Invoice | null> => {
			try {
				const invoice = await this.stripeCli.invoices.retrieve(invoiceId, {
					expand: options?.expand || ["discounts", "discounts.coupon"],
				});
				return this.mapStripeInvoice(invoice);
			} catch (error: any) {
				if (error.code === "resource_missing") {
					return null;
				}
				throw error;
			}
		},

		update: async (invoiceId: string, params: UpdateInvoiceParams): Promise<Invoice> => {
			const invoice = await this.stripeCli.invoices.update(invoiceId, {
				description: params.description,
				metadata: params.metadata,
			});
			return this.mapStripeInvoice(invoice);
		},

		finalize: async (
			invoiceId: string,
			params?: FinalizeInvoiceParams,
		): Promise<Invoice> => {
			const invoice = await this.stripeCli.invoices.finalizeInvoice(invoiceId, {
				auto_advance: params?.auto_advance,
			});
			return this.mapStripeInvoice(invoice);
		},

		pay: async (invoiceId: string, params: PayInvoiceParams): Promise<Invoice> => {
			const invoice = await this.stripeCli.invoices.pay(invoiceId, {
				payment_method: params.payment_method,
			});
			return this.mapStripeInvoice(invoice);
		},

		void: async (invoiceId: string): Promise<Invoice> => {
			const invoice = await this.stripeCli.invoices.voidInvoice(invoiceId);
			return this.mapStripeInvoice(invoice);
		},
	};

	// Payment Method Operations
	paymentMethods = {
		create: async (params: CreatePaymentMethodParams): Promise<PaymentMethod> => {
			const paymentMethod = await this.stripeCli.paymentMethods.create(params as any);
			return this.mapStripePaymentMethod(paymentMethod);
		},

		retrieve: async (paymentMethodId: string): Promise<PaymentMethod | null> => {
			try {
				const paymentMethod = await this.stripeCli.paymentMethods.retrieve(paymentMethodId);
				return this.mapStripePaymentMethod(paymentMethod);
			} catch (error: any) {
				if (error.code === "resource_missing") {
					return null;
				}
				throw error;
			}
		},

		attach: async (paymentMethodId: string, customerId: string): Promise<PaymentMethod> => {
			const paymentMethod = await this.stripeCli.paymentMethods.attach(paymentMethodId, {
				customer: customerId,
			});
			return this.mapStripePaymentMethod(paymentMethod);
		},

		detach: async (paymentMethodId: string): Promise<PaymentMethod> => {
			const paymentMethod = await this.stripeCli.paymentMethods.detach(paymentMethodId);
			return this.mapStripePaymentMethod(paymentMethod);
		},

		list: async (customerId: string): Promise<PaymentMethod[]> => {
			const response = await this.stripeCli.paymentMethods.list({
				customer: customerId,
			});
			return response.data.map((pm) => this.mapStripePaymentMethod(pm));
		},
	};

	// Coupon Operations
	coupons = {
		create: async (params: CreateCouponParams): Promise<Coupon> => {
			const coupon = await this.stripeCli.coupons.create({
				id: params.id,
				name: params.name,
				duration: params.duration,
				duration_in_months: params.duration_in_months,
				percent_off: params.percent_off,
				amount_off: params.amount_off,
				currency: params.currency,
				applies_to: params.applies_to,
				metadata: params.metadata,
			});
			return this.mapStripeCoupon(coupon);
		},

		delete: async (couponId: string): Promise<void> => {
			await this.stripeCli.coupons.del(couponId);
		},

		retrieve: async (couponId: string): Promise<Coupon | null> => {
			try {
				const coupon = await this.stripeCli.coupons.retrieve(couponId);
				return this.mapStripeCoupon(coupon);
			} catch (error: any) {
				if (error.code === "resource_missing") {
					return null;
				}
				throw error;
			}
		},
	};

	// Promotion Code Operations
	promotionCodes = {
		create: async (params: CreatePromotionCodeParams): Promise<PromotionCode> => {
			const promoCode = await this.stripeCli.promotionCodes.create({
				promotion: params.promotion,
				code: params.code,
			});
			return this.mapStripePromotionCode(promoCode);
		},

		retrieve: async (code: string): Promise<PromotionCode | null> => {
			try {
				const promoCode = await this.stripeCli.promotionCodes.retrieve(code);
				return this.mapStripePromotionCode(promoCode);
			} catch (error: any) {
				if (error.code === "resource_missing") {
					return null;
				}
				throw error;
			}
		},
	};

	// Usage-Based Billing Operations
	billingMeters = {
		create: async (params: CreateBillingMeterParams): Promise<BillingMeter> => {
			const meter = await this.stripeCli.billing.meters.create({
				event_name: params.event_name,
				display_name: params.display_name,
				value_settings: params.value_settings,
			} as any);
			return this.mapStripeBillingMeter(meter);
		},

		retrieve: async (meterId: string): Promise<BillingMeter | null> => {
			try {
				const meter = await this.stripeCli.billing.meters.retrieve(meterId);
				return this.mapStripeBillingMeter(meter);
			} catch (error: any) {
				if (error.code === "resource_missing") {
					return null;
				}
				throw error;
			}
		},

		list: async (params?: ListBillingMetersParams): Promise<BillingMeter[]> => {
			const response = await this.stripeCli.billing.meters.list({
				limit: params?.limit,
				status: params?.status as any,
				starting_after: params?.starting_after,
			});
			return response.data.map((m) => this.mapStripeBillingMeter(m));
		},

		deactivate: async (meterId: string): Promise<void> => {
			await this.stripeCli.billing.meters.deactivate(meterId);
		},

		createEvent: async (params: CreateMeterEventParams): Promise<void> => {
			await this.stripeCli.billing.meterEvents.create({
				event_name: params.event_name,
				payload: params.payload as any,
				timestamp: params.timestamp,
			});
		},
	};

	// Webhook Operations
	webhooks = {
		verifySignature: async (
			payload: string | Buffer,
			signature: string,
			secret: string,
		): Promise<WebhookEvent> => {
			const event = await Stripe.webhooks.constructEventAsync(
				payload,
				signature,
				secret,
			);
			return this.mapStripeWebhookEvent(event);
		},
	};

	/**
	 * Get the underlying Stripe client (for backward compatibility)
	 */
	getStripeClient(): Stripe {
		return this.stripeCli;
	}

	// Mapping functions to convert Stripe types to our abstract types
	private mapStripeCustomer(customer: Stripe.Customer): Customer {
		return {
			id: customer.id,
			email: customer.email,
			name: customer.name,
			metadata: customer.metadata as Record<string, string>,
			created: customer.created,
			deleted: customer.deleted || false,
			...customer, // Include all Stripe-specific fields
		};
	}

	private mapStripeProduct(product: Stripe.Product): Product {
		return {
			id: product.id,
			name: product.name,
			active: product.active,
			metadata: product.metadata as Record<string, string>,
			created: product.created,
			...product,
		};
	}

	private mapStripePrice(price: Stripe.Price): Price {
		return {
			id: price.id,
			product: typeof price.product === "string" ? price.product : price.product.id,
			active: price.active,
			currency: price.currency,
			unit_amount: price.unit_amount,
			recurring: price.recurring
				? {
						interval: this.mapStripeIntervalToBillingInterval(price.recurring.interval),
						interval_count: price.recurring.interval_count,
					}
				: undefined,
			metadata: price.metadata as Record<string, string>,
			created: price.created,
			...price,
		};
	}

	private mapStripeSubscription(subscription: Stripe.Subscription): Subscription {
		return {
			id: subscription.id,
			customer:
				typeof subscription.customer === "string"
					? subscription.customer
					: subscription.customer.id,
			status: subscription.status as Subscription["status"],
			items: subscription.items.data.map((item) => ({
				id: item.id,
				price: typeof item.price === "string" ? item.price : item.price.id,
				quantity: item.quantity,
				...item,
			})),
			current_period_start: subscription.current_period_start,
			current_period_end: subscription.current_period_end,
			billing_cycle_anchor: subscription.billing_cycle_anchor,
			cancel_at: subscription.cancel_at,
			cancel_at_period_end: subscription.cancel_at_period_end,
			canceled_at: subscription.canceled_at,
			collection_method: subscription.collection_method,
			days_until_due: subscription.days_until_due,
			default_payment_method:
				typeof subscription.default_payment_method === "string"
					? subscription.default_payment_method
					: subscription.default_payment_method?.id,
			metadata: subscription.metadata as Record<string, string>,
			schedule:
				typeof subscription.schedule === "string"
					? subscription.schedule
					: subscription.schedule?.id || null,
			trial_end: subscription.trial_end,
			trial_start: subscription.trial_start,
			created: subscription.created,
			...subscription,
		};
	}

	private mapStripeSubscriptionSchedule(
		schedule: Stripe.SubscriptionSchedule,
	): SubscriptionSchedule {
		return {
			id: schedule.id,
			subscription:
				typeof schedule.subscription === "string"
					? schedule.subscription
					: schedule.subscription.id,
			status: schedule.status,
			phases: schedule.phases.map((phase) => ({
				items: phase.items.map((item) => ({
					price: typeof item.price === "string" ? item.price : item.price.id,
					quantity: item.quantity,
					...item,
				})),
				start_date: phase.start_date,
				end_date: phase.end_date,
				...phase,
			})),
			...schedule,
		};
	}

	private mapStripeCheckoutSession(session: Stripe.Checkout.Session): CheckoutSession {
		return {
			id: session.id,
			url: session.url,
			customer:
				typeof session.customer === "string"
					? session.customer
					: session.customer?.id || null,
			mode: session.mode,
			payment_status: session.payment_status,
			subscription:
				typeof session.subscription === "string"
					? session.subscription
					: session.subscription?.id || null,
			metadata: session.metadata as Record<string, string>,
			...session,
		};
	}

	private mapStripeInvoice(invoice: Stripe.Invoice): Invoice {
		return {
			id: invoice.id!,
			customer:
				typeof invoice.customer === "string" ? invoice.customer : invoice.customer.id,
			subscription:
				typeof invoice.subscription === "string"
					? invoice.subscription
					: invoice.subscription?.id || null,
			status: invoice.status,
			amount_due: invoice.amount_due,
			amount_paid: invoice.amount_paid,
			total: invoice.total,
			currency: invoice.currency,
			hosted_invoice_url: invoice.hosted_invoice_url,
			invoice_pdf: invoice.invoice_pdf,
			description: invoice.description,
			metadata: invoice.metadata as Record<string, string>,
			discounts: invoice.discounts?.map((d) => ({
				id: typeof d === "string" ? d : d.id,
				coupon:
					typeof d === "string"
						? d
						: typeof d.coupon === "string"
							? d.coupon
							: d.coupon?.id || null,
				...(typeof d === "string" ? {} : d),
			})),
			created: invoice.created,
			...invoice,
		};
	}

	private mapStripePaymentMethod(pm: Stripe.PaymentMethod): PaymentMethod {
		return {
			id: pm.id,
			type: pm.type,
			customer:
				typeof pm.customer === "string" ? pm.customer : pm.customer?.id || null,
			...pm,
		};
	}

	private mapStripeCoupon(coupon: Stripe.Coupon): Coupon {
		return {
			id: coupon.id,
			name: coupon.name,
			duration: coupon.duration,
			duration_in_months: coupon.duration_in_months,
			percent_off: coupon.percent_off,
			amount_off: coupon.amount_off,
			currency: coupon.currency,
			metadata: coupon.metadata as Record<string, string>,
			...coupon,
		};
	}

	private mapStripePromotionCode(promoCode: Stripe.PromotionCode): PromotionCode {
		return {
			id: promoCode.id,
			code: promoCode.code,
			coupon:
				typeof promoCode.coupon === "string" ? promoCode.coupon : promoCode.coupon.id,
			active: promoCode.active,
			...promoCode,
		};
	}

	private mapStripeBillingMeter(meter: Stripe.Billing.Meter): BillingMeter {
		return {
			id: meter.id,
			event_name: meter.event_name,
			status: meter.status,
			...meter,
		};
	}

	private mapStripeWebhookEvent(event: Stripe.Event): WebhookEvent {
		return {
			id: event.id,
			type: event.type,
			data: {
				object: event.data.object,
				previous_attributes: event.data.previous_attributes,
			},
			created: event.created,
			...event,
		};
	}

	private mapBillingIntervalToStripe(interval: BillingInterval): Stripe.Price.Recurring.Interval {
		switch (interval) {
			case BillingInterval.Week:
				return "week";
			case BillingInterval.Month:
				return "month";
			case BillingInterval.Quarter:
				return "month"; // Stripe uses month with interval_count
			case BillingInterval.SemiAnnual:
				return "month";
			case BillingInterval.Year:
				return "year";
			default:
				return "month";
		}
	}

	private mapStripeIntervalToBillingInterval(
		interval: Stripe.Price.Recurring.Interval,
	): BillingInterval {
		switch (interval) {
			case "week":
				return BillingInterval.Week;
			case "month":
				return BillingInterval.Month;
			case "year":
				return BillingInterval.Year;
			default:
				return BillingInterval.Month;
		}
	}
}

