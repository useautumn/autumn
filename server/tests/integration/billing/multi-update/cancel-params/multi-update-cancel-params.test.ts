/**
 * multiUpdate cancel params: refund_last_payment.
 *
 * Contract:
 *   New types/fields:
 *     updates[].refund_last_payment: "prorated" | "full"
 *   New behaviors:
 *     refund_last_payment on cancel_immediately refunds the last Stripe payment
 *   Side effects:
 *     Stripe refunds.refunded_amount
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	MultiUpdateParamsV0Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductNotPresent } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
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
