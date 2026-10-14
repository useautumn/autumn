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

	const initialQuantity1 = 10 * billingUnits;
	const initialQuantity2 = 5 * billingUnits;
	const newQuantity1 = 20 * billingUnits;

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity1 },
				],
			}),
			s.billing.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity2 },
				],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});

	expect(preview.total).toBe(10 * pricePerUnit);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: newQuantity1,
	});

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: initialQuantity2,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: 10 * pricePerUnit,
	});

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
		options: { subCount: 1 },
	});
});

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

	const initialQuantity1 = 10 * billingUnits;
	const initialQuantity2 = 15 * billingUnits;
	const newQuantity2 = 5 * billingUnits;

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity1 },
				],
			}),
			s.billing.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity2 },
				],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity2 }],
	});

	expect(preview.total).toBe(-10 * pricePerUnit);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity2 }],
	});

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: newQuantity2,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: initialQuantity1,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: -10 * pricePerUnit,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

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

	const initialQuantity1 = 10 * billingUnits;
	const initialQuantity2 = 20 * billingUnits;
	const newQuantity1 = 15 * billingUnits;
	const newQuantity2 = 10 * billingUnits;

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity1 },
				],
			}),
			s.billing.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity2 },
				],
			}),
		],
	});

	const preview1 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});
	expect(preview1.total).toBe(5 * pricePerUnit);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});

	const preview2 = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity2 }],
	});
	expect(preview2.total).toBe(-10 * pricePerUnit);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity2 }],
	});

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

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer,
		count: 4,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

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

	const initialQuantityBase = 5 * billingUnits;
	const initialQuantityPro = 10 * billingUnits;
	const newQuantityPro = 15 * billingUnits;

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [baseProduct, proProduct] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: baseProduct.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantityBase },
				],
			}),
			s.billing.attach({
				productId: proProduct.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantityPro },
				],
			}),
		],
	});

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proProduct.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantityPro }],
	});

	expect(preview.total).toBe(5 * 8);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: proProduct.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantityPro }],
	});

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

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectLatestInvoiceCorrect({
		customer,
		productId: proProduct.id,
		amount: 5 * 8,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

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
			s.billing.attach({
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
			s.billing.attach({
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

	const preview = await autumnV1.subscriptions.previewUpdate({
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

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectLatestInvoiceCorrect({
		customer,
		productId: product.id,
		amount: 5 * messagesPrice - 1 * wordsPrice,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
