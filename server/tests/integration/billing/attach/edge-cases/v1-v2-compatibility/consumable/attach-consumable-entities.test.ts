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

test.concurrent(`${chalk.yellowBright("attach v2 consumable entity: track decimal overage → advance cycle")}`, async () => {
	const customerId = "attach-v2-cons-ent-decimal";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 250.5 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const expectedOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 250.5 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(expectedOverage).toBe(15.1);

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20 + expectedOverage,
		latestInvoiceProductId: pro.id,
	});

	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

test.concurrent(`${chalk.yellowBright("attach v2 consumable entity: no overage - track within included → advance cycle")}`, async () => {
	const customerId = "attach-v2-cons-ent-no-ovg";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 50 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20,
		latestInvoiceProductId: pro.id,
	});

	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

test.concurrent(`${chalk.yellowBright("attach v2 consumable entity: large overage → advance cycle")}`, async () => {
	const customerId = "attach-v2-cons-ent-large";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 1000 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const expectedOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 1000 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(expectedOverage).toBe(90);

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20 + expectedOverage,
		latestInvoiceProductId: pro.id,
	});

	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

test.concurrent(`${chalk.yellowBright("attach v2 consumable entity: multiple entities → each charged correctly")}`, async () => {
	const customerId = "attach-v2-cons-ent-multi";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1, timeout: 4000 }),
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
	});

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expect(entity1.features[TestFeature.Messages].balance).toBe(100);

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expect(entity2.features[TestFeature.Messages].balance).toBe(100);
});
