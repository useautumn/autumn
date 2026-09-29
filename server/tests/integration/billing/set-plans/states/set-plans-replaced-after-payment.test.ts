/**
 * When the new subscription's first payment needs authentication, set_plans defers
 * and finishes once the invoice is paid. The resume must also retire the Pending
 * rows left on the replaced incomplete subscription.
 *
 * Red (before):  the old subscription was cancelled on resume but its Pending row stayed.
 * Green (after): the old subscription is cancelled and no Pending rows remain.
 */

import { expect, test } from "bun:test";
import {
	expectSubscriptionReplaced,
	findStripeSubscriptionByStatus,
} from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const SUCCESS_PAYMENT_METHOD = "pm_card_visa";

/** Pays the first invoice of the incomplete subscription that isn't the replaced one. */
const payNewSubscriptionInvoice = async ({
	ctx,
	replacedSubscriptionId,
}: {
	ctx: TestContext;
	replacedSubscriptionId: string;
}) => {
	const replaced = await ctx.stripeCli.subscriptions.retrieve(
		replacedSubscriptionId,
	);
	const stripeCustomerId = replaced.customer as string;
	const { data } = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "incomplete",
	});
	const newSubscription = data.find(
		(subscription) => subscription.id !== replacedSubscriptionId,
	);
	const invoiceId = newSubscription?.latest_invoice;
	if (typeof invoiceId !== "string") {
		throw new Error("No first invoice on the new subscription");
	}

	const paymentMethod = await ctx.stripeCli.paymentMethods.attach(
		SUCCESS_PAYMENT_METHOD,
		{ customer: stripeCustomerId },
	);
	await ctx.stripeCli.invoices.pay(invoiceId, {
		payment_method: paymentMethod.id,
	});
};

test.concurrent(
	`${chalk.yellowBright("set-plans replaced after payment: a deferred replacement retires the old Pending rows on resume")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-replaced-3ds",
			setup: [
				s.customer({ paymentMethod: "fail" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.attachPaymentMethod({ type: "authenticate" }),
			],
		});
		const incomplete = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "incomplete",
		});

		const response = await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		});
		expect(response.required_action).toBeDefined();

		await payNewSubscriptionInvoice({
			ctx,
			replacedSubscriptionId: incomplete.id,
		});
		await expectCustomerProducts({
			customerId,
			active: [pro.id],
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		});

		await expectSubscriptionReplaced({
			ctx,
			customerId,
			productId: pro.id,
			replacedSubscriptionId: incomplete.id,
			replacedStatus: "incomplete_expired",
		});
	},
);
