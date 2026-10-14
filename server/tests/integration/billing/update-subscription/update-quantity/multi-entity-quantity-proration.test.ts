import { expect, test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { calculateProratedDiff } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const BILLING_UNITS = 10;
const PRICE_PER_UNIT = 5;
const INCLUDED_USAGE = 20;

test.concurrent(`${chalk.yellowBright("multi-entity-proration: ProrateNextCycle increase — balance now, billing deferred")}`, async () => {
	const customerId = "multi-ent-proration-increase";

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
		includedUsage: INCLUDED_USAGE,
		config: {
			on_increase: OnIncrease.ProrateNextCycle,
			on_decrease: OnDecrease.ProrateNextCycle,
		},
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const initialQuantity1 = 10 * BILLING_UNITS;
	const initialQuantity2 = 5 * BILLING_UNITS;
	const newQuantity1 = 20 * BILLING_UNITS;
	const entity1OldCost =
		((initialQuantity1 - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT;
	const entity1NewCost =
		((newQuantity1 - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT;
	const entity2Cost =
		((initialQuantity2 - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT;
	const renewalAmount = entity1NewCost + entity2Cost;

	const { autumnV1, ctx, entities, testClockId, advancedTo } =
		await initScenario({
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
							quantity: initialQuantity1,
						},
					],
				}),
				s.billing.attach({
					productId: product.id,
					entityIndex: 1,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: initialQuantity2,
						},
					],
				}),
			],
		});

	const beforeCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeCustomer.invoices?.length ?? 0;

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});
	expect(preview.total).toBe(0);

	const proratedIncrease = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: entity1OldCost,
		newAmount: entity1NewCost,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: newQuantity1,
	});

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: initialQuantity2,
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const finalizedAfter = afterUpdate.invoices?.filter(
		(inv) => inv.status === "paid" || inv.status === "open",
	);
	expect(finalizedAfter?.length).toBe(invoiceCountBefore);

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const afterCycle = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: afterCycle,
		count: invoiceCountBefore + 1,
		latestStatus: "paid",
		latestTotal: renewalAmount + proratedIncrease,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("multi-entity-proration: ProrateNextCycle decrease — immediate balance, deferred credit")}`, async () => {
	const customerId = "multi-ent-proration-decrease";

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits: BILLING_UNITS,
		price: PRICE_PER_UNIT,
		includedUsage: INCLUDED_USAGE,
		config: {
			on_increase: OnIncrease.ProrateNextCycle,
			on_decrease: OnDecrease.ProrateNextCycle,
		},
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const initialQuantity1 = 20 * BILLING_UNITS;
	const initialQuantity2 = 10 * BILLING_UNITS;
	const newQuantity1 = 5 * BILLING_UNITS;
	const entity1OldCost =
		((initialQuantity1 - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT;
	const entity1NewCost =
		((newQuantity1 - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT;
	const entity2Cost =
		((initialQuantity2 - INCLUDED_USAGE) / BILLING_UNITS) * PRICE_PER_UNIT;
	const renewalAmount = entity1NewCost + entity2Cost;

	const { autumnV1, ctx, entities, testClockId, advancedTo } =
		await initScenario({
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
							quantity: initialQuantity1,
						},
					],
				}),
				s.billing.attach({
					productId: product.id,
					entityIndex: 1,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: initialQuantity2,
						},
					],
				}),
			],
		});

	const beforeCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeCustomer.invoices?.length ?? 0;

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});
	expect(preview.total).toBe(0);

	const proratedCredit = await calculateProratedDiff({
		customerId,
		advancedTo,
		oldAmount: entity1OldCost,
		newAmount: entity1NewCost,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});

	const entity1After = await autumnV1.entities.get(customerId, entities[0].id);
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		balance: newQuantity1,
	});

	const entity2After = await autumnV1.entities.get(customerId, entities[1].id);
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		balance: initialQuantity2,
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: afterUpdate,
		count: invoiceCountBefore,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const entity1PostCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1PostCycle,
		featureId: TestFeature.Messages,
		balance: newQuantity1,
	});

	const entity2PostCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2PostCycle,
		featureId: TestFeature.Messages,
		balance: initialQuantity2,
	});

	const afterCycle = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: afterCycle,
		count: invoiceCountBefore + 1,
		latestStatus: "paid",
		latestTotal: renewalAmount + proratedCredit,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("multi-entity-proration: OnDecrease.None — no credit invoice")}`, async () => {
	const customerId = "multi-ent-proration-no-decrease";
	const billingUnits = 100;
	const pricePerUnit = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
		includedUsage,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const initialQuantity1 = 4 * billingUnits;
	const initialQuantity2 = 3 * billingUnits;
	const newQuantity1 = 2 * billingUnits;
	const entity1NewCost =
		((newQuantity1 - includedUsage) / billingUnits) * pricePerUnit;
	const entity2Cost =
		((initialQuantity2 - includedUsage) / billingUnits) * pricePerUnit;
	const renewalAmount = entity1NewCost + entity2Cost;

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
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
						quantity: initialQuantity1,
					},
				],
			}),
			s.billing.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: initialQuantity2,
					},
				],
			}),
		],
	});

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length ?? 0;

	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: newQuantity1 }],
	});

	const entity1After = await autumnV1.entities.get(customerId, entities[0].id);
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		balance: initialQuantity1,
	});

	const afterUpdate = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: afterUpdate,
		count: invoiceCountBefore,
	});

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: initialQuantity2,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const afterAdvance = await autumnV1.entities.get(customerId, entities[0].id);
	expectCustomerFeatureCorrect({
		customer: afterAdvance,
		featureId: TestFeature.Messages,
		balance: newQuantity1,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: invoiceCountBefore + 1,
		latestTotal: renewalAmount,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("multi-entity-proration: OnDecrease.None — decrease then increase back (net zero)")}`, async () => {
	const customerId = "multi-ent-proration-none-netzero";
	const billingUnits = 100;
	const pricePerUnit = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
		includedUsage,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const product = products.base({
		id: "prepaid",
		items: [prepaidItem],
	});

	const initialQuantity1 = 4 * billingUnits;
	const initialQuantity2 = 3 * billingUnits;
	const entity1Cost =
		((initialQuantity1 - includedUsage) / billingUnits) * pricePerUnit;
	const entity2Cost =
		((initialQuantity2 - includedUsage) / billingUnits) * pricePerUnit;
	const renewalAmount = entity1Cost + entity2Cost;

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
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
						quantity: initialQuantity1,
					},
				],
			}),
			s.billing.attach({
				productId: product.id,
				entityIndex: 1,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: initialQuantity2,
					},
				],
			}),
		],
	});

	const beforeInvoices =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeInvoices.invoices?.length ?? 0;

	const decreasePreview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 2 * billingUnits,
			},
		],
	});
	expect(decreasePreview.total).toBe(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: 2 * billingUnits,
			},
		],
	});

	const entity1AfterDecrease = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1AfterDecrease,
		featureId: TestFeature.Messages,
		balance: initialQuantity1,
	});

	await expectProductItemCorrect({
		customer: entity1AfterDecrease,
		productId: product.id,
		featureId: TestFeature.Messages,
		quantity: initialQuantity1 - includedUsage,
		upcomingQuantity: 2 * billingUnits - includedUsage,
	});

	const afterDecrease = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: afterDecrease,
		count: invoiceCountBefore,
	});

	const increasePreview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: initialQuantity1 }],
	});
	expect(increasePreview.total).toBe(0);

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: initialQuantity1 }],
	});

	const entity1AfterIncrease = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1AfterIncrease,
		featureId: TestFeature.Messages,
		balance: initialQuantity1,
	});

	await expectProductItemCorrect({
		customer: entity1AfterIncrease,
		productId: product.id,
		featureId: TestFeature.Messages,
		quantity: initialQuantity1 - includedUsage,
		upcomingQuantity: 300,
	});

	const afterIncrease = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: afterIncrease,
		count: invoiceCountBefore,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: invoiceCountBefore + 1,
		latestTotal: renewalAmount,
	});

	const entity1PostCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1PostCycle,
		featureId: TestFeature.Messages,
		balance: initialQuantity1,
	});

	const entity2PostCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2PostCycle,
		featureId: TestFeature.Messages,
		balance: initialQuantity2,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
