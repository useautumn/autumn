import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

const named = <T extends { name: string }>(name: string, plan: T) => ({
	...plan,
	name,
});

test("scenario: schedule playground", async () => {
	const plans = [
		named(
			"Basic Monthly",
			products.base({
				id: "schedule-basic-monthly",
				group: "schedule-playground",
				items: [
					items.monthlyPrice({ price: 20 }),
					items.monthlyMessages({ includedUsage: 1_000 }),
				],
			}),
		),
		named(
			"Standard Monthly",
			products.base({
				id: "schedule-standard-monthly",
				group: "schedule-playground",
				items: [
					items.monthlyPrice({ price: 50 }),
					items.monthlyMessages({ includedUsage: 5_000 }),
					items.dashboard(),
				],
			}),
		),
		named(
			"Advanced Monthly",
			products.base({
				id: "schedule-advanced-monthly",
				group: "schedule-playground",
				items: [
					items.monthlyPrice({ price: 100 }),
					items.monthlyMessages({ includedUsage: 20_000 }),
					items.monthlyUsers({ includedUsage: 10 }),
					items.dashboard(),
				],
			}),
		),
		named(
			"Standard Annual",
			products.base({
				id: "schedule-standard-annual",
				group: "schedule-playground",
				items: [
					items.annualPrice({ price: 500 }),
					items.monthlyMessages({ includedUsage: 5_000 }),
					items.dashboard(),
				],
			}),
		),
		named(
			"Message Add-on",
			products.base({
				id: "schedule-message-addon",
				group: "schedule-playground",
				isAddOn: true,
				items: [
					items.monthlyPrice({ price: 15 }),
					items.monthlyMessages({ includedUsage: 2_000 }),
				],
			}),
		),
		named(
			"Credit Pack",
			products.oneOffAddOn({
				id: "schedule-credit-pack",
				items: [items.oneOffMessages({ billingUnits: 1_000, price: 25 })],
			}),
		),
	];

	await initScenario({
		customerId: "schedule-playground-customer",
		setup: [
			s.customer({
				name: "Schedule Test Customer",
				paymentMethod: "success",
				testClock: false,
			}),
			s.products({ list: plans, prefix: "" }),
		],
		actions: [s.attach({ productId: "schedule-basic-monthly" })],
	});
}, 30_000);
