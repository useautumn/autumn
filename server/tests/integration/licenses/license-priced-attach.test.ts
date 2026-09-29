import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { assignLicense } from "./licenseTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("licenses-priced: priced license assigns without a customer-level attach")}`,
	async () => {
		const customerId = "license-priced-gate";
		const parent = products.base({
			id: "priced-gate-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "priced-gate-seat",
			items: [items.consumableMessages({ price: 0.1 })],
			group: "priced-gate-licenses",
		});

		const { entities, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 2,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		const assignment = await assignLicense({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
			licensePlanId: license.id,
		});
		expect(assignment.id).toBeTruthy();
		expect(assignment.ended_at).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-priced: free license assigns without a customer-level product")}`,
	async () => {
		const customerId = "license-free-no-gate";
		const parent = products.base({
			id: "free-gate-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "free-gate-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { entities, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});
		const assignment = await assignLicense({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
			licensePlanId: license.id,
		});
		expect(assignment.id).toBeTruthy();
	},
);
