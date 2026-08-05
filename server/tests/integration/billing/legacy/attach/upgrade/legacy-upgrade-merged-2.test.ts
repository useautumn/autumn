/**
 * Legacy Attach V1 Upgrade - Merged Entity Tests (slice 2 of 2)
 *
 * Migrated from:
 * - server/tests/merged/upgrade/mergedUpgrade3.test.ts (upgrade cancels scheduled downgrade, both entities)
 * - server/tests/merged/upgrade/mergedUpgrade4.test.ts (upgrade cancels scheduled cancel/free)
 *
 * Tests V1 attach (s.attach) behavior for upgrade scenarios in merged entity subscriptions.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { test } from "bun:test";
import type { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade cancels scheduled downgrade (both entities downgraded)
// (from mergedUpgrade3)
//
// Scenario:
// - Premium, Pro, Free, Growth products with Words feature
// - 2 entities, attach Premium to both
// - Downgrade entity 1 from Premium to Pro (scheduled)
// - Downgrade entity 2 from Premium to Pro (scheduled)
// - Upgrade entity 2 to Growth → cancels scheduled Pro, immediate switch
//
// Expected:
// - Entity 1: Premium (active) + Pro (scheduled) — unchanged
// - Entity 2: Growth (active)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-merged 3: upgrade cancels scheduled downgrade (both entities)")}`,
	async () => {
		const customerId = "legacy-upgrade-merged-3";

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });
		const free = products.base({
			id: "free",
			items: [wordsItem],
		});
		const growth = products.growth({ id: "growth", items: [wordsItem] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free, premium, growth] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: premium.id, entityIndex: 0 }),
				s.attach({ productId: premium.id, entityIndex: 1 }),
			],
		});

		// Downgrade entity 1 from Premium to Pro (scheduled)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
		});

		// Downgrade entity 2 from Premium to Pro (scheduled)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[1].id,
		});

		// Verify both entities have scheduled downgrade
		let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1 as any,
			productId: premium.id,
			status: "active" as unknown as CusProductStatus,
		});
		expectProductAttached({
			customer: entity1 as any,
			productId: pro.id,
			status: "scheduled" as unknown as CusProductStatus,
		});

		let entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2 as any,
			productId: premium.id,
			status: "active" as unknown as CusProductStatus,
		});
		expectProductAttached({
			customer: entity2 as any,
			productId: pro.id,
			status: "scheduled" as unknown as CusProductStatus,
		});

		// Upgrade entity 2 to Growth → cancels scheduled Pro, immediate switch
		await autumnV1.attach({
			customer_id: customerId,
			product_id: growth.id,
			entity_id: entities[1].id,
		});

		entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2 as any,
			productId: growth.id,
			status: "active" as unknown as CusProductStatus,
		});

		// Entity 1 should be unchanged: Premium (active) + Pro (scheduled)
		entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1 as any,
			productId: premium.id,
			status: "active" as unknown as CusProductStatus,
		});
		expectProductAttached({
			customer: entity1 as any,
			productId: pro.id,
			status: "scheduled" as unknown as CusProductStatus,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Upgrade cancels scheduled cancel/free
// (from mergedUpgrade4)
//
// Scenario:
// - Pro, Free, Premium products with Words feature
// - 2 entities, attach Pro to both
// - Downgrade entity 1 from Pro to Free (schedules cancellation)
// - Upgrade entity 1 to Premium → cancels scheduled free, immediate switch
//
// Expected:
// - Entity 1: Premium (active)
// - Entity 2: Pro (active)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-merged 4: upgrade cancels scheduled cancel/free")}`,
	async () => {
		const customerId = "legacy-upgrade-merged-4";

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [wordsItem] });
		const free = products.base({
			id: "free",
			items: [wordsItem],
		});
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
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		// Downgrade entity 1 from Pro to Free (schedules cancellation)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
			entity_id: entities[0].id,
		});

		// Verify entity 1 has Pro (active) + Free (scheduled)
		let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1 as any,
			productId: pro.id,
			status: "active" as unknown as CusProductStatus,
		});
		expectProductAttached({
			customer: entity1 as any,
			productId: free.id,
			status: "scheduled" as unknown as CusProductStatus,
		});

		// Upgrade entity 1 to Premium → cancels scheduled free, immediate switch
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
		});

		entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1 as any,
			productId: premium.id,
			status: "active" as unknown as CusProductStatus,
		});

		// Entity 2 should still have Pro
		const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2 as any,
			productId: pro.id,
			status: "active" as unknown as CusProductStatus,
		});
	},
);
