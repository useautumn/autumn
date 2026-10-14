import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("attach: downgrade - no prepaid to plan with prepaid items")}`, async () => {
	const customerId = "attach-downgrade-to-prepaid";

	const enterprise = products.base({
		id: "enterprise",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.unlimitedMessages(),
			items.consumableWords({ includedUsage: 1000 }),
			items.monthlyPrice({ price: 149 }),
		],
	});

	const pro = products.base({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.prepaidUsers({ includedUsage: 2, billingUnits: 1 }),
			items.monthlyPrice({ price: 49 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [enterprise, pro] }),
		],
		actions: [s.attach({ productId: "enterprise" })],
	});

	const proOptions = [{ feature_id: TestFeature.Users, quantity: 5 }];

	const downgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		options: proOptions,
		redirect_mode: "always",
	});
	console.log("downgrade preview:", downgradePreview);

	const downgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
		options: proOptions,
	});
	console.log("downgrade result:", downgradeResult);
});
