/**
 * multiUpdate cancel params: refund_last_payment + subscription_params.
 *
 * Contract:
 *   New types/fields:
 *     updates[].refund_last_payment: "prorated" | "full"
 *     updates[].subscription_params.cancellation_details.{feedback,comment}
 *   New behaviors:
 *     refund_last_payment on cancel_immediately refunds the last Stripe payment
 *     cancellation_details reach Stripe on cancel_immediately (subscriptions.cancel)
 *     cancellation_details reach Stripe on cancel_end_of_cycle (subscriptions.update)
 *   Side effects:
 *     Stripe refunds.refunded_amount
 *     Stripe subscription.cancellation_details
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, MultiUpdateParamsV0Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeCancellationDetailsCorrect } from "@tests/integration/billing/utils/expectStripeCancellationDetailsCorrect";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

const stripeCancellationDetails = {
	feedback: "too_expensive" as const,
	comment: "Switching to a competitor",
};

test.concurrent(
	`${chalk.yellowBright("multi update cancel params: refund_last_payment full")}`,
	async () => {
		const customerId = "mu-cancel-refund-full";

		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 20,
		});

		const initialInvoice = customerAfterAttach.invoices?.[0];
		if (!initialInvoice?.stripe_id) {
			throw new Error("Expected an attach invoice");
		}

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{
					plan_id: pro.id,
					cancel_action: "cancel_immediately",
					refund_last_payment: "full",
				},
			],
		});

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductNotPresent({
			customer: customerAfterCancel,
			productId: pro.id,
		});
		await expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 1,
		});

		const autumnInvoice = await InvoiceService.getByStripeId({
			db: ctx.db,
			stripeId: initialInvoice.stripe_id,
		});
		expect(autumnInvoice?.refunded_amount).toBe(20);

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update cancel params: cancellation_details on cancel_immediately")}`,
	async () => {
		const customerId = "mu-cancel-details-now";
		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const { subscription } = await getStripeSubscription({ customerId });

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{
					plan_id: pro.id,
					cancel_action: "cancel_immediately",
					subscription_params: {
						cancellation_details: stripeCancellationDetails,
					},
				},
			],
		});

		await expectStripeCancellationDetailsCorrect({
			ctx,
			customerId,
			subscriptionId: subscription.id,
			feedback: stripeCancellationDetails.feedback,
			comment: stripeCancellationDetails.comment,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update cancel params: cancellation_details on cancel_end_of_cycle")}`,
	async () => {
		const customerId = "mu-cancel-details-eoc";
		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{
					plan_id: pro.id,
					cancel_action: "cancel_end_of_cycle",
					subscription_params: {
						cancellation_details: stripeCancellationDetails,
					},
				},
			],
		});

		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		await expectStripeCancellationDetailsCorrect({
			ctx,
			customerId,
			feedback: stripeCancellationDetails.feedback,
			comment: stripeCancellationDetails.comment,
		});
	},
);
