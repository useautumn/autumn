import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectLatestInvoiceCorrect } from "@tests/integration/billing/utils/expectLatestInvoiceCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Multi-Entity Prepaid Quantity Tests
 *
 * These tests verify that prepaid quantity updates work correctly
 * when multiple entities share products or have different products.
 *
 * Key scenarios:
 * - Entity 1 increases quantity while Entity 2 remains unchanged
 * - Entity 2 decreases quantity while Entity 1 remains unchanged
 * - Cross-entity mixed changes (increase one, decrease other)
 * - Different products per entity with quantity updates
 * - Multiple features per entity
 */

// Test 1: Basic Multi-Entity Increase
test.concurrent(`${chalk.yellowBright("multi-entity-quantity: entity 1 increases quantity")}`, async () => {
	const customerId = "multi-ent-qty-increase";
	const billingUnits = 12;
	const pricePerUnit = 8;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const initialQuantity1 = 10 * billingUnits; // 120
	const initialQuantity2 = 5 * billingUnits; // 60
	const newQuantity1 = 20 * billingUnits; // 240

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity1 },
				],
			}),
			s.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity2 },
				],
			}),
		],
	});

	// Preview the upgrade for entity 1
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});

	// Expected: +10 units * $8 = $80
	expect(preview.total).toBe(10 * pricePerUnit);

	// Execute the upgrade
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});

	// Verify entity 1 has new balance
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: newQuantity1,
	});

	// Verify entity 2 is unchanged
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: initialQuantity2,
	});

	// Verify invoice
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: 10 * pricePerUnit,
	});

	// Verify Stripe subscription matches expected state
	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
		options: { subCount: 1 },
	});
});

// Test 2: Basic Multi-Entity Decrease
test.concurrent(`${chalk.yellowBright("multi-entity-quantity: entity 2 decreases quantity")}`, async () => {
	const customerId = "multi-ent-qty-decrease";
	const billingUnits = 12;
	const pricePerUnit = 8;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const initialQuantity1 = 10 * billingUnits; // 120
	const initialQuantity2 = 15 * billingUnits; // 180
	const newQuantity2 = 5 * billingUnits; // 60

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity1 },
				],
			}),
			s.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity2 },
				],
			}),
		],
	});

	// Preview the downgrade for entity 2
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity2 }],
	});

	// Expected: -10 units * $8 = -$80 (credit)
	expect(preview.total).toBe(-10 * pricePerUnit);

	// Execute the downgrade
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity2 }],
	});

	// Verify entity 2 has new balance
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: newQuantity2,
	});

	// Verify entity 1 is unchanged
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: initialQuantity1,
	});

	// Verify credit invoice
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: -10 * pricePerUnit,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// Test 3: Cross-Entity Mixed Changes
test.concurrent(`${chalk.yellowBright("multi-entity-quantity: mixed changes across entities")}`, async () => {
	const customerId = "multi-ent-qty-mixed";
	const billingUnits = 10;
	const pricePerUnit = 5;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const initialQuantity1 = 10 * billingUnits; // 100
	const initialQuantity2 = 20 * billingUnits; // 200
	const newQuantity1 = 15 * billingUnits; // 150 (increase)
	const newQuantity2 = 10 * billingUnits; // 100 (decrease)

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity1 },
				],
			}),
			s.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity2 },
				],
			}),
		],
	});

	// Preview and execute increase for entity 1
	const preview1 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});
	expect(preview1.total).toBe(5 * pricePerUnit); // +5 units * $5

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});

	// Preview and execute decrease for entity 2
	const preview2 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity2 }],
	});
	expect(preview2.total).toBe(-10 * pricePerUnit); // -10 units * $5

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity2 }],
	});

	// Verify final balances
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);

	await expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: newQuantity1,
	});
	await expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: newQuantity2,
	});

	// Verify customer has 4 invoices:
	// 2 from initial attaches + 1 from increase + 1 from decrease (credit)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer,
		count: 4,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// Test 4: Different Products Per Entity (was Test 5)
test.concurrent(`${chalk.yellowBright("multi-entity-quantity: different products per entity")}`, async () => {
	const customerId = "multi-ent-qty-diff-products";
	const billingUnits = 10;

	const prepaidBase = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: 5,
	});

	const prepaidPro = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: 8,
	});

	const baseProduct = products.base({
		id: "base-prepaid",
		items: [prepaidBase],
	});

	const proProduct = products.pro({
		id: "pro-prepaid",
		items: [prepaidPro],
	});

	const initialQuantityBase = 5 * billingUnits; // 50
	const initialQuantityPro = 10 * billingUnits; // 100
	const newQuantityPro = 15 * billingUnits; // 150 (increase)

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [baseProduct, proProduct] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: baseProduct.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantityBase },
				],
			}),
			s.attach({
				productId: proProduct.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantityPro },
				],
			}),
		],
	});

	// Preview upgrade for entity 2 (pro product)
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proProduct.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantityPro }],
	});

	// +5 units * $8 = $40
	expect(preview.total).toBe(5 * 8);

	// Execute the upgrade
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proProduct.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantityPro }],
	});

	// Verify entity 2 (pro) has new balance
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity2,
		productId: proProduct.id,
	});
	await expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: newQuantityPro,
	});

	// Verify entity 1 (base) is unchanged
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity1,
		productId: baseProduct.id,
	});
	await expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: initialQuantityBase,
	});

	// Verify invoice
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectLatestInvoiceCorrect({
		customer,
		productId: proProduct.id,
		amount: 5 * 8,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// Test 5: Multiple Features Per Entity (was Test 6)
test.concurrent(`${chalk.yellowBright("multi-entity-quantity: multiple features per entity")}`, async () => {
	const customerId = "multi-ent-qty-multi-feat";
	const messagesBillingUnits = 10;
	const wordsBillingUnits = 100;
	const messagesPrice = 5;
	const wordsPrice = 10;

	const messagesItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits: messagesBillingUnits,
		price: messagesPrice,
	});

	const wordsItem = items.prepaid({
		featureId: TestFeature.Words,
		billingUnits: wordsBillingUnits,
		price: wordsPrice,
	});

	const product = products.base({
		id: "multi-feature",
		items: [messagesItem, wordsItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: 5 * messagesBillingUnits,
					},
					{ feature_id: TestFeature.Words, quantity: 2 * wordsBillingUnits },
				],
			}),
			s.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: 10 * messagesBillingUnits,
					},
					{ feature_id: TestFeature.Words, quantity: 5 * wordsBillingUnits },
				],
			}),
		],
	});

	// Update entity 1: increase messages (+5 units), decrease words (-1 unit)
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 10 * messagesBillingUnits,
			}, // +5 units
			{ feature_id: TestFeature.Words, quantity: 1 * wordsBillingUnits }, // -1 unit
		],
	});

	// Expected: +5 * $5 - 1 * $10 = $25 - $10 = $15
	expect(preview.total).toBe(5 * messagesPrice - 1 * wordsPrice);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 10 * messagesBillingUnits,
			},
			{ feature_id: TestFeature.Words, quantity: 1 * wordsBillingUnits },
		],
	});

	// Verify entity 1 features
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: 100,
	});
	await expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Words,
		balance: 100,
	});

	// Verify entity 2 is unchanged
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: 100,
	});
	await expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Words,
		balance: 500,
	});

	// Verify invoice
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: 5 * messagesPrice - 1 * wordsPrice,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
