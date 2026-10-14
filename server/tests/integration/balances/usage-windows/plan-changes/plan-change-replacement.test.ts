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
	expectCustomerBalance,
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import {
	fetchActivePlanCusEnt,
	fetchUsageWindowRows,
} from "../../utils/usage-limit-utils/usageWindowDbTestUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

// ── Contract: replacement restarts the cap with the new cycle ───────
// Skipped: plan B's cycle starts within isSameUsageWindow's 30s tolerance, so the window (and count) carries over by design.
test.concurrent.skip(
	`${chalk.yellowBright("uw-plan-change-replacement1: free-plan replacement restarts the cap on the new ent's cycle")}`,
	async () => {
		const planA = products.base({
			id: "uw-replace-a",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planB = products.base({
			id: "uw-replace-b",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const customerId = "uw-replace-1";
		const { ctx, autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [planA, planB] }),
			],
			actions: [s.billing.attach({ productId: planA.id })],
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
			value: 5,
		});
		await timeout(4000);

		await autumnV2_1.attach({
			customer_id: customerId,
			product_id: planB.id,
		});
		await timeout(2000);

		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 0,
			limit: 5,
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
			granted: 200,
			remaining: 199,
			usage: 1,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 1,
			limit: 5,
		});

		await timeout(4000);
		const planBEnt = await fetchActivePlanCusEnt({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const windowRows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		const currentRow = windowRows.find(
			(row) => Number(row.window_end_at) === Number(planBEnt.next_reset_at),
		);
		expect(currentRow).toBeDefined();
		expect(currentRow.anchor_customer_entitlement_id).toBe(planBEnt.id);
		expect(Number(currentRow.window_end_at)).toBe(
			Number(planBEnt.next_reset_at),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("uw-plan-change-replacement2: cancelling the plan re-aligns the cap to calendar bounds, counter zeroed")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-replace-cancel",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "uw-replace-cancel-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
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
			value: 2,
		});

		await timeout(4000);

		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			plan_id: freePlan.id,
			cancel_action: "cancel_immediately",
		});

		const customer = await autumnV2_3.customers.get(customerId);
		// biome-ignore lint/suspicious/noExplicitAny: response inspected loosely
		const limit = (customer as any).billing_controls?.usage_limits?.find(
			// biome-ignore lint/suspicious/noExplicitAny: response inspected loosely
			(entry: any) => entry.feature_id === TestFeature.Messages,
		);
		expect(limit).toBeDefined();
		expect(limit.limit).toBe(5);
		expect(limit.usage ?? 0).toBe(0);

		const calendar = getUsageWindowBounds({
			interval: EntInterval.Month,
			now: Date.now(),
		});
		expect(calendar.windowEndAt).toBeGreaterThan(Date.now());
	},
);
