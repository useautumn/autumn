import { test } from "bun:test";

import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("attach: downgrade - from pro to starter plan")}`, async () => {
	const customerId = "attach-downgrade";

	const starter = products.base({
		id: "starter",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 19 }),
		],
	});

	const pro = products.base({
		id: "pro",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.consumableWords({ includedUsage: 200 }),
			items.prepaidUsers({ includedUsage: 3, billingUnits: 1 }),
			items.monthlyPrice({ price: 49 }),
		],
	});

	const proOptions = [{ feature_id: TestFeature.Users, quantity: 5 }];

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
		],
		actions: [s.attach({ productId: "pro", options: proOptions })],
	});

	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before downgrade:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});

	const downgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `starter_${customerId}`,
		redirect_mode: "always",
	});
	console.log("downgrade preview:", downgradePreview);

	const downgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `starter_${customerId}`,
		redirect_mode: "always",
	});
	console.log("downgrade result:", downgradeResult);
});
