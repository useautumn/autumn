/**
 * Assignment never bills: a priced license must already be attached at the
 * customer level (normal billing.attach) before licenses.attach accepts it.
 * Free licenses assign without any customer-level product.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("licenses-priced: priced license requires customer-level attach first")}`,
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
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 2,
		});

		await expectAutumnError({
			errMessage: "Attach it to the customer",
			func: async () =>
				await autumnV2_2.post("/licenses.attach", {
					customer_id: customerId,
					entity_id: entities[0].id,
					plan_id: license.id,
				}),
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: license.id,
		});

		const { assignment } = (await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		})) as { assignment: { id: string; ended_at: number | null } };
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
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});
		const { assignment } = (await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		})) as { assignment: { id: string } };
		expect(assignment.id).toBeTruthy();
	},
);
