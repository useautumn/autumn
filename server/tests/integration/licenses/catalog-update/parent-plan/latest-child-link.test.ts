/**
 * Contract: `plans.update({ licenses })` always resolves a license plan to its latest version.
 * Callers identify the public license plan only; no child-version request parameter exists.
 */
import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { getFullLicenseProduct } from "../utils/getFullLicenseProduct.js";

test.concurrent(
	`${chalk.yellowBright("plans.update: links licenses to the latest child version")}`,
	async () => {
		const childCustomerId = "license-latest-child-link-customer";
		const parent = products.base({
			id: "license-latest-child-link-parent",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-latest-child-link-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: childCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, child] }),
			],
			actions: [s.billing.attach({ productId: child.id })],
		});

		await autumnV2_3.post("/plans.update", {
			plan_id: child.id,
			items: [itemsV2.monthlyMessages({ included: 200 })],
		});
		const childV2 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: child.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(childV2.version).toBe(2);

		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				{
					license_plan_id: child.id,
					included: 0,
				},
			],
		});

		const link = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: child.id,
			licenseVersion: 2,
		});
		expect(link.planLicense).toMatchObject({
			license_internal_product_id: childV2.internal_id,
			customized: false,
		});
		expect(link.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({ allowance: 200 }),
		);
	},
);
