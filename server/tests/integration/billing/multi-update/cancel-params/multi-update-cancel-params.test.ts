/**
 * multiUpdate cancel params: refund_last_payment and cancellation_details.
 *
 * Contract:
 *   New types/fields:
 *     updates[].refund_last_payment: "prorated" | "full"
 *     updates[].cancellation_details: { reason?, details? }
 *   New behaviors:
 *     refund_last_payment on cancel_immediately refunds the last Stripe payment
 *     cancellation_details is forwarded to Stripe when the Stripe subscription
 *     is canceled immediately or scheduled to cancel at period end
 *   Side effects:
 *     Stripe refunds.refunded_amount / subscription.cancellation_details
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	MultiUpdateParamsV0Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { InvoiceService } from "@/internal/invoices/InvoiceService";

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
	`${chalk.yellowBright("multi update cancel params: cancellation_details on EOC")}`,
	async () => {
		const customerId = "mu-cancel-details-eoc";

		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV2_3 } = await initScenario({
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
					cancellation_details: {
						reason: "too_expensive",
						details: "Switching to a competitor",
					},
				},
			],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			canceling: [pro.id],
		});

		const { subscription } = await getStripeSubscription({ customerId });
		expect(subscription.cancellation_details?.feedback).toBe("too_expensive");
		expect(subscription.cancellation_details?.comment).toBe(
			"Switching to a competitor",
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("multi update cancel params: cancellation_details on immediate")}`,
	async () => {
		const customerId = "mu-cancel-details-imm";

		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV2_3 } = await initScenario({
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
					cancel_action: "cancel_immediately",
					cancellation_details: {
						reason: "unused",
						details: "No longer needed",
					},
				},
			],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer,
			notPresent: [pro.id],
		});

		const { subscription } = await getStripeSubscription({ customerId });
		expect(subscription.status).toBe("canceled");
		expect(subscription.cancellation_details?.feedback).toBe("unused");
		expect(subscription.cancellation_details?.comment).toBe("No longer needed");
	},
);
