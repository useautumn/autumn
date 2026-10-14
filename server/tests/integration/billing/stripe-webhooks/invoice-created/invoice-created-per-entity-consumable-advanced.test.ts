import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("invoice.created per-entity consumable: no overage - all within included → advance cycle")}`, async () => {
	const customerId = "inv-pe-cons-no-ovg";

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
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.warmEntityCaches(),
			s.track({ featureId: TestFeature.Messages, value: 30, entityIndex: 0 }),
			s.track({ featureId: TestFeature.Messages, value: 70, entityIndex: 1 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 30 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(0);

	const entity2Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 70 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity2Overage).toBe(0);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20,
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

test.concurrent(`${chalk.yellowBright("invoice.created per-entity consumable: decimal usage - sum then round → advance cycle")}`, async () => {
	const customerId = "inv-pe-cons-decimal";

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
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.warmEntityCaches(),
			s.track({
				featureId: TestFeature.Messages,
				value: 150.5,
				entityIndex: 0,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 175.75,
				entityIndex: 1,
			}),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const totalOverage = 12.7;

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
			usage: 0,
		});
	}
});

test.concurrent(`${chalk.yellowBright("invoice.created per-entity consumable: billing units partial - sum then round → advance cycle")}`, async () => {
	const customerId = "inv-pe-cons-partial-round";

	const perEntityConsumable = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		price: 2,
		billingUnits: 25,
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
			s.track({ featureId: TestFeature.Messages, value: 113, entityIndex: 0 }),
			s.track({ featureId: TestFeature.Messages, value: 176, entityIndex: 1 }),
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
			usage: 0,
		});
	}
});
