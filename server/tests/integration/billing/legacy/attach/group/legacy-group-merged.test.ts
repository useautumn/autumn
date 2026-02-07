/**
 * Legacy Attach V1 Group - Merged Subscription Tests
 *
 * Migrated from:
 * - server/tests/merged/group/mergedGroup1.test.ts (products from different groups)
 * - server/tests/merged/group/mergedGroup2.test.ts (downgrade within group, other group unaffected)
 *
 * Tests V1 attach behavior for products in different groups.
 * Products in different groups don't compete — attaching g1Premium does NOT replace g2Pro.
 * Products in the same group DO compete — attaching g1Premium replaces g1Pro.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { test } from "bun:test";
import type { ApiCustomerV3, CusProductStatus } from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Products from different groups — upgrade in g1, g2 unaffected
// (from mergedGroup1)
//
// Scenario:
// - Group 1: g1Pro ($20), g1Premium ($50)
// - Group 2: g2Pro ($20), g2Premium ($50)
// - Attach g1Pro → attach g2Pro → upgrade g1Pro to g1Premium → downgrade g1 to g1Pro
//
// Expected at each step:
// 1. g1Pro active
// 2. g1Pro active + g2Pro active (different groups, no conflict)
// 3. g1Premium active + g2Pro active (g1Pro replaced within group 1)
// 4. g1Premium active + g2Pro active + g1Pro scheduled (downgrade within group 1)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-group-merged 1: upgrade in one group, other group unaffected")}`, async () => {
	const customerId = "legacy-group-merged-1";

	const wordsItem = items.consumableWords();
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const g1Pro = products.base({
		id: "g1-pro",
		items: [wordsItem, proPrice],
		group: "group-1",
	});
	const g1Premium = products.base({
		id: "g1-premium",
		items: [wordsItem, premiumPrice],
		group: "group-1",
	});
	const g2Pro = products.base({
		id: "g2-pro",
		items: [wordsItem, proPrice],
		group: "group-2",
	});
	const g2Premium = products.base({
		id: "g2-premium",
		items: [wordsItem, premiumPrice],
		group: "group-2",
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [g1Pro, g1Premium, g2Pro, g2Premium] }),
		],
		actions: [s.attach({ productId: g1Pro.id })],
	});

	// Verify g1Pro is active
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: g1Pro.id,
		status: "active" as unknown as CusProductStatus,
	});

	// Step 2: Attach g2Pro (different group, no conflict)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: g2Pro.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: g1Pro.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g2Pro.id,
		status: "active" as unknown as CusProductStatus,
	});

	// Step 3: Upgrade g1Pro to g1Premium (within group 1)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: g1Premium.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: g1Premium.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g2Pro.id,
		status: "active" as unknown as CusProductStatus,
	});

	// Step 4: Downgrade g1Premium to g1Pro (scheduled within group 1)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: g1Pro.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: g1Premium.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g2Pro.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g1Pro.id,
		status: "scheduled" as unknown as CusProductStatus,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Downgrade in one group, other group unaffected
// (from mergedGroup2)
//
// Scenario:
// - Group 1: g1Pro ($20), g1Premium ($50)
// - Group 2: g2Pro ($20), g2Premium ($50)
// - Attach g1Premium → attach g2Premium → downgrade g1Premium to g1Pro (scheduled)
//
// Expected:
// - g1Premium active + g2Premium active + g1Pro scheduled
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-group-merged 2: downgrade in one group, other group unaffected")}`, async () => {
	const customerId = "legacy-group-merged-2";

	const wordsItem = items.consumableWords();
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const g1Pro = products.base({
		id: "g1-pro",
		items: [wordsItem, proPrice],
		group: "group-1",
	});
	const g1Premium = products.base({
		id: "g1-premium",
		items: [wordsItem, premiumPrice],
		group: "group-1",
	});
	const g2Pro = products.base({
		id: "g2-pro",
		items: [wordsItem, proPrice],
		group: "group-2",
	});
	const g2Premium = products.base({
		id: "g2-premium",
		items: [wordsItem, premiumPrice],
		group: "group-2",
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [g1Pro, g2Pro, g1Premium, g2Premium] }),
		],
		actions: [s.attach({ productId: g1Premium.id })],
	});

	// Attach g2Premium (different group)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: g2Premium.id,
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: g1Premium.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g2Premium.id,
		status: "active" as unknown as CusProductStatus,
	});

	// Downgrade g1Premium to g1Pro (scheduled, within group 1)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: g1Pro.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({
		customer: customer as any,
		productId: g1Premium.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g2Premium.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: customer as any,
		productId: g1Pro.id,
		status: "scheduled" as unknown as CusProductStatus,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
