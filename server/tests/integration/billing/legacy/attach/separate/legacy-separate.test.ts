/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli";
import { CusService } from "@/internal/customers/CusService";

test.concurrent(`${chalk.yellowBright("legacy-separate 1: separate subs via invoice checkout")}`, async () => {
	const customerId = "legacy-separate-1";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, proPrice],
	});
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const autumnV1_2 = new AutumnInt({ version: LegacyVersion.v1_2 });

	const { entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const res1 = await autumnV1_2.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		entity_id: entities[0].id,
	});
	await completeInvoiceCheckout({ url: res1.checkout_url, ctx, customerId });

	const res2 = await autumnV1_2.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		entity_id: entities[1].id,
	});
	await completeInvoiceCheckout({ url: res2.checkout_url, ctx, customerId });

	const fullCus = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const cusProducts = fullCus.customer_products;
	const entity1Prod = cusProducts.find((cp) => cp.entity_id === entities[0].id);
	const entity2Prod = cusProducts.find((cp) => cp.entity_id === entities[1].id);

	const entity1SubId = entity1Prod?.subscription_ids?.[0];
	const entity2SubId = entity2Prod?.subscription_ids?.[0];

	expect(entity1SubId).toBeDefined();
	expect(entity2SubId).toBeDefined();
	expect(entity1SubId).not.toBe(entity2SubId);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subId: entity1SubId,
	});

	await autumnV1_2.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
	});

	await autumnV1_2.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[1].id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subId: entity1SubId,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subId: entity2SubId,
	});
});

test.concurrent(`${chalk.yellowBright("legacy-separate 2: separate subs via force_checkout + add-on")}`, async () => {
	const customerId = "legacy-separate-2";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proPrice = items.monthlyPrice({ price: 20 });
	const premiumPrice = items.monthlyPrice({ price: 50 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, proPrice],
	});
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPrice],
	});

	const addOnBillingUnits = 100;
	const addOn = products.base({
		id: "credits-addon",
		items: [
			items.prepaid({
				featureId: TestFeature.Credits,
				billingUnits: addOnBillingUnits,
				includedUsage: 0,
				price: 10,
			}),
		],
		isAddOn: true,
	});

	const autumnV1_2 = new AutumnInt({ version: LegacyVersion.v1_2 });

	const { entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, premium, addOn] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const res1 = await autumnV1_2.attach({
		customer_id: customerId,
		product_id: pro.id,
		force_checkout: true,
		entity_id: entities[0].id,
	});
	expect(res1.checkout_url).toBeDefined();
	await completeStripeCheckoutForm({ url: res1.checkout_url });

	const res2 = await autumnV1_2.attach({
		customer_id: customerId,
		product_id: pro.id,
		force_checkout: true,
		entity_id: entities[1].id,
	});
	expect(res2.checkout_url).toBeDefined();
	await completeStripeCheckoutForm({ url: res2.checkout_url });

	let fullCus = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	let cusProducts = fullCus.customer_products;
	const entity1Prod = cusProducts.find((cp) => cp.entity_id === entities[0].id);
	const entity2Prod = cusProducts.find((cp) => cp.entity_id === entities[1].id);

	const entity1SubId = entity1Prod?.subscription_ids?.[0];
	const entity2SubId = entity2Prod?.subscription_ids?.[0];

	expect(entity1SubId).toBeDefined();
	expect(entity2SubId).toBeDefined();
	expect(entity1SubId).not.toBe(entity2SubId);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subId: entity1SubId,
	});

	for (const entity of entities) {
		await autumnV1_2.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entity.id,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subId: entity1SubId!,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subId: entity2SubId!,
		});
	}

	await autumnV1_2.attach({
		customer_id: customerId,
		product_id: addOn.id,
		entity_id: entities[1].id,
		options: [
			{
				feature_id: TestFeature.Credits,
				quantity: addOnBillingUnits * 2,
			},
		],
	});

	fullCus = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	cusProducts = fullCus.customer_products;
	const addOnProd = cusProducts.find((cp) => cp.product.id === addOn.id);

	expect(addOnProd).toBeDefined();
	const addOnSubId = addOnProd?.subscription_ids?.[0];
	expect(addOnSubId).toBe(entity2SubId);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subId: entity2SubId,
	});
});
