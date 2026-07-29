/**
 * TDD tests for the multiUpdate preview response schema.
 *
 * Contract under test:
 *   New types:
 *     - MultiUpdatePreviewResponseV0: { customer_id, currency, total,
 *       subscriptions: ({ plan_ids } & core billing preview)[] } — one core
 *       preview per Stripe subscription group, composed from the SAME builders
 *       as single-update previews (no redefined preview math)
 *   Changed endpoint:
 *     - POST /billing.preview_multi_update -> MultiUpdatePreviewResponseV0
 *   Exact-value behaviors:
 *     - Each group's next_cycle.starts_at is anchored to THAT subscription's own
 *       billing anchor (two subs created 5 days apart -> anchors ~5 days apart)
 *     - Each group's next_cycle.total covers ONLY that subscription's surviving
 *       renewals (no cross-sub leakage)
 *     - top-level total = sum of subscriptions[].total
 *
 * Pre-impl red: response has no `subscriptions` array (old single-context shape).
 * Post-impl green: per-group composition over the sub-scoped plans.
 */

import { expect, test } from "bun:test";
import type { MultiUpdateParamsV0Input } from "@autumn/shared";
import { expectMultiUpdatePreviewCorrect } from "@tests/integration/billing/multi-update/utils/expectMultiUpdatePreviewCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";

const DAY_MS = 24 * 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Two subs with DIFFERENT anchors — per-sub next_cycle is exactly scoped
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Sub 1 at T0: Pro A ($20, group a) + Premium B ($50, group b)
 * - Advance test clock 5 days
 * - Sub 2 at T0+5d (new_billing_subscription): add-on X ($20) + add-on Y ($50)
 * - Preview ONE multiUpdate: cancel Premium B EOC + cancel add-on Y EOC
 *
 * Expected Result:
 * - total EXACTLY 0 (EOC cancels charge nothing today)
 * - Sub 1 group: plan_ids [premiumB], next_cycle { starts_at ~ T0+1mo, total 20 }
 *   (Pro A's renewal ONLY — not add-on X's)
 * - Sub 2 group: plan_ids [addonY], next_cycle { starts_at ~ T0+5d+1mo, total 20 }
 *   (add-on X's renewal ONLY — not Pro A's)
 * - The two starts_at differ by ~5 days
 */
test.concurrent(
	`${chalk.yellowBright("multi update preview: per-sub next_cycle anchors and totals")}`,
	async () => {
		const customerId = "multi-update-preview-anchors";
		const testStartMs = Date.now();

		const proA = products.pro({
			id: "pro-a",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_a`,
		});
		const premiumB = products.base({
			id: "premium-b",
			items: [items.monthlyPrice({ price: 50 }), items.dashboard()],
			group: `${customerId}_b`,
		});
		const addonX = products.recurringAddOn({
			id: "addon-x",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addonY = products.base({
			id: "addon-y",
			items: [
				items.monthlyPrice({ price: 50 }),
				items.monthlyUsers({ includedUsage: 5 }),
			],
			isAddOn: true,
		});

		const { autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proA, premiumB, addonX, addonY] }),
			],
			actions: [
				s.attach({ productId: proA.id }),
				s.attach({ productId: premiumB.id }),
			],
		});

		// Sub 2 gets its own anchor, 5 days after sub 1's
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfDays: 5,
			waitForSeconds: 30,
		});
		await autumnV2_3.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: addonX.id }, { plan_id: addonY.id }],
			new_billing_subscription: true,
		});

		const multiUpdateParams: MultiUpdateParamsV0Input = {
			customer_id: customerId,
			updates: [
				{ plan_id: premiumB.id, cancel_action: "cancel_end_of_cycle" },
				{ plan_id: addonY.id, cancel_action: "cancel_end_of_cycle" },
			],
		};

		const sub1NextCycleStartsAt = addMonths(testStartMs, 1).getTime();
		const sub2NextCycleStartsAt = addMonths(
			addDays(testStartMs, 5),
			1,
		).getTime();

		const preview = await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: multiUpdateParams,
			total: 0,
			subscriptions: [
				{
					planIds: [premiumB.id],
					total: 0,
					nextCycleTotal: 20,
					nextCycleStartsAt: sub1NextCycleStartsAt,
				},
				{
					planIds: [addonY.id],
					total: 0,
					nextCycleTotal: 20,
					nextCycleStartsAt: sub2NextCycleStartsAt,
				},
			],
		});

		// ── Contract: the two groups renew on their OWN anchors, ~5 days apart ───
		const [first, second] = [...preview.subscriptions].sort(
			(a, b) => (a.next_cycle?.starts_at ?? 0) - (b.next_cycle?.starts_at ?? 0),
		);
		const anchorGapMs =
			(second.next_cycle?.starts_at ?? 0) - (first.next_cycle?.starts_at ?? 0);
		expect(anchorGapMs).toBeWithin(
			5 * DAY_MS - 10 * 60 * 1000,
			5 * DAY_MS + 10 * 60 * 1000,
		);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cross-sub immediate cancels — per-sub totals match per-sub invoices
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20) on sub 1; add-on ($20) on sub 2 (new_billing_subscription)
 * - Preview ONE multiUpdate: cancel both immediately
 *
 * Expected Result:
 * - subscriptions: two groups, EXACTLY -20 each (matching the per-sub credit
 *   invoices execution creates), no next cycle for either
 * - top-level total EXACTLY -40 (the sum)
 */
test.concurrent(
	`${chalk.yellowBright("multi update preview: per-sub totals for cross-sub immediate cancels")}`,
	async () => {
		const customerId = "multi-update-preview-totals";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id, newBillingSubscription: true }),
			],
		});

		await expectMultiUpdatePreviewCorrect({
			autumn: autumnV2_3,
			params: {
				customer_id: customerId,
				updates: [
					{ plan_id: pro.id, cancel_action: "cancel_immediately" },
					{ plan_id: addon.id, cancel_action: "cancel_immediately" },
				],
			},
			total: -40,
			subscriptions: [
				{ planIds: [pro.id], total: -20, nextCycleTotal: null },
				{ planIds: [addon.id], total: -20, nextCycleTotal: null },
			],
		});
	},
);
