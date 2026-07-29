import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

/**
 * Mimics the dashboard "already cancelling → cancel immediately" flow.
 *
 * Repro for the UI gap: when a sub is already scheduled to cancel
 * (canceled_at set), the dashboard only exposes prorate/none refund
 * behavior, not a refund to payment method. This proves the BACKEND
 * already supports refund_last_payment on an already-cancelling sub —
 * so the limitation is purely the UI not rendering RefundBehaviorSection.
 */

const getLatestInvoice = ({ customer }: { customer: ApiCustomerV3 }) => {
	const invoice = customer.invoices?.[0];
	if (!invoice) {
		throw new Error("Expected customer to have an invoice");
	}
	return invoice;
};

test(`${chalk.yellowBright("cancel already-canceling: full refund to payment method works on backend")}`, async () => {
	const customerId = "cancel-already-canceling-refund";

	const pro = products.pro({ id: "pro", items: [] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			// Dashboard "Cancel Subscription" → end of cycle: sub becomes canceling.
			s.cancel({ productId: pro.id }),
		],
	});

	const customerWhileCanceling =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerWhileCanceling,
		productId: pro.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: customerWhileCanceling,
		count: 1,
		latestTotal: 20,
	});

	const initialInvoice = getLatestInvoice({ customer: customerWhileCanceling });

	// Dashboard "Manage Cancellation" → cancel immediately + refund to card.
	// This is what the UI does NOT currently expose for an already-canceling sub.
	const cancelImmediatelyParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
		refund_last_payment: "full" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(
		cancelImmediatelyParams,
	);
	expect(preview.total).toBe(0);
	expect(preview.refund).toEqual({
		amount: 20,
		invoice: {
			stripe_id: initialInvoice.stripe_id,
			total: 20,
			current_refunded_amount: 0,
			currency: initialInvoice.currency,
		},
	});

	await autumnV1.subscriptions.update(cancelImmediatelyParams);

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	const autumnInvoiceAfterCancel = await InvoiceService.getByStripeId({
		db: ctx.db,
		stripeId: initialInvoice.stripe_id,
	});
	expect(autumnInvoiceAfterCancel?.refunded_amount).toBe(20);
});
