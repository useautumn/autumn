// Legacy V1 attach downgrade behavior with test clock advancement (migrated from
// server/tests/merged/downgrade).

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
// TEST 2: Downgrade to free + downgrade to pro, advance clock, then upgrade
// (from mergedDowngrade2)
//
// Ops: Premium(ent1), Free(ent1→sched), Premium(ent2), Pro(ent2→sched)
// Advance clock → ent1=Free(active), ent2=Pro(active)
// Then upgrade ent1 back to Premium
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-dg-clock 1: downgrade to free + pro, advance clock, upgrade")}`,
	async () => {
		const customerId = "legacy-dg-clock-1";

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const wordsConsumable = items.consumableWords();
		const free = products.base({ id: "free", items: [wordsItem] });
		const premium = products.premium({
			id: "premium",
			items: [wordsConsumable],
		});
		const pro = products.pro({ id: "pro", items: [wordsConsumable] });

		// Setup: Premium(ent1), Free(ent1→sched), Premium(ent2), Pro(ent2→sched), advance clock
		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, free] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: premium.id, entityIndex: 0 }),
				s.attach({ productId: free.id, entityIndex: 0 }),
				s.attach({ productId: premium.id, entityIndex: 1 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
				s.advanceToNextInvoice(),
			],
		});

		// After advancement: entity 1 = Free (active), entity 2 = Pro (active)
		let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1,
			productId: free.id,
			status: CusProductStatus.Active,
		});
		expect(
			entity1.products.filter((p: any) => p.group === premium.group).length,
		).toBe(1);

		const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2,
			productId: pro.id,
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

		// Upgrade entity 1 from Free back to Premium
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
		});

		entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1,
			productId: premium.id,
			status: CusProductStatus.Active,
		});
	},
);
