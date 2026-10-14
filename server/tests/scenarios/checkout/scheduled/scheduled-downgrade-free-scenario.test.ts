import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("attach: scheduled downgrade - pro to free")}`, async () => {
	const customerId = "scheduled-downgrade-free";

	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.consumableWords({ includedUsage: 200 }),
		],
	});

	const free = products.base({
		id: "free",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 50 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before scheduled downgrade to free:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});

	const downgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `free_${customerId}`,
		redirect_mode: "always",
	});
	console.log("scheduled downgrade to free preview:", downgradePreview);

	const downgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `free_${customerId}`,
		redirect_mode: "always",
	});
	console.log("scheduled downgrade to free result:", downgradeResult);

	const customerAfter = await autumnV1.customers.get(customerId);
	console.log("customer after scheduled downgrade:", {
		products: customerAfter.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});
});
