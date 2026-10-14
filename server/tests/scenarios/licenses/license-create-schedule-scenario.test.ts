import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("scenario: create schedule with a license-backed plan")}`, async () => {
	const starter = products.base({
		id: "schedule-starter",
		items: [items.monthlyPrice({ price: 20 })],
	});
	const enterprise = products.base({
		id: "schedule-enterprise",
		items: [items.monthlyPrice({ price: 250 }), items.dashboard()],
	});
	const teamSeat = products.base({
		id: "team-seat",
		items: [
			items.monthlyPrice({ price: 30 }),
			items.monthlyMessages({ includedUsage: 500 }),
		],
	});

	await initScenario({
		customerId: "license-create-schedule",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
			s.products({ list: [starter, enterprise, teamSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: enterprise.id,
				licenseProductId: teamSeat.id,
				included: 2,
			}),
			s.billing.attach({ productId: starter.id }),
		],
	});
});
