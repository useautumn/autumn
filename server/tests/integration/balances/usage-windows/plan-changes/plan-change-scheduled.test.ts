/**
 * TDD test for usage windows across a SCHEDULED downgrade (premium -> pro at
 * cycle end, triggered by advancing the test clock past the next invoice).
 *
 * Contract under test (WINDOW-IDENTITY rule):
 *   - while the downgrade is only scheduled, the cap keeps binding on the
 *     premium cycle (counter untouched by scheduling)
 *   - the scheduled switch preserves the billing cycle, so the pro-anchored
 *     bracket equals the premium one: anchor-only re-point, count KEPT.
 *
 * NOTE: in production the switch fires exactly when the old window closes by
 * WALL clock, so the count zeroes there via natural expiry. Test clocks
 * can't show that (windows live on server wall time); this test pins the
 * re-anchor + carry half of the contract.
 */

import { expect, test } from "bun:test";
import { ApiVersion, EntInterval, getUsageWindowBounds } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addMonths } from "date-fns";
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

test.concurrent(
	`${chalk.yellowBright("uw-plan-change-scheduled1: premium -> pro at cycle end re-keys the window to the pro cycle")}`,
	async () => {
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-sched-downgrade-1";
		const {
			ctx,
			autumnV1,
			testClockId: maybeTestClockId,
			advancedTo,
		} = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [s.billing.attach({ productId: premium.id })],
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

		// Schedule the downgrade: premium keeps running (canceling), pro is
		// scheduled. The cap is untouched by the scheduling itself.
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});

		// Flush the counter, then turn the cycle: premium ends, pro activates.
		await timeout(4000);
		const testClockId = maybeTestClockId as string;
		expect(testClockId).toBeTruthy();
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: addMonths(new Date(advancedTo ?? Date.now()), 1).getTime(),
			waitForSeconds: 30,
		});
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			numberOfHours: hoursToFinalizeInvoice,
			startingFrom: addMonths(new Date(advancedTo ?? Date.now()), 1),
			waitForSeconds: 30,
		});

		// Cycle preserved across the switch: anchor re-points, count carried.
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});

		// PG: the live row anchors to the pro ent; bounds derive from its
		// next_reset_at (computed, since the test clock runs ahead of wall time).
		await timeout(4000);
		const proEnt = await fetchActivePlanCusEnt({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(proEnt?.next_reset_at).toBeTruthy();

		const expectedBounds = getUsageWindowBounds({
			interval: EntInterval.Month,
			now: Date.now(),
			anchor: Number(proEnt.next_reset_at),
		});
		const windowRows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const currentRow = windowRows.find(
			(row) => Number(row.window_end_at) === expectedBounds.windowEndAt,
		);
		expect(currentRow).toBeDefined();
		expect(Number(currentRow.usage)).toBe(5);
		// Bounds (above) prove pro-cycle alignment; the anchor id itself depends
		// on which of the plan's ents the resolver tie-breaks to post-switch.
		expect(currentRow.anchor_customer_entitlement_id).not.toBeNull();
		expect(Number(currentRow.window_start_at)).toBe(
			expectedBounds.windowStartAt,
		);
		expect(Number(currentRow.window_end_at)).toBe(expectedBounds.windowEndAt);
	},
);
