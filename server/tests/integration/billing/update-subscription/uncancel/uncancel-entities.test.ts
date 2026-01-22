import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

/**
 * Uncancel Entity Tests
 *
 * Tests for uncanceling entity-scoped products.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Uncancel single entity while other entity is active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("uncancel entity: other entity active")}`, async () => {
	const customerId = "uncancel-entity-other-active";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({ items: [messagesItem] });

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	// Cancel only entity 1's product
	await autumnV1.cancel({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	// Verify entity 1 is canceling, entity 2 is active
	const entity1AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterCancel,
		productId: pro.id,
	});

	// Uncancel entity 1
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		cancel: null,
	});

	// Verify both entities are now active
	const entity1AfterUncancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterUncancel = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity1AfterUncancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterUncancel,
		productId: pro.id,
	});

	// Verify balances for both entities
	expect(entity1AfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);
	expect(entity2AfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Uncancel all entities
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("uncancel: all entities")}`, async () => {
	const customerId = "uncancel-all-entities";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({ items: [messagesItem] });

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	// Cancel both entities
	await autumnV1.cancel({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});
	await autumnV1.cancel({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});

	// Verify both are canceling
	const entity1AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: entity2AfterCancel,
		productId: pro.id,
	});

	// Uncancel both entities
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		cancel: null,
	});
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
		cancel: null,
	});

	// Verify both are active
	const entity1AfterUncancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterUncancel = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity1AfterUncancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterUncancel,
		productId: pro.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Uncancel entity with scheduled default product
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("uncancel entity: with scheduled default")}`, async () => {
	const customerId = "uncancel-entity-default";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	const pro = products.pro({ items: [messagesItem] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	// Cancel entity's pro - should schedule free default
	await autumnV1.cancel({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	// Verify pro is canceling and free is scheduled
	const entityAfterCancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entityAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: entityAfterCancel,
		productId: free.id,
	});

	// Uncancel the entity's pro
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
		cancel: null,
	});

	// Verify pro is active and free is deleted
	const entityAfterUncancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entityAfterUncancel,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer: entityAfterUncancel,
		productId: free.id,
	});

	// Verify balance
	expect(entityAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});
