/**
 * TDD tests for usage-window behavior on IMMEDIATE plan upgrades.
 *
 * Contract under test (WINDOW-IDENTITY rule): the count belongs to the
 * window, not the plan. Upgrades here PRESERVE the billing cycle (same
 * window bounds; the recomputed next_reset_at is precision-corrected by
 * applyExistingNextResetAts), so an upgrade is an anchor-only re-point:
 *   - the counter SURVIVES the upgrade -- no fresh cap headroom mid-cycle
 *   - a counter AT the cap stays exhausted through the upgrade
 *   - multi-balance: the carried cap keeps binding; the top-up persists
 * A cycle-RESTARTING change would move the window and zero (see the
 * computeUsageWindowRolls unit table).
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, ApiVersion } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerBalance,
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

// ── Contract: upgrade resets the window, aligned to the new cycle ──
test.concurrent(
	`${chalk.yellowBright("uw-plan-change-upgrade1: pro -> premium carries the counter; window_end == new ent next_reset_at")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const customerId = "uw-upgrade-reset-1";
		const { ctx, autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro, premium] }),
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
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});

		// Immediate upgrade: pro is expired, premium's cycle starts now.
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		// Cycle preserved: anchor-only re-point, the counter SURVIVES.
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});

		// Only the remaining headroom (2) applies from a track of 5.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 198,
			usage: 2,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});

		// PG: the live counter row is anchored to the premium ent's cycle.
		await timeout(4000);
		const premiumEnt = await fetchActivePlanCusEnt({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(premiumEnt?.next_reset_at).toBeTruthy();

		const windowRows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const currentRow = windowRows.find(
			(row) => Number(row.window_end_at) === Number(premiumEnt.next_reset_at),
		);
		expect(currentRow).toBeDefined();
		expect(Number(currentRow.usage)).toBe(5);
		expect(currentRow.anchor_customer_entitlement_id).toBe(premiumEnt.id);
	},
);

// ── Contract: an exhausted cap yields fresh headroom post-upgrade ──
test.concurrent(
	`${chalk.yellowBright("uw-plan-change-upgrade2: a counter AT the cap stays exhausted through the upgrade")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const customerId = "uw-upgrade-atcap-1";
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		// Exhaust the cap; the next track fully clamps.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		// Cycle preserved: the cap stays exhausted, a track fully clamps.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 200,
			usage: 0,
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

// ── Contract: multi-balance — cap resets, loose top-up untouched ──
test.concurrent(
	`${chalk.yellowBright("uw-plan-change-upgrade3: cap on credits carries through upgrade while the top-up balance persists")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyCredits({ includedUsage: 3 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-upgrade-multibal-1";
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Loose lifetime top-up alongside the plan credits.
		await autumnV2_3.post("/balances.create", {
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			included_grant: 50,
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			limit: 5,
		});

		// Track 5 credits: drains the 3 monthly then 2 from the top-up; the
		// counter sums both (cap exhausted).
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 5,
			limit: 5,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		// The counter carried (cap still exhausted); the top-up too.
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 5,
			limit: 5,
		});
		const postUpgrade =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: postUpgrade,
			featureId: TestFeature.Credits,
			// premium's fresh 100 + the top-up's 50 (2 already used pre-upgrade:
			// the loose grant carries its usage across the plan change).
			granted: 150,
			remaining: 148,
			usage: 2,
		});

		// No fresh headroom: a further track fully clamps.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			value: 2,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			usage: 5,
			limit: 5,
		});
	},
);
