/**
 * Contract: per-entity credit rows (entity_feature_id) honour their plan
 * item's feature_override. A feature the override excludes is denied and
 * never drawn, whether tracked against an entity or the customer.
 */

import { expect, test } from "bun:test";
import type {
	ApiEntityV2,
	CheckResponseV3,
	FeatureConfigOverride,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const expectEntityCreditsRemaining = async ({
	autumn,
	customerId,
	entityId,
	remaining,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId: string;
	remaining: number;
}) => {
	const entity = await autumn.entities.get<ApiEntityV2>(customerId, entityId, {
		skip_cache: "true",
	});
	expect(entity.balances?.[TestFeature.Credits]?.remaining).toBe(remaining);
};

test.concurrent(
	`${chalk.yellowBright("entity credit override: per-entity rows never fund an excluded feature")}`,
	async () => {
		const creditsItem = items.free({
			featureId: TestFeature.Credits,
			includedUsage: 100,
			entityFeatureId: TestFeature.Users,
		});
		const featureOverride: FeatureConfigOverride = {
			schema: [
				{ metered_feature_id: TestFeature.Action1, excluded: true },
				{ metered_feature_id: TestFeature.Action2, credit_amount: 2 },
			],
		};
		const plan = products.base({
			id: "per-entity-credits",
			items: [
				{
					...creditsItem,
					config: { ...creditsItem.config, feature_override: featureOverride },
				},
			],
		});

		const { customerId, entities, autumnV1, autumnV2_3 } = await initScenario({
			customerId: "override-entity-excluded",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		const [first, second] = entities.map((entity) => entity.id);

		const check = await autumnV2_3.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: first,
			feature_id: TestFeature.Action1,
		});
		expect(check.allowed).toBe(false);

		for (const entityId of [first, undefined]) {
			await autumnV1
				.track({
					customer_id: customerId,
					entity_id: entityId,
					feature_id: TestFeature.Action1,
					value: 100,
				})
				.catch(() => undefined);
		}

		// Action2 draws the entity row at the override rate: 10 x 2 = 20.
		await autumnV1.track({
			customer_id: customerId,
			entity_id: first,
			feature_id: TestFeature.Action2,
			value: 10,
		});

		await expectEntityCreditsRemaining({
			autumn: autumnV2_3,
			customerId,
			entityId: first!,
			remaining: 80,
		});
		await expectEntityCreditsRemaining({
			autumn: autumnV2_3,
			customerId,
			entityId: second!,
			remaining: 100,
		});
	},
);
