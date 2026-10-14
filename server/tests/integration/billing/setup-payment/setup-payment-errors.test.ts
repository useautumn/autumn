import { test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("setup-payment error: invalid plan_id")}`, async () => {
	const customerId = "setup-pay-err-invalid-plan";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.setupPayment({
				customer_id: customerId,
				plan_id: "nonexistent-plan-id",
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("setup-payment error: customer already has plan")}`, async () => {
	const customerId = "setup-pay-err-duplicate-plan";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

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
			await autumnV1.billing.setupPayment({
				customer_id: customerId,
				plan_id: pro.id,
			});
		},
	});
});
