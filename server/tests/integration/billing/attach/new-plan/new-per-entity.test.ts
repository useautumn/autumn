import { test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("new-per-entity 1: per-entity + customer-level same feature in same product")}`, async () => {
	const customerId = "new-pe-cust-and-entity-same-prod";

	const customerMessages = items.monthlyMessages({ includedUsage: 100 });

	const perEntityMessages = items.monthlyMessages({
		includedUsage: 50,
		entityFeatureId: TestFeature.Users,
	});

	const pro = products.pro({
		id: "pro-mixed",
		items: [customerMessages, perEntityMessages],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, timeout: 4000 }),
			s.track({
				featureId: TestFeature.Messages,
				value: 30,
				entityIndex: 0,
				timeout: 2000,
			}),
		],
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 150,
		balance: 120,
		usage: 30,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 150,
		balance: 150,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 170,
		usage: 30,
	});

	await expectProductActive({
		customer,
		productId: pro.id,
	});
});

test.concurrent(`${chalk.yellowBright("new-per-entity 2: overage sum usage then round to billing units")}`, async () => {
	const customerId = "new-pe-overage-sum-round";

	const perEntityConsumable = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		price: 1.0,
		billingUnits: 10,
		entityFeatureId: TestFeature.Users,
	});
	const pro = products.pro({
		id: "pro-pe-overage",
		items: [perEntityConsumable],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, timeout: 4000 }),
			s.track({
				featureId: TestFeature.Messages,
				value: 155,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 123,
				entityIndex: 1,
				timeout: 2000,
			}),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 28,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("new-per-entity 3: create entity after product attach")}`, async () => {
	const customerId = "new-pe-entity-after-attach";

	const perEntityMessages = items.monthlyMessages({
		includedUsage: 200,
		entityFeatureId: TestFeature.Users,
	});
	const pro = products.pro({
		id: "pro-pe-late-entity",
		items: [perEntityMessages],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, timeout: 4000 }),
			s.track({
				featureId: TestFeature.Messages,
				value: 50,
				entityIndex: 0,
				timeout: 2000,
			}),
		],
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 150,
		usage: 50,
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 150,
		usage: 50,
	});

	const newEntityId = "new-entity-late";
	await autumnV1.entities.create(customerId, [
		{
			id: newEntityId,
			name: "New Entity (Late)",
			feature_id: TestFeature.Users,
		},
	]);

	await new Promise((r) => setTimeout(r, 2000));

	const newEntity = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		newEntityId,
	);
	expectCustomerFeatureCorrect({
		customer: newEntity,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 400,
		balance: 350,
		usage: 50,
	});

	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 20,
	});
});
