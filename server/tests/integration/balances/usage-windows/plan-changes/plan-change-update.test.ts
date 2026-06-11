/**
 * TDD tests for usage windows across SUBSCRIPTION UPDATES (customize items,
 * non-patch PUT).
 *
 * Contract under test (anchor-only re-point):
 *   - a customize that keeps the feature's reset cadence PRESERVES the
 *     cycle: the recreated main ent's next_reset_at equals the pre-update
 *     value, the usage-window anchor follows a cycle-bearing ent, the window
 *     does not move, and the counter is NOT zeroed (only the anchor
 *     re-points to the new ent id)
 *   - this holds both for a base-price-only customize and for updating the
 *     capped item itself (includedUsage bump)
 */

import { expect, test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import {
	fetchActivePlanCusEnt,
	fetchUsageWindowRows,
} from "../../utils/usage-limit-utils/usageWindowDbTestUtils.js";

// initScenario only exposes clients up to V2_2; build the latest-version client
// directly (same pattern as the v2.2-vs-v2.3 parity tests).
const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

// ── Contract: price-only customization never resets the counter ─────
test.concurrent(
	`${chalk.yellowBright("uw-plan-change-update1: a base-price-only customize preserves the cycle and the counter")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-update-price-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		// Flush the counter to Postgres before the cache-invalidating change
		// (the rebuild re-seeds counters from PG).
		await timeout(4000);
		const entBefore = await fetchActivePlanCusEnt({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(entBefore?.next_reset_at).toBeTruthy();

		// Customize the base price only; the messages item is untouched.
		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				price: { amount: 50, interval: "month" },
			},
		});

		// ── Contract: a price-only customize doesn't touch the ent at all ──
		const entAfter = await fetchActivePlanCusEnt({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(entAfter?.id).toBe(entBefore.id);
		expect(Number(entAfter?.next_reset_at)).toBe(
			Number(entBefore.next_reset_at),
		);

		// ── Contract: same window => anchor-only re-point, count KEPT ─────
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});

		// ── Contract: the cap keeps binding (track 5 clamps to headroom 2) ─
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});

		// ── Contract: PG row stayed on the preserved cycle ────────────────
		await timeout(4000);
		const windowRows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(windowRows).toHaveLength(1);
		expect(Number(windowRows[0].usage)).toBe(5);
		expect(Number(windowRows[0].window_end_at)).toBe(
			Number(entBefore.next_reset_at),
		);
	},
);

// ── Contract: updating the capped item preserves the cycle + counter ──
test.concurrent(
	`${chalk.yellowBright("uw-plan-change-update2: updating the capped item preserves the cycle and the counter")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-update-item-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		// Flush the counter to Postgres before the cache-invalidating change
		// (the rebuild re-seeds counters from PG).
		await timeout(4000);

		// Bump the capped item's included usage (100 -> 500): the cadence is
		// unchanged, so the cycle is preserved and the counter survives.
		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 500,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		});

		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});

		// Still binding on the enlarged balance: track 5 clamps to 2.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});
	},
);
