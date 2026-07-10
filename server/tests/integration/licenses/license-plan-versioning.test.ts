import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { listLicenseLinks } from "./licenseTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("licenses: versioning a parent plan keeps its plan license links")}`,
	async () => {
		const parent = products.base({
			id: "license-version-parent",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const license = {
			...products.base({
				id: "license-version-seat",
				items: [items.monthlyMessages({ includedUsage: 25 })],
			}),
		};

		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-plan-versioning",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
					customize: {
						items: [itemsV2.monthlyMessages({ included: 100 })],
					},
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		const beforeVersioning = await listLicenseLinks({
			autumn: autumnV2_2,
			parentPlanId: parent.id,
		});
		expect(beforeVersioning).toHaveLength(1);

		const parentV1 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		await autumnV2_2.post(`/products/${parent.id}`, {
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const parentV2 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(parentV2.version).toBe(2);
		expect(parentV2.internal_id).not.toBe(parentV1.internal_id);

		const afterVersioning = await listLicenseLinks({
			autumn: autumnV2_2,
			parentPlanId: parent.id,
		});
		expect(afterVersioning).toHaveLength(1);
		expect(afterVersioning[0]).toMatchObject({
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});
		expect(afterVersioning[0].customize?.add_items?.[0].included).toBe(100);
	},
);
