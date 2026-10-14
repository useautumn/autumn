import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("auto-resolve: cancel without filter targets paid recurring main")}`, async () => {
	const customerId = "auto-resolve-cancel-main";
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

	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		cancel_action: "cancel_end_of_cycle",
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	const mainSub = customer.subscriptions.find((sub) => sub.id === "main-sub");
	const addonSub = customer.subscriptions.find((sub) => sub.id === "addon-sub");

	expect(mainSub).toBeDefined();
	expect(addonSub).toBeDefined();

	expect(mainSub!.canceled_at).not.toBeNull();
	expect(addonSub!.canceled_at).toBeNull();

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("auto-resolve: feature_quantities targets product with matching prepaid features")}`, async () => {
	const customerId = "auto-resolve-qty-match";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({ items: [messagesItem] });
	const addon = products.recurringAddOn({
		id: "addon",
		items: [prepaidItem],
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
			{
				plan_id: addon.id,
				subscription_id: "addon-sub",
				feature_quantities: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
				],
			},
		],
	});

	await autumnV2_1.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});

	const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);

	const messagesBalance = customer.balances[TestFeature.Messages];
	expect(messagesBalance).toBeDefined();
	expect(messagesBalance.remaining).toBe(300);

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
