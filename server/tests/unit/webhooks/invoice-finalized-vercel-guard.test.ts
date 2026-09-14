/**
 * `invoice.finalized` only reaches org webhooks for regular invoices: Vercel
 * marketplace invoices settle out of band and must never emit it.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const storeCalls: Array<{ emitFinalizedWebhook?: boolean }> = [];
let nextContext: { isVercelInvoice: boolean } | null = null;

await mockModuleWithRestore(
	"@/external/stripe/webhookHandlers/handleStripeInvoiceFinalized/setupInvoiceFinalizedContext",
	() => ({
		setupInvoiceFinalizedContext: async () =>
			nextContext && {
				...nextContext,
				stripeInvoice: { id: "in_test" },
			},
	}),
);

await mockModuleWithRestore("@/internal/invoices/actions", () => ({
	invoiceActions: { updateFromStripe: async () => ({ id: "inv_test" }) },
}));

await mockModuleWithRestore("@/external/stripe/webhookHandlers/common", () => ({
	storeRenewalLineItems: async (params: { emitFinalizedWebhook?: boolean }) => {
		storeCalls.push({ emitFinalizedWebhook: params.emitFinalizedWebhook });
	},
}));

const { handleStripeInvoiceFinalized } = await import(
	"@/external/stripe/webhookHandlers/handleStripeInvoiceFinalized/handleStripeInvoiceFinalized"
);

const ctx = {
	logger: { info() {}, debug() {}, warn() {}, error() {} },
	fullCustomer: { id: "cus_test" },
} as never;
const event = {
	data: { object: { id: "in_test" } },
} as Stripe.InvoiceFinalizedEvent;

describe(chalk.yellowBright("invoice.finalized webhook guard"), () => {
	beforeEach(() => {
		storeCalls.length = 0;
	});

	test("regular invoice requests the webhook", async () => {
		nextContext = { isVercelInvoice: false };
		await handleStripeInvoiceFinalized({ ctx, event });
		expect(storeCalls).toEqual([{ emitFinalizedWebhook: true }]);
	});

	test("Vercel invoice never requests the webhook", async () => {
		nextContext = { isVercelInvoice: true };
		await handleStripeInvoiceFinalized({ ctx, event });
		expect(storeCalls).toEqual([{ emitFinalizedWebhook: false }]);
	});
});
