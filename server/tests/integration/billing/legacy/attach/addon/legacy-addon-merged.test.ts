import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("legacy-addon-merged 1: prepaid add-on across 2 entities")}`, async () => {
	const customerId = "legacy-addon-merged-2ent";
	const billingUnits = 100;

	const creditsItem = items.monthlyCredits({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [creditsItem] });

	const prepaidCredits = items.prepaid({
		featureId: TestFeature.Credits,
		billingUnits,
		price: 10,
	});
	const addOn = products.base({
		id: "addon",
		items: [prepaidCredits],
		isAddOn: true,
	});

	const entity1AddonQty = billingUnits * 3;
	const entity2AddonQty = billingUnits * 5;
	const entity2DecreasedQty = billingUnits * 2;

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addOn] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
			s.attach({
				productId: addOn.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity1AddonQty },
				],
			}),
			s.attach({
				productId: addOn.id,
				entityIndex: 1,
				options: [
					{ feature_id: TestFeature.Credits, quantity: entity2AddonQty },
				],
			}),
		],
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entity1,
		active: [pro.id, addOn.id],
	});

	let entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectCustomerProducts({
		customer: entity2,
		active: [pro.id, addOn.id],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: addOn.id,
		entity_id: entities[1].id,
		options: [
			{ feature_id: TestFeature.Credits, quantity: entity2DecreasedQty },
		],
	});

	entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectCustomerProducts({
		customer: entity2,
		active: [pro.id, addOn.id],
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-addon-merged 2: add-on updates across 3 entities with mixed products")}`, async () => {
	const customerId = "legacy-addon-merged-3ent";
	const billingUnits = 100;

	const creditsItem = items.monthlyCredits({ includedUsage: 100 });
	const premium = products.premium({
		id: "premium",
		items: [creditsItem],
	});
	const pro = products.pro({ id: "pro", items: [creditsItem] });

	const prepaidCredits = items.prepaid({
		featureId: TestFeature.Credits,
		billingUnits,
		price: 10,
	});
	const addOn = products.base({
		id: "addon",
		items: [prepaidCredits],
		isAddOn: true,
	});

	const ent1AddonQty = billingUnits * 3;
	const ent2AddonQty = billingUnits * 5;
	const ent3AddonQty = billingUnits * 3;
	const ent1UpdatedQty = billingUnits * 5;

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, addOn] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premium.id, entityIndex: 0 }),
			s.attach({
				productId: addOn.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Credits, quantity: ent1AddonQty }],
			}),
			s.attach({ productId: premium.id, entityIndex: 1 }),
			s.attach({
				productId: addOn.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Credits, quantity: ent2AddonQty }],
			}),
			s.attach({ productId: pro.id, entityIndex: 2 }),
			s.attach({
				productId: addOn.id,
				entityIndex: 2,
				options: [{ feature_id: TestFeature.Credits, quantity: ent3AddonQty }],
			}),
		],
	});

	for (let i = 0; i < 3; i++) {
		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[i].id,
		);
		const baseProduct = i < 2 ? premium.id : pro.id;
		await expectCustomerProducts({
			customer: entity,
			active: [baseProduct, addOn.id],
		});
	}

	await autumnV1.attach({
		customer_id: customerId,
		product_id: addOn.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Credits, quantity: ent1UpdatedQty }],
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectCustomerProducts({
		customer: entity1,
		active: [premium.id, addOn.id],
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
