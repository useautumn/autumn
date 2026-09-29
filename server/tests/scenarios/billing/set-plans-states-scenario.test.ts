/**
 * Customers left in each Stripe state set_plans must handle (PRD scenarios E–J).
 * Each setup stops once the customer is in the target state, so set_plans can be
 * run by hand from the dashboard.
 */

import { expect, test } from "bun:test";
import {
	findStripeSubscriptionByStatus,
	setupPausedPro,
} from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

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
