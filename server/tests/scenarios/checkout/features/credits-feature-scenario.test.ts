import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("attach: credits - credit-based feature")}`, async () => {
	const customerId = "credits-feature";

	const pro = products.pro({
		id: "pro",
		items: [items.dashboard(), items.monthlyCredits({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const creditOptions = [{ feature_id: TestFeature.Credits, quantity: 500 }];

	const attachPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		options: creditOptions,
		redirect_mode: "always",
	});
	console.log("credits attach preview:", attachPreview);

	const attachResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		options: creditOptions,
		redirect_mode: "always",
	});
	console.log("credits attach result:", attachResult);

	const customerAfter = await autumnV1.customers.get(customerId);
	console.log("customer after credits attach:", {
		products: customerAfter.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});
});
