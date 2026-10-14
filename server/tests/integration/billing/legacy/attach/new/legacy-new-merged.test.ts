import { test } from "bun:test";
import type { ApiCustomerV3, CusProductStatus } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { getExpectedInvoiceTotal } from "@tests/utils/expectUtils/expectInvoiceUtils";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("legacy-new-merged 1: merged subs with track and invoice")}`, async () => {
	const customerId = "legacy-new-merged-1";

	const wordsItem = items.consumableWords();
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const value1 = 110000;
	const value2 = 310000;
	const values = [value1, value2];

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1, timeout: 3000 }),
			s.track({
				featureId: TestFeature.Words,
				value: value1,
				entityIndex: 0,
				timeout: 3000,
			}),
			s.track({
				featureId: TestFeature.Words,
				value: value2,
				entityIndex: 1,
				timeout: 3000,
			}),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	let usageTotal = 0;
	for (let i = 0; i < 2; i++) {
		const expectedTotal = await getExpectedInvoiceTotal({
			customerId,
			productId: pro.id,
			usage: [{ featureId: TestFeature.Words, value: values[i] }],
			onlyIncludeUsage: true,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
		usageTotal += expectedTotal;
	}

	const basePrice = getBasePrice({ product: pro });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: basePrice * 2 + usageTotal,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-new-merged 2: scheduled downgrade with 3 entities")}`, async () => {
	const customerId = "legacy-new-merged-3";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const premium = products.premium({ id: "premium", items: [wordsItem] });
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premium.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1 }),
		],
	});

	let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({
		customer: entity1,
		productId: premium.id,
		status: "active" as unknown as CusProductStatus,
	});

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expectProductAttached({
		customer: entity2,
		productId: premium.id,
		status: "active" as unknown as CusProductStatus,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expectProductAttached({
		customer: entity1,
		productId: premium.id,
		status: "active" as unknown as CusProductStatus,
	});
	expectProductAttached({
		customer: entity1,
		productId: pro.id,
		status: "scheduled" as unknown as CusProductStatus,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[2].id,
	});

	const entity3 = await autumnV1.entities.get(customerId, entities[2].id);
	expectProductAttached({
		customer: entity3,
		productId: premium.id,
		status: "active" as unknown as CusProductStatus,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-new-merged 3: multi-product attach and upgrade across groups")}`, async () => {
	const customerId = "legacy-new-merged-multi";

	const proGroup1 = products.base({
		id: "proGroup1",
		group: `${customerId}-g1`,
		items: [items.consumableMessages({ includedUsage: 10 })],
	});
	const premiumGroup1 = products.base({
		id: "premiumGroup1",
		group: `${customerId}-g1`,
		items: [
			items.consumableMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 50 }),
		],
	});

	const proGroup2 = products.base({
		id: "proGroup2",
		group: `${customerId}-g2`,
		items: [items.consumableWords({ includedUsage: 10 })],
	});
	const premiumGroup2 = products.base({
		id: "premiumGroup2",
		group: `${customerId}-g2`,
		items: [
			items.consumableWords({ includedUsage: 10 }),
			items.monthlyPrice({ price: 50 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({
				list: [proGroup1, proGroup2, premiumGroup1, premiumGroup2],
			}),
		],
		actions: [],
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_ids: [proGroup1.id, proGroup2.id],
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({ customer, productId: proGroup1.id });
	expectProductAttached({ customer, productId: proGroup2.id });

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premiumGroup1.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({ customer, productId: premiumGroup1.id });
	expectProductAttached({ customer, productId: proGroup2.id });

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premiumGroup2.id,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectProductAttached({ customer, productId: premiumGroup1.id });
	expectProductAttached({ customer, productId: premiumGroup2.id });
});
