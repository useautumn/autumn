import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { ErrCode } from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ─── Test 1: Multi-attach same add-on twice with different subscription_ids ───

test.concurrent(`${chalk.yellowBright("multi-attach subscription_id: same add-on twice with different subscription_ids")}`, async () => {
	const customerId = "ma-sub-id-two-addons";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const addon = products.recurringAddOn({
		id: "addon",
		items: [messagesItem],
	});

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [addon] }),
		],
		actions: [],
	});

	// Multi-attach same add-on with different subscription_ids
	await autumnV2_1.billing.multiAttach({
		customer_id: customerId,
		plans: [
			{ plan_id: addon.id, subscription_id: "addon-instance-1" },
			{ plan_id: addon.id, subscription_id: "addon-instance-2" },
		],
	});

	// V2.1 response should show two separate subscription entries (unmerged)
	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expect(customer.subscriptions.length).toBe(2);

	const sub1 = customer.subscriptions.find(
		(sub) => sub.id === "addon-instance-1",
	);
	const sub2 = customer.subscriptions.find(
		(sub) => sub.id === "addon-instance-2",
	);

	expect(sub1).toBeDefined();
	expect(sub2).toBeDefined();
	expect(sub1!.plan_id).toBe(addon.id);
	expect(sub2!.plan_id).toBe(addon.id);
	expect(sub1!.quantity).toBe(1);
	expect(sub2!.quantity).toBe(1);

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ─── Test 3: Multi-attach with duplicate subscription_ids in same request → error ───

test.concurrent(`${chalk.yellowBright("multi-attach subscription_id: duplicate subscription_ids in same request throws error")}`, async () => {
	const customerId = "sub-id-multi-dup";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const addonA = products.recurringAddOn({
		id: "addon-a",
		items: [messagesItem],
	});
	const addonB = products.recurringAddOn({
		id: "addon-b",
		items: [messagesItem],
	});

	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [addonA, addonB] }),
		],
		actions: [],
	});

	// Multi-attach with same subscription_id on both plans
	await expectAutumnError({
		errCode: ErrCode.DuplicateSubscriptionId,
		func: async () => {
			await autumnV2_1.billing.multiAttach({
				customer_id: customerId,
				plans: [
					{ plan_id: addonA.id, subscription_id: "same-key" },
					{ plan_id: addonB.id, subscription_id: "same-key" },
				],
			});
		},
	});
});

// ─── Test 3: Multi-attach different products with subscription_ids ───

test.concurrent(`${chalk.yellowBright("multi-attach subscription_id: different products with subscription_ids")}`, async () => {
	const customerId = "ma-sub-id-diff-products";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });
	const addon = products.recurringAddOn({
		id: "addon",
		items: [messagesItem],
	});

	const { autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	await autumnV2_1.billing.multiAttach({
		customer_id: customerId,
		plans: [
			{ plan_id: pro.id, subscription_id: "main-sub" },
			{ plan_id: addon.id, subscription_id: "addon-sub" },
		],
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	expect(customer.subscriptions.length).toBe(2);

	const mainSub = customer.subscriptions.find((sub) => sub.id === "main-sub");
	const addonSub = customer.subscriptions.find((sub) => sub.id === "addon-sub");

	expect(mainSub).toBeDefined();
	expect(addonSub).toBeDefined();
	expect(mainSub!.plan_id).toBe(pro.id);
	expect(addonSub!.plan_id).toBe(addon.id);

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
