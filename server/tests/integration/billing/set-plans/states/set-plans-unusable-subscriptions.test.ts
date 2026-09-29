/** set_plans cancels an incomplete or paused subscription and moves its plans onto one new subscription, through Checkout when there is no card. */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
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
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { timeout } from "@/utils/genUtils";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";

const SESSION_LIST_ATTEMPTS = 10;
const SESSION_LIST_POLL_MS = 2_000;

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
			messageContains: [incomplete.id, "Stripe voids its first invoice"],
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

/** Stripe's session list can lag behind an expire, so poll until it settles. */
const expectCheckoutSessionStatuses = async ({
	ctx,
	stripeCustomerId,
	statuses,
}: {
	ctx: TestContext;
	stripeCustomerId: string;
	statuses: Stripe.Checkout.Session.Status[];
}) => {
	const listStatuses = async () => {
		const { data } = await ctx.stripeCli.checkout.sessions.list({
			customer: stripeCustomerId,
		});
		return data.map((session) => session.status).sort();
	};
	for (let attempt = 0; attempt < SESSION_LIST_ATTEMPTS; attempt++) {
		if (Bun.deepEquals(await listStatuses(), statuses)) return;
		await timeout(SESSION_LIST_POLL_MS);
	}
	expect(await listStatuses()).toEqual(statuses);
};

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
		await expectCheckoutSessionStatuses({
			ctx,
			stripeCustomerId: stripeCustomerId!,
			statuses: ["expired", "open"],
		});
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

/** A declined first payment leaves pro Pending on an incomplete subscription. */
const setupIncompletePro = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ paymentMethod: "fail" }), s.products({ list: [pro] })],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const incomplete = await findStripeSubscriptionByStatus({
		ctx: scenario.ctx,
		customerId,
		status: "incomplete",
	});
	return { ...scenario, pro, incomplete };
};

test.concurrent(
	`${chalk.yellowBright("set-plans unusable: an incomplete subscription replaced through Checkout leaves no Pending plans")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, pro, incomplete } =
			await setupIncompletePro({ customerId: "set-plans-incomplete-checkout" });
		const { data: paymentMethods } = await ctx.stripeCli.paymentMethods.list({
			customer: incomplete.customer as string,
		});
		for (const paymentMethod of paymentMethods) {
			await ctx.stripeCli.paymentMethods.detach(paymentMethod.id);
		}

		const response = await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		});
		expect(response.payment_url).toBeDefined();
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
			replacedSubscriptionId: incomplete.id,
			replacedStatus: "incomplete_expired",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans unusable: no_billing_changes keeps the incomplete subscription's Pending plans")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, pro, incomplete } =
			await setupIncompletePro({
				customerId: "set-plans-incomplete-no-billing",
			});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
			no_billing_changes: true,
		});

		expect(
			(await ctx.stripeCli.subscriptions.retrieve(incomplete.id)).status,
		).toBe("incomplete");
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const pendingRows = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: fullCustomer.internal_id,
			inStatuses: [CusProductStatus.Pending],
		});
		expect(pendingRows).toHaveLength(1);
	},
);
