import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("attach: upgrade - from starter to pro plan")}`, async () => {
	const customerId = "attach-upgrade";

	const starter = products.base({
		id: "starter",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 19 }),
		],
	});

	const pro = products.base({
		id: "pro",
		items: [
			items.consumableWords({ includedUsage: 200 }),
			items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
			items.monthlyPrice({ price: 49 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
		],
		actions: [s.attach({ productId: "starter" })],
	});

	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before upgrade:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});

	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
	});
	console.log("upgrade result:", upgradeResult);
});
