/**
 * TDD regression: an unlimited entity-scoped item must stay allowed for
 * entities that existed before the plan was attached, even after another
 * entity is created later.
 *
 * Red-failure mode (previous behavior):
 *  - Attach seeded `entities: null` on the unlimited cusEnt.
 *  - Creating ent-3 afterwards seeded the map with ent-3 alone.
 *  - cusEntMatchesEntity then excluded ent-1/ent-2, so /check answered
 *    allowed=false with balance=null on an unlimited feature.
 *
 * Green-success criteria:
 *  - Every entity (pre-existing and newly created) checks allowed=true with an
 *    unlimited balance, from cache and from the DB.
 */

import { expect, test } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const expectUnlimitedCheck = ({
	check,
	entityId,
}: {
	check: CheckResponseV3;
	entityId: string;
}) => {
	expect(check.allowed).toBe(true);
	expect(check.entity_id).toBe(entityId);
	expect(check.balance?.unlimited).toBe(true);
};

test.concurrent(
	`${chalk.yellowBright("check entity-scoped unlimited: pre-existing entities stay allowed after a later entity is created")}`,
	async () => {
		const unlimitedPerEntityProduct = products.base({
			id: "check-unlimited-per-entity",
			items: [items.unlimitedMessages({ entityFeatureId: TestFeature.Users })],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "check-unlimited-per-entity-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [unlimitedPerEntityProduct] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: unlimitedPerEntityProduct.id })],
		});

		await autumnV2_1.entities.create(customerId, {
			id: "ent-3",
			name: "Entity 3",
			feature_id: TestFeature.Users,
		});

		for (const entityId of ["ent-1", "ent-2", "ent-3"]) {
			const cached = await autumnV2_1.check<CheckResponseV3>({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				entity_id: entityId,
			});
			expectUnlimitedCheck({ check: cached, entityId });

			const uncached = await autumnV2_1.check<CheckResponseV3>({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				entity_id: entityId,
				skip_cache: true,
			});
			expectUnlimitedCheck({ check: uncached, entityId });
		}
	},
);
