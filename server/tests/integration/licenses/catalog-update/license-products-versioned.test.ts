/**
 * A parent pinned to an older license version must still expose the latest license in the catalog.
 */
import { expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("licenses: catalog includes latest license when parent remains pinned to v1")}`,
	async () => {
		const parent = products.base({
			id: "versioned-license-catalog-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "versioned-license-catalog-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const { autumnV2_2 } = await initScenario({
			customerId: "versioned-license-catalog",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 0,
				}),
			],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 50 })],
		});

		const { products: licenseProducts } = (await autumnV2_2.get(
			"/products/license_products",
		)) as { products: ProductV2[] };
		expect(licenseProducts).toContainEqual(
			expect.objectContaining({ id: license.id, version: 2 }),
		);
	},
);
