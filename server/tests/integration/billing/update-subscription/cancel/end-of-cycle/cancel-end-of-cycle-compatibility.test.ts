/**
 * Cancel End-of-Cycle Compatibility Tests
 *
 * Tests compatibility between the old attach API and the new update subscription API
 * when canceling subscriptions at end of cycle.
 */

import { test } from "bun:test";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel entity EOC via update subscription, then uncancel via attach
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach premium to entity 1
 * - Attach premium to entity 2
 * - Cancel entity 2 end of cycle through update subscription (new API)
 * - Attach premium to entity 2 to see if it uncancels (old API - attach)
 *
 * Expected Result:
 * - After cancel: entity 1 is active, entity 2 is canceling
 * - After attach: entity 1 is active, entity 2 is active (uncanceled)
 */
test.concurrent(`${chalk.yellowBright("cancel EOC compat: cancel entity via update subscription, uncancel via attach")}`, async () => {
	const customerId = "cancel-eoc-compat-uncancel-attach";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const premium = constructProduct({
		id: "premium",
		items: [messagesItem],
		type: "premium",
		isDefault: false,
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premium.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify both entities have premium active
	const entity1Initial = await autumnV1.entities.get(customerId, entity1Id);
	const entity2Initial = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductActive({
		customer: entity1Initial,
		productId: premium.id,
	});
	await expectProductActive({
		customer: entity2Initial,
		productId: premium.id,
	});

	// Step 1: Cancel entity 2 at end of cycle via update subscription (new API)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity2Id,
		product_id: premium.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify entity 1 is active, entity 2 is canceling
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductActive({
		customer: entity1AfterCancel,
		productId: premium.id,
	});
	await expectProductCanceling({
		customer: entity2AfterCancel,
		productId: premium.id,
	});

	// Step 2: Attach premium to entity 2 via old API (should uncancel)
	await autumnV1.attach({
		customer_id: customerId,
		entity_id: entity2Id,
		product_id: premium.id,
	});

	// Verify both entities are now active (entity 2 uncanceled)
	const entity1AfterAttach = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterAttach = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductActive({
		customer: entity1AfterAttach,
		productId: premium.id,
	});
	await expectProductActive({
		customer: entity2AfterAttach,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel entity 2 EOC, then attach pro to entity 1
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach premium to entity 1
 * - Attach premium to entity 2
 * - Cancel entity 2 end of cycle
 * - Then attach pro to entity 1
 *
 * Expected Result:
 * - After cancel: entity 1 has premium active, entity 2 has premium canceling
 * - After attach pro to entity 1: entity 1 has premium canceling and pro scheduled, entity 2 still has premium canceling
 */
test.concurrent(`${chalk.yellowBright("cancel EOC compat: cancel entity 2 EOC, then attach pro to entity 1")}`, async () => {
	const customerId = "cancel-eoc-compat-attach-pro-entity1";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const premium = constructProduct({
		id: "premium",
		items: [messagesItem],
		type: "premium",
		isDefault: false,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premium.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify both entities have premium active
	const entity1Initial = await autumnV1.entities.get(customerId, entity1Id);
	const entity2Initial = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductActive({
		customer: entity1Initial,
		productId: premium.id,
	});
	await expectProductActive({
		customer: entity2Initial,
		productId: premium.id,
	});

	// Step 1: Cancel entity 2 at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity2Id,
		product_id: premium.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify entity 1 has premium active, entity 2 has premium canceling
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductActive({
		customer: entity1AfterCancel,
		productId: premium.id,
	});
	await expectProductCanceling({
		customer: entity2AfterCancel,
		productId: premium.id,
	});

	// Step 2: Attach pro to entity 1 via old API (should downgrade premium to pro)
	await autumnV1.attach({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: pro.id,
	});

	// Verify entity 1 has premium canceling and pro scheduled, entity 2 still has premium canceling
	const entity1AfterAttach = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterAttach = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductCanceling({
		customer: entity1AfterAttach,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity1AfterAttach,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: entity2AfterAttach,
		productId: premium.id,
	});
});
