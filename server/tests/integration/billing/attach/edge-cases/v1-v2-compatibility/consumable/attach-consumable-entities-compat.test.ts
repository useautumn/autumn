import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("attach consumable compat: v1 entity + v2 entity → both charged correctly")}`, async () => {
	const customerId = "attach-compat-v1v2-entities";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 1 }),
			s.billing.attach({ productId: pro.id, entityIndex: 0, timeout: 4000 }),

			s.track({ featureId: TestFeature.Messages, value: 200, entityIndex: 0 }),
			s.track({ featureId: TestFeature.Messages, value: 350, entityIndex: 1 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(entity1Overage).toBe(10);

	const entity2Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 350 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(entity2Overage).toBe(25);

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 3,
		latestTotal: entity1Overage + entity2Overage + 20 * 2,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expect(entity1.features[TestFeature.Messages].balance).toBe(100);
	await expectProductActive({ customer: entity1, productId: pro.id });

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expect(entity2.features[TestFeature.Messages].balance).toBe(100);
	await expectProductActive({ customer: entity2, productId: pro.id });
});

test.concurrent(`${chalk.yellowBright("attach consumable compat: v2 entity + v1 entity → both charged correctly")}`, async () => {
	const customerId = "attach-compat-v2ent-v1ent";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1, timeout: 4000 }),
			s.track({ featureId: TestFeature.Messages, value: 250, entityIndex: 0 }),
			s.track({ featureId: TestFeature.Messages, value: 180, entityIndex: 1 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 250 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(15);

	const entity2Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 180 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity2Overage).toBe(8);

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 3,
		latestTotal: entity1Overage + entity2Overage + 20 * 2,
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expect(entity1.features[TestFeature.Messages].balance).toBe(100);
	await expectProductActive({ customer: entity1, productId: pro.id });

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expect(entity2.features[TestFeature.Messages].balance).toBe(100);
	await expectProductActive({ customer: entity2, productId: pro.id });

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

test.concurrent(`${chalk.yellowBright("attach consumable compat: v2 Pro entity + v1 Premium entity → both charged correctly")}`, async () => {
	const customerId = "attach-compat-v2pro-v1prem";

	const proConsumable = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		price: 1,
		billingUnits: 10,
	});

	const premiumConsumable = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage: 200,
		price: 2,
		billingUnits: 25,
	});

	const pro = products.pro({
		id: "pro",
		items: [proConsumable],
	});

	const premium = products.base({
		id: "premium",
		items: [premiumConsumable, items.monthlyPrice({ price: 50 })],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1, timeout: 4000 }),
			s.track({ featureId: TestFeature.Messages, value: 175, entityIndex: 0 }),
			s.track({ featureId: TestFeature.Messages, value: 289, entityIndex: 1 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 175 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(8);

	const entity2Overage = calculateExpectedInvoiceAmount({
		items: premium.items,
		usage: [{ featureId: TestFeature.Messages, value: 289 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity2Overage).toBe(8);

	const entity1Final = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({ customer: entity1Final, productId: pro.id });
	expect(entity1Final.features[TestFeature.Messages].balance).toBe(100);

	const entity2Final = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({ customer: entity2Final, productId: premium.id });
	expect(entity2Final.features[TestFeature.Messages].balance).toBe(200);

	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 3,
		latestTotal: 20 + 50 + entity1Overage + entity2Overage,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});
