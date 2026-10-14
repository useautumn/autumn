import { test } from "bun:test";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("autumn-checkout: pro trial → premium (no trial) - Trial ends on upgrade")}`, async () => {
	const customerId = "checkout-trial-ends-upgrade";

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 200 })],
		trialDays: 7,
		cardRequired: true,
	});

	const premium = products.premium({
		id: "premium",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 1000 }),
			items.consumableWords({ includedUsage: 500 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premium] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	await expectProductTrialing({
		customerId,
		productId: proTrial.id,
	});

	await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "always",
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "always",
	});
	console.log("upgrade result:", result);
});
