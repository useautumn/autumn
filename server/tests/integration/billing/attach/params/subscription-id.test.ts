import { expect, test } from "bun:test";
import {
	type ApiCustomer,
	type ApiCustomerV3,
	type ApiCustomerV5,
	type AttachParamsV1Input,
	ErrCode,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("subscription_id: attach with subscription_id returns id in response")}`, async () => {
	const customerId = "sub-id-attach-basic";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await autumnV2_1.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		subscription_id: "my-custom-sub-id",
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expect(customer.subscriptions.length).toBe(1);
	expect(customer.subscriptions[0].id).toBe("my-custom-sub-id");
	expect(customer.subscriptions[0].plan_id).toBe(pro.id);
	await expectCustomerProducts({ customer, active: [pro.id] });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("subscription_id: attach without subscription_id uses internal id")}`, async () => {
	const customerId = "sub-id-attach-fallback";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await autumnV2_1.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expect(customer.subscriptions.length).toBe(1);
	expect(customer.subscriptions[0].id).toBeTruthy();
	expect(customer.subscriptions[0].id).toStartWith("cus_prod_");
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("subscription_id: attach same add on twice with different subscription_ids")}`, async () => {
	const customerId = "sub-id-attach-same-add-on-twice";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const monthlyPrice = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		items: [messagesItem, monthlyPrice],
		isAddOn: true,
	});

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				subscriptionId: "custom-sub-id-1",
			}),
			s.billing.attach({
				productId: pro.id,
				subscriptionId: "custom-sub-id-2",
			}),
		],
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expect(customer.subscriptions.length).toBe(2);

	const findSubId1 = customer.subscriptions.find(
		(sub) => sub.id === "custom-sub-id-1",
	);
	const findSubId2 = customer.subscriptions.find(
		(sub) => sub.id === "custom-sub-id-2",
	);
	expect(findSubId1).toBeDefined();
	expect(findSubId2).toBeDefined();
	expect(findSubId1!.plan_id).toBe(pro.id);
	expect(findSubId2!.plan_id).toBe(pro.id);
	expect(findSubId1!.quantity).toBe(1);
	expect(findSubId2!.quantity).toBe(1);

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("subscription_id: duplicate subscription_id on same customer throws error")}`, async () => {
	const customerId = "sub-id-duplicate";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });
	const addon = products.recurringAddOn({
		id: "addon",
		items: [messagesItem],
	});

	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	await autumnV2_1.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		subscription_id: "key-1",
	});

	await expectAutumnError({
		errCode: ErrCode.DuplicateSubscriptionId,
		func: async () => {
			await autumnV2_1.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: addon.id,
				subscription_id: "key-1",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("subscription_id compat: V2.1 unmerged vs V2.0/V1.2 merged")}`, async () => {
	const customerId = "sub-id-compat-merge";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const addon = products.recurringAddOn({
		id: "addon",
		items: [messagesItem],
	});

	const { autumnV1, autumnV2, autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [addon] }),
		],
		actions: [],
	});

	await autumnV2_1.billing.multiAttach({
		customer_id: customerId,
		plans: [
			{ plan_id: addon.id, subscription_id: "inst-1" },
			{ plan_id: addon.id, subscription_id: "inst-2" },
		],
	});

	const customerV2_1 =
		await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expect(customerV2_1.subscriptions.length).toBe(2);
	const ids = customerV2_1.subscriptions.map((sub) => sub.id).sort();
	expect(ids).toEqual(["inst-1", "inst-2"]);

	const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);

	expect(customerV2.subscriptions.length).toBe(1);
	expect(customerV2.subscriptions[0].quantity).toBe(2);
	expect("id" in customerV2.subscriptions[0]).toBe(false);

	const customerV1 = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const addonProducts = (customerV1.products ?? []).filter(
		(p) => p.id === addon.id,
	);
	expect(addonProducts.length).toBe(1);
	expect(addonProducts[0].quantity).toBe(2);
});
