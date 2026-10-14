import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("plan_schedule: downgrade with immediate override")}`, async () => {
	const customerId = "plan-schedule-downgrade-imm";

	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.consumableWords({ includedUsage: 200 }),
		],
	});

	const premium = products.premium({
		id: "premium",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 1000 }),
			items.consumableWords({ includedUsage: 500 }),
			items.allocatedUsers({ includedUsage: 10 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: "premium" })],
	});

	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("Customer before immediate downgrade:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});

	const downgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		plan_schedule: "immediate",
		redirect_mode: "always",
	});
	console.log("Downgrade preview (with immediate override):", downgradePreview);

	const downgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		plan_schedule: "immediate",
		redirect_mode: "always",
	});
	console.log("Downgrade result (immediate with credit):", downgradeResult);

	const customerAfter = await autumnV1.customers.get(customerId);
	console.log("Customer after immediate downgrade:", {
		products: customerAfter.products?.map(
			(p: { id: string; name: string | null; status: string }) => ({
				id: p.id,
				name: p.name,
				status: p.status,
			}),
		),
	});
});
