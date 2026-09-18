import { describe, expect, test } from "bun:test";
import { convertToChargeAutomatically } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/tasks/convertToChargeAutomatically";

const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

const buildInvoicePaidContext = ({
	paymentIntentId = "pi_123",
	stripeSubscriptionId = "sub_123",
}: {
	paymentIntentId?: string | null;
	stripeSubscriptionId?: string | null;
} = {}) =>
	({
		stripeInvoice: {
			customer: "cus_123",
			payments: {
				data: paymentIntentId
					? [{ payment: { payment_intent: paymentIntentId } }]
					: [],
			},
		},
		stripeSubscriptionId,
	}) as never;

const buildCtx = ({
	convertEnabled = true,
	collectionMethod = "send_invoice",
	calls,
}: {
	convertEnabled?: boolean;
	collectionMethod?: string;
	calls: { attach: unknown[]; update: unknown[] };
}) =>
	({
		org: { config: { convert_to_charge_automatically: convertEnabled } },
		logger: noopLogger,
		stripeCli: {
			subscriptions: {
				retrieve: async () => ({ collection_method: collectionMethod }),
				update: async (id: string, params: unknown) => {
					calls.update.push({ id, params });
					return {};
				},
			},
			paymentIntents: {
				retrieve: async () => ({ payment_method: "pm_123" }),
			},
			paymentMethods: {
				retrieve: async () => ({ id: "pm_123" }),
				attach: async (id: string, params: unknown) => {
					calls.attach.push({ id, params });
					return { id };
				},
			},
		},
	}) as never;

describe("convertToChargeAutomatically", () => {
	test("converts and clears invoice-only payment method settings", async () => {
		const calls = { attach: [] as unknown[], update: [] as unknown[] };

		await convertToChargeAutomatically({
			ctx: buildCtx({ calls }),
			invoicePaidContext: buildInvoicePaidContext(),
		});

		expect(calls.attach).toEqual([
			{ id: "pm_123", params: { customer: "cus_123" } },
		]);
		// customer_balance in payment_settings is rejected by Stripe on
		// charge_automatically subs, so the update must unset it ("" = unset).
		expect(calls.update).toEqual([
			{
				id: "sub_123",
				params: {
					collection_method: "charge_automatically",
					default_payment_method: "pm_123",
					payment_settings: {
						payment_method_types: "",
						payment_method_options: { customer_balance: "" },
					},
				},
			},
		]);
	});

	test("does nothing when org config disables conversion", async () => {
		const calls = { attach: [] as unknown[], update: [] as unknown[] };

		await convertToChargeAutomatically({
			ctx: buildCtx({ convertEnabled: false, calls }),
			invoicePaidContext: buildInvoicePaidContext(),
		});

		expect(calls.attach).toEqual([]);
		expect(calls.update).toEqual([]);
	});

	test("does nothing when the subscription already charges automatically", async () => {
		const calls = { attach: [] as unknown[], update: [] as unknown[] };

		await convertToChargeAutomatically({
			ctx: buildCtx({ collectionMethod: "charge_automatically", calls }),
			invoicePaidContext: buildInvoicePaidContext(),
		});

		expect(calls.attach).toEqual([]);
		expect(calls.update).toEqual([]);
	});

	test("does nothing when the invoice was not paid via a payment intent", async () => {
		const calls = { attach: [] as unknown[], update: [] as unknown[] };

		await convertToChargeAutomatically({
			ctx: buildCtx({ calls }),
			invoicePaidContext: buildInvoicePaidContext({ paymentIntentId: null }),
		});

		expect(calls.attach).toEqual([]);
		expect(calls.update).toEqual([]);
	});

	test("does nothing when the invoice has no subscription", async () => {
		const calls = { attach: [] as unknown[], update: [] as unknown[] };

		await convertToChargeAutomatically({
			ctx: buildCtx({ calls }),
			invoicePaidContext: buildInvoicePaidContext({
				stripeSubscriptionId: null,
			}),
		});

		expect(calls.attach).toEqual([]);
		expect(calls.update).toEqual([]);
	});
});
