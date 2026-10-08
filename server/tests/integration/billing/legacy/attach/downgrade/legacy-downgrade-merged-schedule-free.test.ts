// Legacy V1 attach downgrade/schedule behavior for entity-level merged subscriptions
// (migrated from server/tests/merged/downgrade).

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Pro on 2 entities, downgrade ent1 to free, upgrade ent2 to premium
// (from mergedDowngrade3)
//
// Ops: Pro(ent1), Pro(ent2), Free(ent1→sched), Premium(ent2→upgrade)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-dg-sched 2: pro entities, downgrade to free + upgrade to premium")}`,
	async () => {
		const customerId = "legacy-dg-sched-2";

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const wordsConsumable = items.consumableWords();
		const free = products.base({ id: "free", items: [wordsItem] });
		const premium = products.premium({
			id: "premium",
			items: [wordsConsumable],
		});
		const pro = products.pro({ id: "pro", items: [wordsConsumable] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, free] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		// Entity 1: Downgrade to Free (scheduled)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
			entity_id: entities[0].id,
		});

		const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({ customer: entity1, productId: pro.id });
		expectProductAttached({
			customer: entity1,
			productId: free.id,
			status: CusProductStatus.Scheduled,
		});
		expect(
			entity1.products.filter((p: any) => p.group === premium.group).length,
		).toBe(2);

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Entity 2: Upgrade to Premium (immediate)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[1].id,
		});

		const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2,
			productId: premium.id,
			status: CusProductStatus.Active,
		});
		expect(
			entity2.products.filter((p: any) => p.group === premium.group).length,
		).toBe(1);

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Downgrade both entities to free, then change ent2 to pro
// (from mergedDowngrade5)
//
// Ops: Premium(ent1), Premium(ent2), Free(ent1→sched), Free(ent2→sched),
//      Pro(ent2→replaces free schedule)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-dg-sched 3: downgrade to free, then change schedule to pro")}`,
	async () => {
		const customerId = "legacy-dg-sched-3";

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const free = products.base({ id: "free", items: [wordsItem] });
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: premium.id, entityIndex: 0 }),
				s.attach({ productId: premium.id, entityIndex: 1 }),
			],
		});

		// Entity 1: Downgrade to Free (scheduled)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
			entity_id: entities[0].id,
		});

		const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({ customer: entity1, productId: premium.id });
		expectProductAttached({
			customer: entity1,
			productId: free.id,
			status: CusProductStatus.Scheduled,
		});

		// Entity 2: Downgrade to Free (scheduled)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
			entity_id: entities[1].id,
		});

		let entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({ customer: entity2, productId: premium.id });
		expectProductAttached({
			customer: entity2,
			productId: free.id,
			status: CusProductStatus.Scheduled,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: true,
		});

		// Entity 2: Change schedule from Free to Pro
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[1].id,
		});

		entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({ customer: entity2, productId: premium.id });
		expectProductAttached({
			customer: entity2,
			productId: pro.id,
			status: CusProductStatus.Scheduled,
		});
	},
);
