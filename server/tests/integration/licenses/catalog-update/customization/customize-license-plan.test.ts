/** Contract: plans.update persists independent, junction-backed license customizations per parent.
 * Unchanged rows are reused and the shared base license stays unchanged. */
import { expect, test } from "bun:test";
import { type ApiPlanV1, BillingInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { getFullLicenseProduct } from "../utils/getFullLicenseProduct.js";

test.concurrent(
	`${chalk.yellowBright("plans.update: customizes one license plan independently per parent")}`,
	async () => {
		const monthlyParent = products.base({
			id: "license-custom-monthly-parent",
			items: [items.dashboard()],
		});
		const annualParent = products.base({
			id: "license-custom-annual-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-custom-dev-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId: "plan-license-parent-customize",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [monthlyParent, annualParent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: monthlyParent.id,
			licenses: [
				{
					license_plan_id: license.id,
					included: 2,
					customize: {
						price: { amount: 20, interval: BillingInterval.Month },
						add_items: [itemsV2.monthlyWords({ included: 100 })],
					},
				},
			],
		});
		await autumnV2_2.post("/plans.update", {
			plan_id: annualParent.id,
			licenses: [
				{
					license_plan_id: license.id,
					included: 5,
					customize: {
						price: { amount: 200, interval: BillingInterval.Year },
					},
				},
			],
		});
		const monthlyApiPlan = (await autumnV2_2.post("/plans.get", {
			plan_id: monthlyParent.id,
		})) as ApiPlanV1;
		expect(monthlyApiPlan.licenses?.[0]?.customize).toMatchObject({
			price: { amount: 20, interval: BillingInterval.Month },
			add_items: [expect.objectContaining({ feature_id: TestFeature.Words })],
		});

		const [monthly, annual, baseLicenseProduct] = await Promise.all([
			getFullLicenseProduct({
				ctx,
				parentPlanId: monthlyParent.id,
				licensePlanId: license.id,
			}),
			getFullLicenseProduct({
				ctx,
				parentPlanId: annualParent.id,
				licensePlanId: license.id,
			}),
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: license.id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		]);
		const [stockEntitlement] = baseLicenseProduct.entitlements;

		// Each catalog link owns its effective definition and capacity.
		expect(monthly.planLicense).toMatchObject({
			is_custom: false,
			customized: true,
			included: 2,
		});
		expect(annual.planLicense).toMatchObject({
			is_custom: false,
			customized: true,
			included: 5,
		});
		expect(monthly.fullLicenseProduct.prices).toContainEqual(
			expect.objectContaining({
				config: expect.objectContaining({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			}),
		);
		expect(annual.fullLicenseProduct.prices).toContainEqual(
			expect.objectContaining({
				config: expect.objectContaining({
					amount: 200,
					interval: BillingInterval.Year,
				}),
			}),
		);

		// The monthly link adds an item without changing the annual link.
		expect(monthly.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Words }),
		);
		expect(annual.fullLicenseProduct.entitlements).not.toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Words }),
		);

		// Unchanged items reuse the license plan's stock rows in both junctions.
		expect(monthly.items.entitlements).toContainEqual(
			expect.objectContaining({ id: stockEntitlement.id }),
		);
		expect(annual.items.entitlements).toContainEqual(
			expect.objectContaining({ id: stockEntitlement.id }),
		);
		expect(monthly.items.prices).toHaveLength(1);
		expect(annual.items.prices).toHaveLength(1);
		expect(monthly.items.prices[0].is_custom).toBe(true);
		expect(annual.items.prices[0].is_custom).toBe(true);

		// Parent customization never mutates the shared base license plan.
		expect(baseLicenseProduct.prices).toHaveLength(0);
		expect(baseLicenseProduct.entitlements).toHaveLength(1);

		await autumnV2_2.post("/plans.update", {
			plan_id: monthlyParent.id,
			licenses: [
				{
					license_plan_id: license.id,
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		});
		const emptyMonthly = await getFullLicenseProduct({
			ctx,
			parentPlanId: monthlyParent.id,
			licensePlanId: license.id,
		});
		expect(emptyMonthly.planLicense.customized).toBe(true);
		expect(emptyMonthly.fullLicenseProduct.entitlements).toHaveLength(0);
		expect(emptyMonthly.items.entitlements).toHaveLength(0);

		await autumnV2_2.post("/plans.update", {
			plan_id: monthlyParent.id,
			licenses: [{ license_plan_id: license.id, customize: null }],
		});
		const inheritedMonthly = await getFullLicenseProduct({
			ctx,
			parentPlanId: monthlyParent.id,
			licensePlanId: license.id,
		});
		expect(inheritedMonthly.planLicense.customized).toBe(false);
		expect(inheritedMonthly.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({ id: stockEntitlement.id }),
		);
	},
);
