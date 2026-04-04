import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductPastDue,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("sub.updated 3: upgrade from premium to ultra while past_due, product stays past_due")}`, async () => {
	const customerId = "sub-updated-past-due-upgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 10 });

	const premium = products.premium({
		id: "premium",
		items: [messagesItem],
	});

	const ultra = products.ultra({
		id: "ultra",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, ultra] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.removePaymentMethod(),
			s.attachPaymentMethod({ type: "fail" }),
			s.advanceTestClock({ toNextInvoice: true }),
		],
	});

	const customerBeforeUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductPastDue({
		customer: customerBeforeUpgrade,
		productId: premium.id,
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: ultra.id,
	});

	const customerAfterUpgrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterUpgrade,
		pastDue: [ultra.id],
		notPresent: [premium.id],
	});
});
