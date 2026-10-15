/**
 * Contract: locks follow a plan item's merged credit schema.
 * - check with lock on an EXCLUDED feature is denied and reserves nothing.
 * - a lock on an OVERRIDDEN feature reserves at the override rate, and
 *   finalize confirm settles the final value at that same rate.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	CheckResponseV3,
	FeatureConfigOverride,
} from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const withFeatureOverride = (
	item: ReturnType<typeof items.free>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

test.concurrent(
	`${chalk.yellowBright("lock feature-override: excluded is denied, overridden reserves and finalizes at the override rate")}`,
	async () => {
		// Catalog Credits: Action1 = 0.2, Action2 = 0.6.
		const creditsItem = withFeatureOverride(
			items.free({ featureId: TestFeature.Credits, includedUsage: 200 }),
			{
				schema: [
					{ metered_feature_id: TestFeature.Action1, credit_amount: 0.5 },
					{ metered_feature_id: TestFeature.Action2, excluded: true },
				],
			},
		);
		const freeProd = products.base({ id: "free", items: [creditsItem] });
		const customerId = "lock-feature-override";
		const excludedLockId = `${customerId}-excluded`;

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});
		await deleteLock({ ctx, lockId: customerId });
		await deleteLock({ ctx, lockId: excludedLockId });

		const excludedCheck = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			required_balance: 10,
			lock: { enabled: true, lock_id: excludedLockId },
		});
		expect(excludedCheck.allowed).toBe(false);

		const afterExcluded =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterExcluded,
			featureId: TestFeature.Credits,
			remaining: 200,
		});

		// Reserve 20 Action1 at 0.5 = 10 credits (catalog would be 4).
		const lockCheck = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 20,
			lock: { enabled: true, lock_id: customerId },
		});
		expect(lockCheck.allowed).toBe(true);

		const afterLock = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterLock,
			featureId: TestFeature.Credits,
			remaining: 190,
		});

		// Confirm 30 Action1 at 0.5 = 15 credits in total.
		await autumnV2_3.balances.finalize({
			lock_id: customerId,
			action: "confirm",
			override_value: 30,
		});

		const afterFinalize =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterFinalize,
			featureId: TestFeature.Credits,
			remaining: 185,
		});
	},
	{ timeout: 120_000 },
);
