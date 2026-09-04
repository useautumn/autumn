/**
 * Contract: check, lock and finalize all price by the event's properties when
 * the balance is entity-scoped. The reservation is taken from the entity's own
 * balance at the dimensioned rate, and finalize reprices against the same
 * properties the check locked with.
 */

import { expect, test } from "bun:test";
import type { ApiEntityV2, FeatureConfigOverride } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const GRANT = 1_000;

const dimensionedAction1: FeatureConfigOverride = {
	schema: [
		{
			metered_feature_id: TestFeature.Action1,
			credit_amount: 1,
			dimensions: {
				large: { match: { size: "large" }, credit_amount: 16 },
			},
			multipliers: {
				spot: { match: { lifecycle: "spot" }, factor: 0.5 },
			},
		},
	],
};

const setupEntityCredits = async ({ customerId }: { customerId: string }) => {
	const creditItem = items.consumable({
		featureId: TestFeature.Credits,
		includedUsage: GRANT,
		entityFeatureId: TestFeature.Users,
	});
	const product = products.pro({
		id: customerId,
		items: [
			items.freeUsers({ includedUsage: 3 }),
			{
				...creditItem,
				config: { ...creditItem.config, feature_override: dimensionedAction1 },
			},
		],
	});

	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: product.id })],
	});
};

test.concurrent(
	`${chalk.yellowBright("check-credit-dimensions-entities: an entity check converts at the matched dimension")}`,
	async () => {
		const customerId = "check-dimensions-entities";
		const { autumnV2_3, entities } = await setupEntityCredits({ customerId });

		const large = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Action1,
			required_balance: 10,
			properties: { size: "large" },
		});
		expect(large).toMatchObject({ allowed: true, required_balance: 160 });

		const spot = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Action1,
			required_balance: 10,
			properties: { size: "large", lifecycle: "spot" },
		});
		expect(spot).toMatchObject({ allowed: true, required_balance: 80 });
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("check-credit-dimensions-entities: a locked entity check finalizes at the same properties")}`,
	async () => {
		const customerId = "check-dimensions-entities-lock";
		const { autumnV2_2, autumnV2_3, entities } = await setupEntityCredits({
			customerId,
		});
		const lockId = `${customerId}-lock`;

		const check = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Action1,
			required_balance: 10,
			properties: { size: "large" },
			lock: { enabled: true, lock_id: lockId },
		});
		expect(check.allowed).toBe(true);

		// The reservation comes off this entity's balance, not the customer's.
		const reserved = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		expectBalanceCorrect({
			customer: reserved,
			featureId: TestFeature.Credits,
			granted: GRANT,
			remaining: GRANT - 160,
			usage: 160,
		});

		await autumnV2_3.balances.finalize({
			lock_id: lockId,
			action: "confirm",
			override_value: 5,
		});

		// Repriced at the locked properties: 5 x 16 = 80.
		const finalized = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		expectBalanceCorrect({
			customer: finalized,
			featureId: TestFeature.Credits,
			granted: GRANT,
			remaining: GRANT - 80,
			usage: 80,
		});
	},
	{ timeout: 120_000 },
);
