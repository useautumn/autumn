/**
 * TDD tests for usage-window ANCHOR selection across plan changes.
 *
 * Contract under test:
 *   - top-up-only customers: the window anchors to the loose top-up ent and
 *     aligns to the UTC calendar (no cycle exists)
 *   - subscribing later transfers the anchor to the plan ent: the window
 *     re-keys to the plan cycle (window_end == plan ent next_reset_at) and
 *     the moved window ZEROES the counter
 *   - when both exist up front, the plan-backed ent outranks the OLDER
 *     loose top-up ent
 */

import { expect, test } from "bun:test";
import { ApiVersion, EntInterval, getUsageWindowBounds } from "@autumn/shared";
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
	fetchLooseCusEnt,
	fetchUsageWindowRows,
} from "../../utils/usage-limit-utils/usageWindowDbTestUtils.js";

// initScenario only exposes clients up to V2_2; build the latest-version client
// directly (same pattern as the v2.2-vs-v2.3 parity tests).
const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

// ── Contract: top-up-only anchors to the loose ent, calendar bounds ──
test.concurrent(
	`${chalk.yellowBright("uw-plan-change-anchor1: a cap with only a top-up grant anchors to it with calendar bounds")}`,
	async () => {
		const customerId = "uw-anchor-topup-1";
		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [] })],
			actions: [],
		});

		await autumnV2_3.post("/balances.create", {
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			included_grant: 100,
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 2,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 2,
			limit: 5,
		});

		// PG: anchored to the loose top-up ent; lifetime grants have no cycle, so
		// the window is UTC-calendar aligned.
		await timeout(4000);
		const topUpEnt = await fetchLooseCusEnt({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		expect(topUpEnt?.id).toBeTruthy();

		const windowRows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		expect(windowRows).toHaveLength(1);
		expect(windowRows[0].anchor_customer_entitlement_id).toBe(topUpEnt.id);

		const calendar = getUsageWindowBounds({
			interval: EntInterval.Month,
			now: Date.now(),
		});
		expect(Number(windowRows[0].window_start_at)).toBe(calendar.windowStartAt);
		expect(Number(windowRows[0].window_end_at)).toBe(calendar.windowEndAt);
	},
);

// ── Contract: subscribing transfers the anchor to the plan cycle ──
test.concurrent(
	`${chalk.yellowBright("uw-plan-change-anchor2: subscribing re-anchors the window to the plan ent and restarts the counter")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-anchor-subscribe-1";
		const { ctx, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_3.post("/balances.create", {
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			included_grant: 100,
		});
		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			limit: 5,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 2,
		});

		// Flush the counter to Postgres before the cache-invalidating change
		// (the rebuild re-seeds counters from PG).
		await timeout(4000);

		// Subscribe: the plan ent now outranks the top-up, the window re-keys to
		// the plan cycle, and the moved window zeroes the counter.
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 0,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 3,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 3,
			limit: 5,
		});

		await timeout(4000);
		const planEnt = await fetchActivePlanCusEnt({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		expect(planEnt?.next_reset_at).toBeTruthy();

		const windowRows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		const currentRow = windowRows.find(
			(row) => Number(row.window_end_at) === Number(planEnt.next_reset_at),
		);
		expect(currentRow).toBeDefined();
		expect(currentRow.anchor_customer_entitlement_id).toBe(planEnt.id);
		expect(Number(currentRow.window_end_at)).toBe(
			Number(planEnt.next_reset_at),
		);
	},
);

// ── Contract: plan-backed ent outranks an OLDER top-up ent ──────────
test.concurrent(
	`${chalk.yellowBright("uw-plan-change-anchor3: the plan ent wins the anchor over an older top-up ent")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-anchor-rank-1";
		const { ctx, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// Top-up FIRST (older created_at), plan second.
		await autumnV2_3.post("/balances.create", {
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			included_grant: 50,
		});
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			limit: 5,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 2,
		});

		await timeout(4000);
		const planEnt = await fetchActivePlanCusEnt({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		const windowRows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		expect(windowRows).toHaveLength(1);
		expect(windowRows[0].anchor_customer_entitlement_id).toBe(planEnt.id);
		expect(Number(windowRows[0].window_end_at)).toBe(
			Number(planEnt.next_reset_at),
		);
	},
);
