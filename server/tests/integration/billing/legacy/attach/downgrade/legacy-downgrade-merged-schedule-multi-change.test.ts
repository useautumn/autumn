// Legacy V1 attach downgrade/schedule behavior for entity-level merged subscriptions
// (migrated from server/tests/merged/downgrade).

import { test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Multiple schedule changes on same entity
// (from mergedDowngrade6)
//
// Ops: Growth(ent1), Growth(ent2), Free(ent1→sched), Pro(ent1→replaces),
//      Premium(ent1→replaces), Free(ent1→replaces back)
// Tests that changing the scheduled product replaces the previous schedule
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-dg-sched 4: multiple schedule changes on same entity")}`,
	async () => {
		const customerId = "legacy-dg-sched-4";

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const free = products.base({ id: "free", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const growth = products.growth({ id: "growth", items: [wordsItem] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free, premium, growth] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: growth.id, entityIndex: 0 }),
				s.attach({ productId: growth.id, entityIndex: 1 }),
			],
		});

		// Entity 1: Downgrade to Free (scheduled)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
			entity_id: entities[0].id,
		});

		let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({ customer: entity1, productId: growth.id });
		expectProductAttached({
			customer: entity1,
			productId: free.id,
			status: CusProductStatus.Scheduled,
		});

		// Entity 1: Change schedule to Pro
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
		});

		entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({ customer: entity1, productId: growth.id });
		expectProductAttached({
			customer: entity1,
			productId: pro.id,
			status: CusProductStatus.Scheduled,
		});

		// Entity 1: Change schedule to Premium
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
		});

		entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({ customer: entity1, productId: growth.id });
		expectProductAttached({
			customer: entity1,
			productId: premium.id,
			status: CusProductStatus.Scheduled,
		});

		// Entity 1: Change schedule back to Free
		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
			entity_id: entities[0].id,
		});

		entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({ customer: entity1, productId: growth.id });
		expectProductAttached({
			customer: entity1,
			productId: free.id,
			status: CusProductStatus.Scheduled,
		});
	},
);
