import { test } from "bun:test";
import {
	type ApiEntityV0,
	CusProductStatus,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductItemCorrect } from "@tests/integration/billing/utils/expectProductItemCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("legacy-entities: prepaid quantity increase and decrease")}`, async () => {
	const customerId = "legacy-ent-qty-ops";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Credits,
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const entity1InitialV1 = billingUnits * 4;
	const entity1UpgradedV1 = billingUnits * 5;
	const entity1UpgradedTotal = includedUsage + entity1UpgradedV1;
	const entity2InitialV1 = billingUnits * 3;
	const entity2InitialTotal = includedUsage + entity2InitialV1;
	const entity2DowngradedV1 = billingUnits * 1;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity1InitialV1 },
				],
			}),
			s.attach({
				productId: pro.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity2InitialV1 },
				],
			}),
		],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: "ent-1",
		options: [{ feature_id: TestFeature.Credits, quantity: entity1UpgradedV1 }],
	});

	await new Promise((resolve) => setTimeout(resolve, 5000));

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: "ent-2",
		options: [
			{ feature_id: TestFeature.Credits, quantity: entity2DowngradedV1 },
		],
	});

	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		"ent-1",
	);
	await expectProductActive({ customer: entity1After, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Credits,
		includedUsage: entity1UpgradedTotal,
		balance: entity1UpgradedTotal,
		usage: 0,
	});

	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		"ent-2",
	);
	await expectProductActive({ customer: entity2After, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Credits,
		includedUsage: entity2InitialTotal,
		balance: entity2InitialTotal,
		usage: 0,
	});

	await expectProductItemCorrect({
		customer: entity2After,
		productId: pro.id,
		featureId: TestFeature.Credits,
		quantity: entity2InitialV1,
		upcomingQuantity: entity2DowngradedV1,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: "ent-1",
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		entityId: "ent-2",
	});
});

test.concurrent(`${chalk.yellowBright("legacy-entities 2: prepaid decrease + test clock advancement")}`, async () => {
	const customerId = "legacy-ent-qty-decrease-cycle";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Credits,
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None,
		},
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const entity1InitialV1 = billingUnits * 4;
	const entity1DecreasedV1 = billingUnits * 2;
	const entity2InitialV1 = billingUnits * 3;
	const entity2DecreasedV1 = billingUnits * 1;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity1InitialV1 },
				],
			}),
			s.attach({
				productId: pro.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity2InitialV1 },
				],
			}),
		],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: "ent-1",
		options: [
			{ feature_id: TestFeature.Credits, quantity: entity1DecreasedV1 },
		],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: "ent-2",
		options: [
			{ feature_id: TestFeature.Credits, quantity: entity2DecreasedV1 },
		],
	});

	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		"ent-1",
	);
	expectCustomerFeatureCorrect({
		customer: entity1Before,
		featureId: TestFeature.Credits,
		includedUsage: includedUsage + entity1InitialV1,
		balance: includedUsage + entity1InitialV1,
		usage: 0,
	});

	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		"ent-2",
	);
	expectCustomerFeatureCorrect({
		customer: entity2Before,
		featureId: TestFeature.Credits,
		includedUsage: includedUsage + entity2InitialV1,
		balance: includedUsage + entity2InitialV1,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-entities 3: prepaid downgrade Premium → Pro with entities")}`, async () => {
	const customerId = "legacy-ent-prepaid-downgrade";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Credits,
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const premium = products.premium({
		id: "premium",
		items: [prepaidItem],
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const entity1InitialV1 = billingUnits * 4;
	const entity1DowngradeV1 = billingUnits * 2;
	const entity2InitialV1 = billingUnits * 3;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: premium.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity1InitialV1 },
				],
			}),
			s.attach({
				productId: premium.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity2InitialV1 },
				],
			}),
		],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: "ent-1",
		options: [
			{ feature_id: TestFeature.Credits, quantity: entity1DowngradeV1 },
		],
	});

	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		"ent-1",
	);
	expectProductAttached({
		customer: entity1After,
		productId: premium.id,
		isCanceled: true,
	});
	expectProductAttached({
		customer: entity1After,
		productId: pro.id,
		status: CusProductStatus.Scheduled,
	});

	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		"ent-2",
	);
	await expectProductActive({
		customer: entity2After,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
