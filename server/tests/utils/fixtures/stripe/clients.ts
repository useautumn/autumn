/**
 * Mock Stripe client fixtures for unit testing.
 *
 * Provides configurable mock implementations of Stripe API methods
 * that can be used to test webhook handlers and other Stripe-dependent code.
 */

import type Stripe from "stripe";

/**
 * Create a mock Stripe client with configurable paymentIntents methods
 */
const createMockPaymentIntentsClient = ({
	retrieveResult = { receipt_email: null } as Partial<Stripe.PaymentIntent>,
	updateResult = {} as Partial<Stripe.PaymentIntent>,
	retrieveError,
	updateError,
}: {
	retrieveResult?: Partial<Stripe.PaymentIntent>;
	updateResult?: Partial<Stripe.PaymentIntent>;
	retrieveError?: Error;
	updateError?: Error;
} = {}) => {
	const retrieveCalls: string[] = [];
	const updateCalls: {
		id: string;
		params: Stripe.PaymentIntentUpdateParams;
	}[] = [];

	return {
		paymentIntents: {
			retrieve: async (id: string) => {
				retrieveCalls.push(id);
				if (retrieveError) throw retrieveError;
				return retrieveResult as Stripe.PaymentIntent;
			},
			update: async (id: string, params: Stripe.PaymentIntentUpdateParams) => {
				updateCalls.push({ id, params });
				if (updateError) throw updateError;
				return updateResult as Stripe.PaymentIntent;
			},
		},
		_calls: {
			retrieve: retrieveCalls,
			update: updateCalls,
		},
	};
};

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const stripeClients = {
	createMockPaymentIntentsClient,
} as const;
