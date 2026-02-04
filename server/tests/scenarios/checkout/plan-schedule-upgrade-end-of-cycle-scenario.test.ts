import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Plan Schedule: Upgrade with End of Cycle Override
 *
 * Demonstrates forcing an upgrade to be scheduled instead of immediate.
 * By default, upgrades happen immediately with prorated charges.
 * Using plan_schedule: "end_of_cycle" forces the upgrade to be scheduled
 * for the end of the current billing cycle instead.
 *
 * Customer on Pro ($20/mo) → Premium ($50/mo) with plan_schedule: "end_of_cycle"
 */

test(`${chalk.yellowBright("plan_schedule: upgrade with end_of_cycle override")}`, async () => {
	const customerId = "plan-schedule-upgrade-eoc";

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

	// Setup: customer with payment method and pro plan attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Get customer state before upgrade
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("Customer before scheduled upgrade:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});

	// 1. Preview the upgrade with plan_schedule: "end_of_cycle"
	// This forces the upgrade to be scheduled instead of immediate
	const upgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `premium_${customerId}`,
		plan_schedule: "end_of_cycle",
		redirect_mode: "always",
	});
	console.log("Upgrade preview (with end_of_cycle override):", upgradePreview);

	// 2. Perform the upgrade with plan_schedule: "end_of_cycle" and redirect_mode: "always" (Autumn checkout URL)
	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `premium_${customerId}`,
		plan_schedule: "end_of_cycle",
		redirect_mode: "always",
	});
	console.log("Upgrade result (scheduled for end of cycle):", upgradeResult);

	// Get customer state after - should still have Pro (Premium is scheduled)
	const customerAfter = await autumnV1.customers.get(customerId);
	console.log("Customer after scheduled upgrade:", {
		products: customerAfter.products?.map(
			(p: { id: string; name: string | null; status: string }) => ({
				id: p.id,
				name: p.name,
				status: p.status,
			}),
		),
	});
});
