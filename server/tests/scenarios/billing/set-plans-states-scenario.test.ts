/** Customers left in each Stripe state set_plans must handle; run by hand from the dashboard. */

import { expect, test } from "bun:test";
import {
	cancelSubscriptionForResync,
	cancelSubscriptionMissingWebhook,
} from "@tests/integration/billing/set-plans/utils/resyncUtils";
import {
	findStripeSubscriptionByStatus,
	setupPausedPro,
} from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

const TRACKED_MESSAGES = 40;

const resyncProducts = () => ({
	free: products.base({
		id: "free",
		isDefault: true,
		items: [items.monthlyMessages({ includedUsage: 10 })],
	}),
	pro: products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	}),
});

test.concurrent(
	"scenario A: pro cancelled in Stripe 10 days in, webhook processed",
	async () => {
		const { free, pro } = resyncProducts();
		const { customerId, ctx } = await initScenario({
			customerId: "set-plans-scenario-resync",
			setup: [
				s.customer({ paymentMethod: "success", withDefault: true }),
				s.products({ list: [free, pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: TRACKED_MESSAGES,
					timeout: 2000,
				}),
				s.advanceTestClock({ days: 10 }),
			],
		});

		await cancelSubscriptionForResync({ ctx, customerId });
	},
);

test.concurrent(
	"scenario B: pro cancelled in Stripe, webhook missed so pro stays active",
	async () => {
		const { free, pro } = resyncProducts();
		const { customerId, ctx } = await initScenario({
			customerId: "set-plans-scenario-resync-missed-webhook",
			setup: [
				s.customer({ paymentMethod: "success", withDefault: true }),
				s.products({ list: [free, pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: TRACKED_MESSAGES,
					timeout: 2000,
				}),
				s.advanceTestClock({ days: 10 }),
			],
		});

		await cancelSubscriptionMissingWebhook({ ctx, customerId });
	},
);

test.concurrent(
	"scenario C: pro, add-on and prepaid cancelled in Stripe",
	async () => {
		const { free } = resyncProducts();
		const pro = products.pro({
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.prepaidMessages({ billingUnits: 100, price: 10 }),
			],
		});
		const addOn = products.recurringAddOn({
			items: [items.monthlyWords({ includedUsage: 50 })],
		});
		const { customerId, ctx } = await initScenario({
			customerId: "set-plans-scenario-resync-items",
			setup: [
				s.customer({ paymentMethod: "success", withDefault: true }),
				s.products({ list: [free, pro, addOn] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
				s.billing.attach({ productId: addOn.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: TRACKED_MESSAGES,
					timeout: 2000,
				}),
				s.advanceTestClock({ days: 10 }),
			],
		});

		await cancelSubscriptionForResync({ ctx, customerId });
	},
);

test.concurrent(
	"scenario D: annual pro cancelled in Stripe 3 months in",
	async () => {
		const { free } = resyncProducts();
		const proAnnual = products.proAnnual({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, ctx } = await initScenario({
			customerId: "set-plans-scenario-resync-annual",
			setup: [
				s.customer({ paymentMethod: "success", withDefault: true }),
				s.products({ list: [free, proAnnual] }),
			],
			actions: [
				s.billing.attach({ productId: proAnnual.id }),
				s.advanceTestClock({ months: 3 }),
			],
		});

		await cancelSubscriptionForResync({ ctx, customerId });
	},
);

const messagesPro = () =>
	products.pro({ items: [items.monthlyMessages({ includedUsage: 100 })] });

test.concurrent(
	"scenario E: incomplete subscription from a declined card",
	async () => {
		const pro = messagesPro();
		const { customerId, ctx } = await initScenario({
			customerId: "set-plans-scenario-incomplete",
			setup: [
				s.customer({ paymentMethod: "fail" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "incomplete",
		});
	},
);

test.concurrent("scenario F: incomplete_expired after 24 hours", async () => {
	const pro = messagesPro();
	const { customerId, ctx } = await initScenario({
		customerId: "set-plans-scenario-incomplete-expired",
		setup: [s.customer({ paymentMethod: "fail" }), s.products({ list: [pro] })],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ hours: 25 }),
		],
	});

	await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "incomplete_expired",
	});
});

test.concurrent(
	"scenario G: paused after a card-not-required trial",
	async () => {
		await setupPausedPro({ customerId: "set-plans-scenario-paused" });
	},
);

test.concurrent("scenario H: past_due after a failed renewal", async () => {
	const pro = messagesPro();
	const { customerId, ctx, testClockId } = await initScenario({
		customerId: "set-plans-scenario-past-due",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await driveProductPastDue({
		ctx,
		testClockId: testClockId!,
		customerId,
		productId: pro.id,
	});
	await findStripeSubscriptionByStatus({ ctx, customerId, status: "past_due" });
});

test.concurrent("scenario I: trialing with a card", async () => {
	const proTrial = products.proWithTrial({
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 14,
	});
	const { customerId, ctx } = await initScenario({
		customerId: "set-plans-scenario-trialing",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.billing.attach({ productId: proTrial.id })],
	});

	await findStripeSubscriptionByStatus({ ctx, customerId, status: "trialing" });
});

test.concurrent(
	"scenario J: pro cancelled at the end of the cycle",
	async () => {
		const pro = messagesPro();
		const { customerId, ctx } = await initScenario({
			customerId: "set-plans-scenario-cancel-at",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.cancel({ productId: pro.id }),
			],
		});

		const canceling = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});
		expect(canceling.cancel_at).not.toBeNull();
	},
);
