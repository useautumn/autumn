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
	retrieveResult?: Partial<Stripe.Invoice>;
	voidInvoiceResult?: Partial<Stripe.Invoice>;
	listError?: Error;
	retrieveError?: Error;
	voidInvoiceError?: Error;
}

interface MockCustomersConfig {
	retrieveResult?: Partial<Stripe.Customer> | Stripe.DeletedCustomer;
	retrieveError?: Error;
}

interface MockStripeClientConfig {
	paymentIntents?: MockPaymentIntentsConfig;
	invoices?: MockInvoicesConfig;
	customers?: MockCustomersConfig;
}

interface MockStripeClientCalls {
	paymentIntents: {
		retrieve: string[];
		update: { id: string; params: Stripe.PaymentIntentUpdateParams }[];
	};
	invoices: {
		list: Stripe.InvoiceListParams[];
		retrieve: string[];
		voidInvoice: string[];
	};
	customers: {
		retrieve: string[];
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
			retrieve: [],
			voidInvoice: [],
		},
		customers: {
			retrieve: [],
		},
	};

	const paymentIntentsConfig = config.paymentIntents ?? {};
	const invoicesConfig = config.invoices ?? {};
	const customersConfig = config.customers ?? {};

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
			retrieve: async (id: string, _params?: Stripe.InvoiceRetrieveParams) => {
				calls.invoices.retrieve.push(id);
				if (invoicesConfig.retrieveError) throw invoicesConfig.retrieveError;
				return (invoicesConfig.retrieveResult ?? {
					id: "inv_mock",
					payments: {
						data: [
							{
								payment: {
									payment_intent: { id: "pi_mock" },
								},
							},
						],
					},
				}) as Stripe.Invoice;
			},
			voidInvoice: async (id: string) => {
				calls.invoices.voidInvoice.push(id);
				if (invoicesConfig.voidInvoiceError)
					throw invoicesConfig.voidInvoiceError;
				return (invoicesConfig.voidInvoiceResult ?? {}) as Stripe.Invoice;
			},
		},
		customers: {
			retrieve: async (id: string) => {
				calls.customers.retrieve.push(id);
				if (customersConfig.retrieveError) throw customersConfig.retrieveError;
				return (customersConfig.retrieveResult ?? {
					id: "cus_mock",
					email: "mock@example.com",
					deleted: false,
				}) as Stripe.Customer | Stripe.DeletedCustomer;
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
