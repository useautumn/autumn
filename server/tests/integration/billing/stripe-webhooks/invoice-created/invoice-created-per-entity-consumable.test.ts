import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("invoice.created per-entity consumable: 3 entities with varying overage → advance cycle")}`, async () => {
	const customerId = "inv-pe-cons-3ent";

	const perEntityConsumable = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});

	const pro = products.pro({
		id: "pro",
		items: [perEntityConsumable],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.warmEntityCaches(),
			s.track({ featureId: TestFeature.Messages, value: 150, entityIndex: 0 }),
			s.track({ featureId: TestFeature.Messages, value: 250, entityIndex: 1 }),
			s.track({ featureId: TestFeature.Messages, value: 350, entityIndex: 2 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 150 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(5);

	const entity2Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 250 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity2Overage).toBe(15);

	const entity3Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 350 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity3Overage).toBe(25);

	const totalOverage = entity1Overage + entity2Overage + entity3Overage;
	expect(totalOverage).toBe(45);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20 + totalOverage,
	});

	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);
		await expectProductActive({
			customer: entityData,
			productId: pro.id,
		});
		expectCustomerFeatureCorrect({
			customer: entityData,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});
	}

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100 * 3,
		balance: 100 * 3,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("invoice.created per-entity consumable: billing units - sum then round → advance cycle")}`, async () => {
	const customerId = "inv-pe-cons-billing-units";

	const perEntityConsumable = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		price: 1,
		billingUnits: 10,
		entityFeatureId: TestFeature.Users,
	});

	const pro = products.pro({
		id: "pro",
		items: [perEntityConsumable],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.warmEntityCaches(),
			s.track({ featureId: TestFeature.Messages, value: 155, entityIndex: 0 }),
			s.track({ featureId: TestFeature.Messages, value: 123, entityIndex: 1 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const totalOverage = 8;

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20 + totalOverage,
	});

	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);
		expectCustomerFeatureCorrect({
			customer: entityData,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
		});
	}
});

test.concurrent(`${chalk.yellowBright("invoice.created per-entity consumable: mixed usage - some in overage, some within included")}`, async () => {
	const customerId = "inv-pe-cons-mixed";

	const perEntityConsumable = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});

	const pro = products.pro({
		id: "pro",
		items: [perEntityConsumable],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.warmEntityCaches(),
			s.track({ featureId: TestFeature.Messages, value: 50, entityIndex: 0 }),
			s.track({ featureId: TestFeature.Messages, value: 100, entityIndex: 1 }),
			s.track({ featureId: TestFeature.Messages, value: 200, entityIndex: 2 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 50 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(0);

	const entity2Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 100 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity2Overage).toBe(0);

	const entity3Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity3Overage).toBe(10);
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20 + 10,
	});

	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);
		expectCustomerFeatureCorrect({
			customer: entityData,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});
	}
});
