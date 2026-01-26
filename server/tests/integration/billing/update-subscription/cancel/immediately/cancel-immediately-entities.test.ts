/**
 * Cancel Immediately Entity Tests
 *
 * Tests for canceling products immediately when multiple entities have separate subscriptions.
 * These tests verify that canceling a free/one-off product on the customer doesn't affect
 * entity subscriptions.
 *
 * Key behaviors:
 * - Canceling free default product on customer doesn't affect entity subscriptions
 * - Canceling one-off product on customer doesn't affect entity subscriptions
 * - No new invoices should be created when canceling free/one-off products
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST A: Cancel free default product - entity subscriptions unchanged
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free default product attached
 * - Entity 1 has pro plan ($20/mo)
 * - Entity 2 has pro plan ($20/mo)
 * - Cancel free default product on customer immediately
 *
 * Expected Result:
 * - Free default product is removed from customer
 * - Entity 1 still has pro plan active
 * - Entity 2 still has pro plan active
 * - Stripe subscription is unchanged (still has both entity items)
 * - No new invoice created (free product has no billing)
 */
test.concurrent(`${chalk.yellowBright("cancel immediately entities: free default product - entity subscriptions unchanged")}`, async () => {
	const customerId = "cancel-imm-entity-free";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach free default to customer (no entity)
			s.attach({ productId: free.id }),
			// Attach pro to both entities
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	// Verify initial state - customer has free, entities have pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [free.id],
	});

	const entity1Before = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity1Before,
		productId: pro.id,
	});

	const entity2Before = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity2Before,
		productId: pro.id,
	});

	// Should have 2 invoices (one for each entity's pro attach)
	expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2,
		latestTotal: 20, // Pro base price
	});

	// Cancel free default product immediately (on customer, not entity)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: free.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for processing
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify customer no longer has free product
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfter,
		productId: free.id,
	});

	// Verify entity 1 still has pro
	const entity1After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity1After,
		productId: pro.id,
	});

	// Verify entity 2 still has pro
	const entity2After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity2After,
		productId: pro.id,
	});

	// No new invoice should have been created (free product cancellation doesn't generate invoices)
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2, // Same as before
	});

	// Stripe subscription should be unchanged
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST B: Cancel one-off product - entity subscriptions unchanged
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has one-off product attached (one-time purchase)
 * - Entity 1 has pro plan ($20/mo)
 * - Entity 2 has pro plan ($20/mo)
 * - Cancel one-off product on customer immediately
 *
 * Expected Result:
 * - One-off product is removed from customer
 * - Entity 1 still has pro plan active
 * - Entity 2 still has pro plan active
 * - Stripe subscription is unchanged (still has both entity items)
 * - No new invoice created (one-off cancellation doesn't generate refund invoices)
 */
test.concurrent(`${chalk.yellowBright("cancel immediately entities: one-off product - entity subscriptions unchanged")}`, async () => {
	const customerId = "cancel-imm-entity-oneoff";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const oneOff = products.oneOff({
		id: "one-off",
		items: [messagesItem],
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach one-off to customer (no entity)
			s.attach({ productId: oneOff.id }),
			// Attach pro to both entities
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	// Verify initial state - customer has one-off, entities have pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [oneOff.id],
	});

	const entity1Before = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity1Before,
		productId: pro.id,
	});

	const entity2Before = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity2Before,
		productId: pro.id,
	});

	// Should have 3 invoices (one for one-off, one for each entity's pro attach)
	expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 3,
		latestTotal: 20, // Pro base price (last attach)
	});

	// Cancel one-off product immediately (on customer, not entity)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: oneOff.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for processing
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify customer no longer has one-off product
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfter,
		productId: oneOff.id,
	});

	// Verify entity 1 still has pro
	const entity1After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity1After,
		productId: pro.id,
	});

	// Verify entity 2 still has pro
	const entity2After = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity2After,
		productId: pro.id,
	});

	// No new invoice should have been created (one-off cancellation doesn't generate invoices)
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 3, // Same as before
	});

	// Stripe subscription should be unchanged
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
