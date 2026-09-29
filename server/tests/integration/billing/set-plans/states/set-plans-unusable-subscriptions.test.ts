/**
 * set_plans never updates a subscription Stripe won't collect on (incomplete, paused).
 * It cancels that subscription and puts the plans on one new subscription (Q1, Q11).
 * Unpaid invoices on the old subscription are left open (Q8).
 *
 * Red (before):  a second subscription was created beside the incomplete one, and the
 *                paused one was updated in place.
 * Green (after): the old subscription is cancelled and exactly one new one is live.
 *                Stripe reports a cancelled incomplete subscription as incomplete_expired.
 * Without a card the new subscription goes through Checkout, and the old one is
 * cancelled only once checkout completes (Q15). An open session for other plans is expired.
 */

import { expect, test } from "bun:test";
import {
	expectPreviewWarning,
	expectSubscriptionReplaced,
	findStripeSubscriptionByStatus,
	setupPausedPro,
} from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";

test.concurrent(
	`${chalk.yellowBright("set-plans unusable: incomplete subscription from a declined card is cancelled and replaced")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-incomplete-declined",
			setup: [
				s.customer({ paymentMethod: "fail" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.attachPaymentMethod({ type: "success" }),
			],
		});

		const incomplete = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "incomplete",
		});

		const setPlansParams = {
			customer_id: customerId,
			phases: [{ starts_at: "now" as const, plans: [{ plan_id: pro.id }] }],
		};
		expectPreviewWarning({
			preview: await autumnV2_4.billing.previewSetPlans(setPlansParams),
			type: "subscription_replaced",
			messageContains: [incomplete.id, "incomplete"],
		});
		await autumnV2_4.billing.setPlans(setPlansParams);

		await expectSubscriptionReplaced({
			ctx,
			customerId,
			productId: pro.id,
			replacedSubscriptionId: incomplete.id,
			replacedStatus: "incomplete_expired",
		});
		const { data: invoices } = await ctx.stripeCli.invoices.list({
			subscription: incomplete.id,
		});
		expect(invoices.map((invoice) => invoice.status)).toEqual(["void"]);
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans unusable: paused subscription is cancelled and replaced")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, pro, paused } = await setupPausedPro({
			customerId: "set-plans-paused",
		});
		await attachPaymentMethod({
			stripeCli: ctx.stripeCli,
			stripeCusId: paused.customer as string,
			type: "success",
		});

		const setPlansParams = {
			customer_id: customerId,
			phases: [{ starts_at: "now" as const, plans: [{ plan_id: pro.id }] }],
		};
		expectPreviewWarning({
			preview: await autumnV2_4.billing.previewSetPlans(setPlansParams),
			type: "subscription_replaced",
			messageContains: [paused.id, "paused"],
		});
		await autumnV2_4.billing.setPlans(setPlansParams);

		await expectSubscriptionReplaced({
			ctx,
			customerId,
			productId: pro.id,
			replacedSubscriptionId: paused.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans unusable: an open Checkout session is expired when the plans change")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-checkout-replaced",
			setup: [s.customer({}), s.products({ list: [pro, premium] })],
			actions: [],
		});

		const first = await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		});
		const second = await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: premium.id }] }],
		});
		expect(second.payment_url).toBeDefined();
		expect(second.payment_url).not.toBe(first.payment_url);

		const stripeCustomerId = (
			await CusService.getFull({ ctx, idOrInternalId: customerId })
		).processor?.id;
		const { data: sessions } = await ctx.stripeCli.checkout.sessions.list({
			customer: stripeCustomerId,
		});
		expect(sessions.map((session) => session.status).sort()).toEqual([
			"expired",
			"open",
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans unusable: a paused subscription replaced through Checkout is cancelled once checkout completes")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, pro, paused } = await setupPausedPro({
			customerId: "set-plans-paused-checkout",
		});

		const setPlansParams = {
			customer_id: customerId,
			phases: [{ starts_at: "now" as const, plans: [{ plan_id: pro.id }] }],
		};
		expectPreviewWarning({
			preview: await autumnV2_4.billing.previewSetPlans(setPlansParams),
			type: "subscription_replaced",
			messageContains: [paused.id, "once checkout completes"],
		});
		const response = await autumnV2_4.billing.setPlans(setPlansParams);
		expect(response.payment_url).toBeDefined();
		expect((await ctx.stripeCli.subscriptions.retrieve(paused.id)).status).toBe(
			"paused",
		);

		await completeStripeCheckoutFormV2({ url: response.payment_url! });

		await expectCustomerProducts({
			customerId,
			active: [pro.id],
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		});
		await expectSubscriptionReplaced({
			ctx,
			customerId,
			productId: pro.id,
			replacedSubscriptionId: paused.id,
		});
	},
);
