/**
 * License products are plain plans: POST/DELETE /products/:id must work on
 * them like any other product.
 */

import { expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

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
