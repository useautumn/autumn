import { expect, test } from "bun:test";
import { type ApiCustomerV3, CustomerExpand } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("attach: paid add-on with new_billing_subscription mid-cycle")}`, async () => {
	const customerId = "new-billing-sub-addon";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 300 })],
	});

	const addOn = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ weeks: 2 }),
			s.attach({
				productId: addOn.id,
				newBillingSubscription: true,
			}),
		],
	});

	await expectSubCount({ ctx, customerId, count: 2 });

	const customer1 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customer1,
		active: [pro.id, addOn.id],
	});
	expectCustomerInvoiceCorrect({
		customer: customer1,
		count: 2,
		latestTotal: 20,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: addOn.id,
		new_billing_subscription: true,
	});

	await expectSubCount({ ctx, customerId, count: 3 });

	const customer2 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const addOnProduct = customer2.products.find((p) => p.id === addOn.id);
	expect(addOnProduct?.quantity).toBe(2);
	expectCustomerInvoiceCorrect({
		customer: customer2,
		count: 3,
		latestTotal: 20,
	});
});

test.concurrent(`${chalk.yellowBright("attach: entities with new_billing_subscription (separate subs)")}`, async () => {
	const customerId = "new-billing-sub-entities";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 300 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({
				productId: premium.id,
				entityIndex: 0,
				newBillingSubscription: true,
			}),
		],
	});

	await expectSubCount({ ctx, customerId, count: 2 });

	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({ customer: entity1, productId: premium.id });

	await autumnV1.attach({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: premium.id,
		new_billing_subscription: true,
	});

	await expectSubCount({ ctx, customerId, count: 3 });

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({ customer: entity2, productId: premium.id });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		expand: [CustomerExpand.Invoices],
	});
	await expectProductActive({ customer, productId: pro.id });

	const entity1Final = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity1Final,
		productId: premium.id,
	});

	const entity2Final = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity2Final,
		productId: premium.id,
	});
});

test.concurrent(`${chalk.yellowBright("attach: customer upgrade doesn't affect entity separate sub")}`, async () => {
	const customerId = "new-billing-sub-upgrade";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 300 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({
				productId: premium.id,
				entityIndex: 0,
				newBillingSubscription: true,
			}),
		],
	});

	await expectSubCount({ ctx, customerId, count: 2 });

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerBefore, productId: pro.id });

	const entityBefore = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entityBefore,
		productId: premium.id,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfter,
		active: [premium.id],
		notPresent: [pro.id],
	});

	await expectSubCount({ ctx, customerId, count: 2 });

	const entityAfter = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entityAfter,
		productId: premium.id,
	});
	expect(entityAfter.products!.length).toBe(1);

	expect(customerAfter.invoices).toBeDefined();
	expect(customerAfter.invoices!.length).toBeGreaterThanOrEqual(1);
});
