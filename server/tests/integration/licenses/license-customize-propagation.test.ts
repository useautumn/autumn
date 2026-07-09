/**
 * Customized links reference live base rows for untouched items (cusProduct-
 * style membership), so base edits propagate while overridden items stay
 * frozen. The base-price propagation observation (overflow seat billed at the
 * edited price) is parked with overflow re-enable in
 * LICENSE_BILLING_TEST_PLAN.md; this pins the surviving surfaces: the derived
 * customize response and the provisioned seat's grant.
 */

import { expect, test } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("licenses customize propagation: base price edit leaves the customized link's override intact")}`,
	async () => {
		const parent = products.base({
			id: "cust-prop-parent",
			items: [items.dashboard()],
		});
		const license = products.pro({
			id: "cust-prop-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
			group: "cust-prop-licenses",
		});

		const { customerId, entities, autumnV1, autumnV2_2 } = await initScenario({
			customerId: "license-customize-propagation",
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
			included: 1,
			customize: {
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 50,
						reset: { interval: "month" },
					},
				],
			},
		});

		await autumnV1.products.update(license.id, {
			items: [
				items.monthlyPrice({ price: 30 }),
				items.monthlyMessages({ includedUsage: 25 }),
			],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: license.id,
		});
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		const seatCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(seatCheck.allowed).toBe(true);
		expect(seatCheck.balance?.granted).toBe(75);

		const links = (await autumnV2_2.post("/licenses.list_links", {
			parent_plan_id: parent.id,
		})) as {
			list: {
				customize: {
					add_items?: { feature_id?: string; included?: number }[];
				} | null;
			}[];
		};
		const customizedItem = links.list[0].customize?.add_items?.find(
			(item) => item.feature_id === TestFeature.Messages,
		);
		expect(customizedItem?.included).toBe(50);
	},
);
