import { test } from "bun:test";
import { ErrCode, FreeTrialDuration } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("next_cycle_only: free to paid upgrade creates the subscription and charges")}`, async () => {
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 50 });
	const freeProduct = products.base({
		id: "free",
		items: [freeMessagesItem],
	});

	const paidMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const paidPriceItem = items.monthlyPrice({ price: 20 });
	const paidProduct = products.base({
		id: "paid",
		items: [paidMessagesItem, paidPriceItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "bb-err-free-to-paid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeProduct, paidProduct] }),
		],
		actions: [s.attach({ productId: "free" })],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: freeProduct.id,
		items: [paidMessagesItem, paidPriceItem],
		billing_behavior: "none",
	});

	await expectProductActive({
		customerId,
		autumn: autumnV1,
		productId: freeProduct.id,
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		autumn: autumnV1,
		count: 1,
		latestTotal: 20,
	});
});

test.concurrent(`${chalk.yellowBright("next_cycle_only error: removing free trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const proTrial = products.base({
		id: "pro-trial",
		items: [messagesItem, priceItem],
		trialDays: 14,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "bb-err-remove-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: proTrial.id,
				free_trial: null,
				billing_behavior: "none",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("next_cycle_only: paid to paid upgrade is allowed")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1 } = await initScenario({
		customerId: "bb-valid-p2p",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const newPriceItem = items.monthlyPrice({ price: 30 });
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
		billing_behavior: "none",
	});
});

test.concurrent(`${chalk.yellowBright("next_cycle_only: extending trial is allowed")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const proTrial = products.base({
		id: "pro-trial",
		items: [messagesItem, priceItem],
		trialDays: 7,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "bb-valid-extend-trial",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
		},
		billing_behavior: "none",
	});
});
