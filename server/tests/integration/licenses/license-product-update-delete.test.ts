/**
 * License products are plain plans: POST/DELETE /products/:id must work on
 * them like any other product.
 */

import { expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getLicenseDbState } from "./licenseTestUtils.js";

const makeLicenseProduct = () => ({
	...products.base({
		id: "license-crud",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	}),
});

test.concurrent(
	`${chalk.yellowBright("licenses-crud: license product can be updated and deleted via generic product routes")}`,
	async () => {
		const license = makeLicenseProduct();

		const { autumnV2_2 } = await initScenario({
			customerId: "license-crud-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [license] }),
			],
			actions: [],
		});

		const updated = (await autumnV2_2.post(`/products/${license.id}`, {
			name: "Seat License Renamed",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		})) as ProductV2;
		expect(updated.name).toBe("Seat License Renamed");

		const fetched = (await autumnV2_2.get("/products")) as {
			list: Array<{ id: string; name: string }>;
		};
		const licenseProduct = fetched.list.find(
			(product) => product.id === license.id,
		);
		expect(licenseProduct?.name).toBe("Seat License Renamed");

		const deletion = (await autumnV2_2.delete(`/products/${license.id}`)) as {
			success: boolean;
		};
		expect(deletion.success).toBe(true);

		const afterDelete = (await autumnV2_2.get("/products")) as {
			list: Array<{ id: string }>;
		};
		expect(afterDelete.list.some((product) => product.id === license.id)).toBe(
			false,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-crud: deleting an unused linked license removes the link")}`,
	async () => {
		const parent = products.base({
			id: "delete-linked-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "delete-linked-license",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const { autumnV2_2 } = await initScenario({
			customerId: "license-delete-linked",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});
		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});

		await autumnV2_2.delete(`/products/${license.id}`);

		const { list } = (await autumnV2_2.post("/licenses.list_links", {
			parent_plan_id: parent.id,
		})) as { list: unknown[] };
		expect(list).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-crud: deleting an assigned license rejects without changing state")}`,
	async () => {
		const parent = products.base({
			id: "delete-assigned-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "delete-assigned-license",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-delete-assigned",
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
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});
		const before = await getLicenseDbState({ db: ctx.db, customerId });

		await expect(
			autumnV2_2.delete(`/products/${license.id}`),
		).rejects.toThrow();

		const after = await getLicenseDbState({ db: ctx.db, customerId });
		expect(after.assignments).toEqual(before.assignments);
		expect(after.pools).toEqual(before.pools);
		const productsAfter = (await autumnV2_2.get("/products")) as {
			list: Array<{ id: string }>;
		};
		expect(productsAfter.list.some(({ id }) => id === license.id)).toBe(true);
	},
);
