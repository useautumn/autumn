/**
 * TDD test for updating/deleting a license product through the generic
 * product routes (the paths the dashboard save/delete buttons hit).
 *
 * Red-failure mode (current behavior):
 *  - setupUpdateProductContext and deleteProduct resolve the product via
 *    PlanService (catalog_type=plan), so POST/DELETE /products/:id on a
 *    license product throws ProductNotFoundError.
 *
 * Green-success criteria (after fix):
 *  - A license product can be updated and deleted by id like any product;
 *    license guards (e.g. is_default) still apply.
 */

import { expect, test } from "bun:test";
import { ProductCatalogType, type ProductV2 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const makeLicenseProduct = () => ({
	...products.base({
		id: "license-crud",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	}),
	catalog_type: ProductCatalogType.License,
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

		const fetched = (await autumnV2_2.get(
			"/products/license_products",
		)) as { products: ProductV2[] };
		const licenseProduct = fetched.products.find(
			(product) => product.id === license.id,
		);
		expect(licenseProduct?.name).toBe("Seat License Renamed");

		const deletion = (await autumnV2_2.delete(`/products/${license.id}`)) as {
			success: boolean;
		};
		expect(deletion.success).toBe(true);

		const afterDelete = (await autumnV2_2.get(
			"/products/license_products",
		)) as { products: ProductV2[] };
		expect(
			afterDelete.products.some((product) => product.id === license.id),
		).toBe(false);
	},
);
