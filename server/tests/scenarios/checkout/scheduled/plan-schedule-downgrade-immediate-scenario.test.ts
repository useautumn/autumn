import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Plan Schedule: Downgrade with Immediate Override
 *
 * Demonstrates forcing a downgrade to happen immediately instead of scheduled.
 * By default, downgrades are scheduled for end of billing cycle.
 * Using plan_schedule: "immediate" forces the downgrade to happen right away
 * with prorated credit for the unused portion of the current plan.
 *
 * Customer on Premium ($50/mo) → Pro ($20/mo) with plan_schedule: "immediate"
 */

test(`${chalk.yellowBright("plan_schedule: downgrade with immediate override")}`, async () => {
	const customerId = "plan-schedule-downgrade-imm";

	// Pro plan ($20/mo)
	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.consumableWords({ includedUsage: 200 }),
		],
	});

	// Premium plan ($50/mo)
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

	// Setup: customer with payment method and premium plan attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: "premium" })],
	});

	// Get customer state before downgrade
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("Customer before immediate downgrade:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});

	// 1. Preview the downgrade with plan_schedule: "immediate"
	// This forces the downgrade to happen now instead of at cycle end
	const downgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		plan_schedule: "immediate",
		redirect_mode: "always",
	});
	console.log("Downgrade preview (with immediate override):", downgradePreview);

	// 2. Perform the downgrade with plan_schedule: "immediate" and redirect_mode: "always" (Autumn checkout URL)
	const downgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		plan_schedule: "immediate",
		redirect_mode: "always",
	});
	console.log("Downgrade result (immediate with credit):", downgradeResult);

	// Get customer state after - should now have Pro immediately
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
