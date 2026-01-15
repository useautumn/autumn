import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

/**
 * Schedules + Free-to-Paid Tests
 *
 * Tests that scheduled changes (cancellations, downgrades) on one entity
 * don't interfere with upgrades on other entities.
 */

// 1. Cancel entity 1, then upgrade entity 2 from free to paid
test.concurrent(`${chalk.yellowBright("schedules-f2p: cancel entity 1, upgrade entity 2")}`, async () => {
	const customerId = "sched-cancel-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: free.id, entityIndex: 1 }),
			s.cancel({ productId: pro.id, entityIndex: 0 }), // Cancel entity 1's pro
		],
	});

	// Verify entity 1 is scheduled for cancellation
	const entity1AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: pro.id,
	});

	// Now upgrade entity 2 from free to paid
	const priceItem = items.monthlyPrice();

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	expect(preview.total).toEqual(20);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	// Verify entity 2 upgraded successfully
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Verify invoices
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer,
		count: 2, // entity1 pro attach + entity2 upgrade
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify state after cycle - entity 1 should be fully canceled
	const entity1AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);

	// Entity 1: pro should be gone (canceled)
	await expectProductNotPresent({
		customer: entity1AfterCycle,
		productId: pro.id,
	});

	// Entity 2: should still have paid product with features
	await expectProductActive({
		customer: entity2AfterCycle,
		productId: free.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity2AfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1, // Only entity 2's subscription remains
	});
});

// 2. Downgrade entity 1 (premium→pro), upgrade entity 2 (free→paid)
test.concurrent(`${chalk.yellowBright("schedules-f2p: downgrade entity 1, upgrade entity 2")}`, async () => {
	const customerId = "sched-downgrade-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	// Premium product ($50/mo)
	const premium = constructProduct({
		id: "premium",
		items: [consumableItem],
		type: "premium",
		isDefault: false,
	});

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: "premium", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
		],
	});

	// Downgrade entity 1 from premium to pro (should schedule)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	// Verify entity 1 has scheduled downgrade
	const entity1AfterDowngrade = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	console.log(
		"Entity 1 products after downgrade:",
		entity1AfterDowngrade.products,
	);

	// Now upgrade entity 2 from free to paid
	const priceItem = items.monthlyPrice();

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	expect(preview.total).toEqual(20);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	// Verify entity 2 upgraded successfully
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Verify invoices
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer,
		count: 2, // entity1 premium + entity2 upgrade
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: entities[1].id,
		subCount: 1,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify state after cycle - entity 1 should be on pro (downgrade completed)
	const entity1AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);

	// Entity 1: premium should be gone, pro should be active
	await expectProductNotPresent({
		customer: entity1AfterCycle,
		productId: premium.id,
	});
	await expectProductActive({ customer: entity1AfterCycle, productId: pro.id });

	// Entity 2: should still have paid product with features
	await expectProductActive({
		customer: entity2AfterCycle,
		productId: free.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity2AfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

// 3. Cancel entity 1 (pro→free scheduled), upgrade entity 2 (free→paid)
// This tests that when pro is canceled, the free default is scheduled as replacement
test.concurrent(`${chalk.yellowBright("schedules-f2p: cancel to default, upgrade entity 2")}`, async () => {
	const customerId = "sched-cancel-default-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Free is the default product
	const free = constructProduct({
		id: "free",
		items: [messagesItem],
		type: "free",
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", withDefault: true }),
			s.products({ list: [free, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "free", entityIndex: 1 }),
			s.cancel({ productId: "pro", entityIndex: 0 }), // Cancel entity 1's pro → free scheduled
		],
	});

	// Verify entity 1 has pro canceled and free scheduled
	const entity1AfterCancel = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: entity1AfterCancel,
		productId: free.id,
	});

	// Now upgrade entity 2 from free to paid
	const priceItem = items.monthlyPrice();

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	expect(preview.total).toEqual(20);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
	});

	// Verify entity 2 upgraded successfully
	const entity2Data = await autumnV1.entities.get(customerId, entities[1].id);

	expectCustomerFeatureCorrect({
		customer: entity2Data,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Verify invoices
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer,
		count: 2, // entity1 pro attach + entity2 upgrade
		latestTotal: 20,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify state after cycle
	const entity1AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);

	// Entity 1: pro should be gone, free should be active
	await expectProductNotPresent({
		customer: entity1AfterCycle,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity1AfterCycle,
		productId: free.id,
	});

	// Entity 2: should still have paid product with features
	await expectProductActive({
		customer: entity2AfterCycle,
		productId: free.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity2AfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});
