import { expect, test } from "bun:test";
import type { ApiCustomerV5, MultiAttachParamsV0Input } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

test(`${chalk.yellowBright("multi-attach billing-cycle-anchor: 'now' resets the cycle for every plan on the subscription")}`, async () => {
	const customerId = "ma-billing-cycle-anchor-now";

	const pro = products.pro({
		id: "pro",
		group: "main",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const addOn = products.pro({
		id: "add-on",
		group: "addon",
		items: [items.monthlyWords({ includedUsage: 200 })],
	});

	const { autumnV2_3, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 10 }),
		],
	});

	const multiAttachParams: MultiAttachParamsV0Input = {
		customer_id: customerId,
		plans: [{ plan_id: addOn.id }],
		billing_cycle_anchor: "now",
	};

	await autumnV2_3.billing.multiAttach(multiAttachParams);

	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id, addOn.id],
	});

	// The anchor reset moves the pre-existing plan's cycle too, not just the new one.
	const resetAt = addMonths(advancedTo, 1).getTime();

	await expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 100,
		usage: 0,
		planId: pro.id,
		nextResetAt: resetAt,
	});
	await expectBalanceCorrect({
		customer,
		featureId: TestFeature.Words,
		remaining: 200,
		usage: 0,
		planId: addOn.id,
		nextResetAt: resetAt,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test(`${chalk.yellowBright("multi-attach billing-cycle-anchor: rejected alongside a free trial")}`, async () => {
	const customerId = "ma-billing-cycle-anchor-trial";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const trialParams: MultiAttachParamsV0Input = {
		customer_id: customerId,
		plans: [{ plan_id: pro.id }],
		free_trial: { duration_length: 7 },
		billing_cycle_anchor: "now",
	};

	const attachWithTrial = autumnV2_3.billing.multiAttach(trialParams);

	expect(attachWithTrial).rejects.toThrow(/free trial/);
});
