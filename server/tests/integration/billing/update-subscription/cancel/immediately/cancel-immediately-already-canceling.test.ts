/**
 * Cancel Immediately — Already-Canceling Subscription
 *
 * Mirrors the dashboard "Manage Cancellation → Cancel immediately" flow for a
 * sub that is already scheduled to cancel at end of cycle. The UI now exposes
 * the full refund options here (invoice credits / refund to payment method /
 * no refund), with the refund-to-card variant constrained to prorated.
 *
 * These tests verify each option works end-to-end on an already-canceling sub:
 *  - credits  → cancel_immediately + billing_behavior "prorate_immediately"
 *  - refund   → cancel_immediately + refund_last_payment "prorated"
 *  - none     → cancel_immediately + billing_behavior "none"
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

const getLatestInvoice = ({ customer }: { customer: ApiCustomerV3 }) => {
	const invoice = customer.invoices?.[0];
	if (!invoice) {
		throw new Error("Expected customer to have an invoice");
	}
	return invoice;
};

const getAutumnInvoiceByStripeId = async ({
	db,
	stripeInvoiceId,
}: {
	db: Parameters<typeof InvoiceService.getByStripeId>[0]["db"];
	stripeInvoiceId: string;
}) => {
	const invoice = await InvoiceService.getByStripeId({
		db,
		stripeId: stripeInvoiceId,
	});
	if (!invoice) {
		throw new Error(`Expected Autumn invoice for ${stripeInvoiceId}`);
	}
	return invoice;
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Already-canceling → cancel immediately with invoice credits (prorated)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("already-canceling cancel immediately: invoice credits (prorated)")}`,
	async () => {
		const customerId = "cancel-already-canceling-credits";

		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV0, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.cancel({ productId: pro.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const customerWhileCanceling =
			await autumnV0.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerWhileCanceling,
			productId: pro.id,
		});

		const cancelParams = {
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately" as const,
			billing_behavior: "prorate_immediately" as const,
		};

		const preview = await autumnV0.subscriptions.previewUpdate(cancelParams);
		// Prorated mid-cycle credit for the unused portion of $20 base.
		expect(preview.total).toBeLessThan(0);

		await autumnV0.subscriptions.update(cancelParams);

		const customerAfterCancel =
			await autumnV0.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotPresent({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		// Credit lands as a new invoice line item; latest invoice matches preview.
		expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 2,
			latestTotal: preview.total,
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Already-canceling → cancel immediately with prorated refund to card
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("already-canceling cancel immediately: prorated refund to payment method")}`,
	async () => {
		const customerId = "cancel-already-canceling-refund";

		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV0, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.cancel({ productId: pro.id }),
			],
		});

		const customerWhileCanceling =
			await autumnV0.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerWhileCanceling,
			productId: pro.id,
		});
		expectCustomerInvoiceCorrect({
			customer: customerWhileCanceling,
			count: 1,
			latestTotal: 20,
		});

		const initialInvoice = getLatestInvoice({
			customer: customerWhileCanceling,
		});

		const cancelParams = {
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately" as const,
			refund_last_payment: "prorated" as const,
		};

		const preview = await autumnV0.subscriptions.previewUpdate(cancelParams);
		expect(preview.total).toBe(0);
		// Start of cycle → prorated refund is effectively the full $20.
		expect(preview.refund).toEqual({
			amount: 20,
			invoice: {
				stripe_id: initialInvoice.stripe_id,
				total: 20,
				current_refunded_amount: 0,
				currency: initialInvoice.currency,
			},
		});

		await autumnV0.subscriptions.update(cancelParams);

		const customerAfterCancel =
			await autumnV0.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotPresent({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		const autumnInvoiceAfterCancel = await getAutumnInvoiceByStripeId({
			db: ctx.db,
			stripeInvoiceId: initialInvoice.stripe_id,
		});
		expect(autumnInvoiceAfterCancel.refunded_amount).toBe(20);

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Already-canceling → cancel immediately with no refund
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("already-canceling cancel immediately: no refund")}`,
	async () => {
		const customerId = "cancel-already-canceling-none";

		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV0, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.cancel({ productId: pro.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const customerWhileCanceling =
			await autumnV0.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerWhileCanceling,
			productId: pro.id,
		});

		const initialInvoice = getLatestInvoice({
			customer: customerWhileCanceling,
		});

		const cancelParams = {
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately" as const,
			billing_behavior: "none" as const,
		};

		const preview = await autumnV0.subscriptions.previewUpdate(cancelParams);
		// No charges or credits issued.
		expect(preview.total).toBe(0);
		expect(preview.refund).toBeUndefined();

		await autumnV0.subscriptions.update(cancelParams);

		const customerAfterCancel =
			await autumnV0.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotPresent({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		// No new invoice, no refund against the original.
		expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 1,
		});
		const autumnInvoiceAfterCancel = await getAutumnInvoiceByStripeId({
			db: ctx.db,
			stripeInvoiceId: initialInvoice.stripe_id,
		});
		expect(autumnInvoiceAfterCancel.refunded_amount ?? 0).toBe(0);

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
