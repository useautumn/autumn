/**
 * Mock Stripe client fixtures for unit testing.
 *
 * Provides configurable mock implementations of Stripe API methods
 * that can be used to test webhook handlers and other Stripe-dependent code.
 */

import type Stripe from "stripe";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface MockPaymentIntentsConfig {
	retrieveResult?: Partial<Stripe.PaymentIntent>;
	updateResult?: Partial<Stripe.PaymentIntent>;
	retrieveError?: Error;
	updateError?: Error;
}

interface MockInvoicesConfig {
	listResult?: Partial<Stripe.ApiList<Stripe.Invoice>>;
	voidInvoiceResult?: Partial<Stripe.Invoice>;
	listError?: Error;
	voidInvoiceError?: Error;
}

interface MockStripeClientConfig {
	paymentIntents?: MockPaymentIntentsConfig;
	invoices?: MockInvoicesConfig;
}

interface MockStripeClientCalls {
	paymentIntents: {
		retrieve: string[];
		update: { id: string; params: Stripe.PaymentIntentUpdateParams }[];
	};
	invoices: {
		list: Stripe.InvoiceListParams[];
		voidInvoice: string[];
	};
}

// ═══════════════════════════════════════════════════════════════════
// MOCK FACTORIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a mock Stripe client with configurable methods and call tracking.
 */
const createMockStripeClient = (config: MockStripeClientConfig = {}) => {
	const calls: MockStripeClientCalls = {
		paymentIntents: {
			retrieve: [],
			update: [],
		},
		invoices: {
			list: [],
			voidInvoice: [],
		},
	};

	const paymentIntentsConfig = config.paymentIntents ?? {};
	const invoicesConfig = config.invoices ?? {};

	return {
		paymentIntents: {
			retrieve: async (id: string) => {
				calls.paymentIntents.retrieve.push(id);
				if (paymentIntentsConfig.retrieveError)
					throw paymentIntentsConfig.retrieveError;
				return (paymentIntentsConfig.retrieveResult ?? {
					receipt_email: null,
				}) as Stripe.PaymentIntent;
			},
			update: async (id: string, params: Stripe.PaymentIntentUpdateParams) => {
				calls.paymentIntents.update.push({ id, params });
				if (paymentIntentsConfig.updateError)
					throw paymentIntentsConfig.updateError;
				return (paymentIntentsConfig.updateResult ??
					{}) as Stripe.PaymentIntent;
			},
		},
		invoices: {
			list: async (params: Stripe.InvoiceListParams) => {
				calls.invoices.list.push(params);
				if (invoicesConfig.listError) throw invoicesConfig.listError;
				return (invoicesConfig.listResult ?? {
					data: [],
				}) as Stripe.ApiList<Stripe.Invoice>;
			},
			voidInvoice: async (id: string) => {
				calls.invoices.voidInvoice.push(id);
				if (invoicesConfig.voidInvoiceError)
					throw invoicesConfig.voidInvoiceError;
				return (invoicesConfig.voidInvoiceResult ?? {}) as Stripe.Invoice;
			},
		},
		_calls: calls,
	};
};

// ═══════════════════════════════════════════════════════════════════
// INVOICE HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a mock Stripe invoice with configurable properties.
 */
const createMockInvoice = (
	overrides: Partial<Stripe.Invoice> = {},
): Stripe.Invoice =>
	({
		id: "inv_test",
		object: "invoice",
		status: "open",
		customer: "cus_test",
		subscription: "sub_test",
		...overrides,
	}) as Stripe.Invoice;

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const stripeClients = {
	createMockStripeClient,
	createMockInvoice,
} as const;
