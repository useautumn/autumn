import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("cancel: scheduled product removes pending schedule")}`, async () => {
	const customerId = "cancel-scheduled-product";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPriceItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.attach({ productId: pro.id }),
		],
	});

	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterDowngrade,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerAfterDowngrade,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterCancel,
		active: [premium.id],
		notPresent: [pro.id],
	});
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("error: cancel non-existent product")}`, async () => {
	const customerId = "err-cancel-twice";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	expect(customerAfterCancel.products.length).toBe(0);

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("error: cancel_action with other params")}`, async () => {
	const customerId = "err-cancel-with-params";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
				options: [{ feature_id: "messages", quantity: 200 }],
			});
		},
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
				version: 2,
			});
		},
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
				items: [messagesItem],
			});
		},
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
				free_trial: {
					length: 7,
					duration: FreeTrialDuration.Day,
					card_required: true,
				},
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("error: cannot cancel free product with end_of_cycle")}`, async () => {
	const customerId = "err-cancel-free-eoc";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: free.id,
				cancel_action: "cancel_end_of_cycle",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("error: cannot cancel one-time product with end_of_cycle")}`, async () => {
	const customerId = "err-cancel-onetime-eoc";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const oneTime = products.oneOff({
		id: "onetime",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneTime] }),
		],
		actions: [s.attach({ productId: oneTime.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: oneTime.id,
				cancel_action: "cancel_end_of_cycle",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("error: cannot pass items when cancel is end_of_cycle")}`, async () => {
	const customerId = "err-cancel-eoc-with-items";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
				items: [items.monthlyMessages({ includedUsage: 200 })],
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("error: cannot pass options when cancel is end_of_cycle")}`, async () => {
	const customerId = "err-cancel-eoc-with-options";

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: "messages", quantity: 300 }],
			}),
		],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
				options: [{ feature_id: "messages", quantity: 500 }],
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("error: cannot pass free_trial when cancel is end_of_cycle")}`, async () => {
	const customerId = "err-cancel-eoc-with-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: proTrial.id,
				cancel_action: "cancel_end_of_cycle",
				free_trial: {
					length: 14,
					duration: FreeTrialDuration.Day,
					card_required: true,
				},
			});
		},
	});
});
