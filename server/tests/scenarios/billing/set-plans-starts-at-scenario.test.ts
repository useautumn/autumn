/** Customers in each state set_plans' phases[0].starts_at handles, for hand QA of future starts, early access and backdates. */

import { test } from "bun:test";
import { ms } from "@autumn/shared";
import { initLiveProScenario } from "@tests/integration/billing/set-plans/starts-at/backdate-live/utils/backdateLiveUtils";
import { startsAtProducts } from "@tests/integration/billing/set-plans/starts-at/utils/futureStartUtils";
import { findStripeSubscriptionByStatus } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

const AGED_DAYS = 10;
const NEXT_PHASE_DAYS = 30;
const COUPON_PERCENT_OFF = 20;
const COUPON_MONTHS = 3;

test.concurrent(
	"QA SA1: nothing live, card on file — future start, early access, free-only and trial rejections",
	async () => {
		const plans = startsAtProducts();
		await initScenario({
			customerId: "qa-sa-nothing-live",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [
						...Object.values(plans),
						products.base({
							id: "free-only",
							items: [items.monthlyWords({ includedUsage: 10 })],
						}),
						products.proWithTrial({
							id: "pro-trial",
							items: [items.monthlyMessages({ includedUsage: 100 })],
							trialDays: 14,
						}),
					],
				}),
			],
			actions: [],
		});
	},
);

test.concurrent(
	"QA SA2: nothing live, no card — a future start collects by invoice",
	async () => {
		const plans = startsAtProducts();
		await initScenario({
			customerId: "qa-sa-no-card",
			setup: [s.customer({}), s.products({ list: Object.values(plans) })],
			actions: [],
		});
	},
);

test.concurrent(
	"QA SA3: live pro aged 10 days — backdate (start only, or with a plan change) and future start ending pro now",
	async () => {
		await initLiveProScenario({
			customerId: "qa-sa-live-pro",
			advanceDays: AGED_DAYS,
		});
	},
);

test.concurrent(
	"QA SA4: pro on two entities sharing one subscription — scope, kept subscription and out-of-scope rejection",
	async () => {
		await initLiveProScenario({
			customerId: "qa-sa-live-entities",
			entityCount: 2,
			advanceDays: AGED_DAYS,
		});
	},
);

test.concurrent(
	"QA SA5: live pro with a repeating coupon — a backdate carries only its remaining cycles",
	async () => {
		const { ctx, customerId } = await initLiveProScenario({
			customerId: "qa-sa-live-coupon",
		});
		const subscription = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});
		const coupon = await ctx.stripeCli.coupons.create({
			percent_off: COUPON_PERCENT_OFF,
			duration: "repeating",
			duration_in_months: COUPON_MONTHS,
		});
		await ctx.stripeCli.subscriptions.update(subscription.id, {
			discounts: [{ coupon: coupon.id }],
		});
	},
);

test.concurrent(
	"QA SA6: live pro with a saved later phase — a backdate is rejected, a future start replaces the schedule",
	async () => {
		const { pro, premium } = startsAtProducts();
		const { autumnV2_4, customerId } = await initScenario({
			customerId: "qa-sa-live-schedule",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});
		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: pro.id }] },
				{
					starts_at: Date.now() + ms.days(NEXT_PHASE_DAYS),
					plans: [{ plan_id: premium.id }],
				},
			],
		});
	},
);

test.concurrent(
	"QA SA7: trialing pro — a backdate and a future start are both rejected",
	async () => {
		const proTrial = products.proWithTrial({
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
		});
		await initScenario({
			customerId: "qa-sa-trialing",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial, ...Object.values(startsAtProducts())] }),
			],
			actions: [s.billing.attach({ productId: proTrial.id })],
		});
	},
);

test.concurrent(
	"QA SA8: past_due pro — a backdate recreates it and leaves the open invoice open",
	async () => {
		const { ctx, customerId, testClockId, pro } = await initLiveProScenario({
			customerId: "qa-sa-past-due",
		});
		await driveProductPastDue({
			ctx,
			testClockId: testClockId!,
			customerId,
			productId: pro.id,
		});
	},
);
