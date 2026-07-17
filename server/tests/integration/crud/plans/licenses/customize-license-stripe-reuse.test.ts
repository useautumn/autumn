/** Contract: adding a feature to a parent-specific license through plans.update preserves the unchanged base price row.
 * The effective customized license reuses the base license's stripe_price_id even though the request carries no internal IDs. */
import { expect, test } from "bun:test";
import { productToBasePrice } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { getFullLicenseProduct } from "./utils/getFullLicenseProduct.js";

test.concurrent(
	`${chalk.yellowBright("plans.update: adding a license feature reuses the base Stripe price")}`,
	async () => {
		const parent = products.base({
			id: "license-stripe-reuse-parent",
			items: [items.dashboard()],
		});
		const devSeat = products.base({
			id: "license-stripe-reuse-seat",
			items: [
				items.monthlyPrice({ price: 10 }),
				items.monthlyMessages({ includedUsage: 100 }),
			],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-stripe-resource-reuse",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, devSeat] }),
			],
			actions: [],
		});
		const baseLicense = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: devSeat.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const basePrice = productToBasePrice({ product: baseLicense });
		expect(basePrice?.config.stripe_price_id).toBeDefined();

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				{
					license_plan_id: devSeat.id,
					customize: {
						add_items: [itemsV2.monthlyWords({ included: 50 })],
					},
				},
			],
		});
		const customized = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: devSeat.id,
		});
		const customizedBasePrice = productToBasePrice({
			product: customized.fullLicenseProduct,
		});

		expect(customized.planLicense.customized).toBe(true);
		expect(customized.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Words, allowance: 50 }),
		);
		expect(customizedBasePrice?.id).toBe(basePrice?.id);
		expect(customizedBasePrice?.config.stripe_price_id).toBe(
			basePrice?.config.stripe_price_id,
		);
		expect(customized.items.prices).toContainEqual(
			expect.objectContaining({
				id: basePrice?.id,
				config: expect.objectContaining({
					stripe_price_id: basePrice?.config.stripe_price_id,
				}),
			}),
		);
	},
);
