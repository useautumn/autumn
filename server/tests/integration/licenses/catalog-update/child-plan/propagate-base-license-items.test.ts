/** Base add/update/remove operations rebase customized catalog links.
 * Custom rows persist while inherited refs follow the current base rows. */
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
	`${chalk.yellowBright("plans.update: propagates base license items through customized parent links")}`,
	async () => {
		const monthlyParent = products.base({
			id: "license-propagation-monthly-parent",
			items: [items.dashboard()],
		});
		const annualParent = products.base({
			id: "license-propagation-annual-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-propagation-dev-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId: "base-license-item-propagation",
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
					customize: {
						price: { amount: 20, interval: BillingInterval.Month },
					},
				},
			],
		});
		await autumnV2_2.post("/plans.update", {
			plan_id: annualParent.id,
			licenses: [
				{
					license_plan_id: license.id,
					customize: {
						price: { amount: 200, interval: BillingInterval.Year },
					},
				},
			],
		});

		const [monthlyBefore, annualBefore, baseBefore] = await Promise.all([
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
		const oldEntitlement = baseBefore.entitlements[0];
		const monthlyPrice = monthlyBefore.items.prices[0];
		const annualPrice = annualBefore.items.prices[0];

		expect(oldEntitlement.allowance).toBe(100);
		expect(monthlyBefore.items.entitlements[0].id).toBe(oldEntitlement.id);
		expect(annualBefore.items.entitlements[0].id).toBe(oldEntitlement.id);

		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			update_license_parents: [
				{ plan_id: monthlyParent.id, version: 1 },
				{ plan_id: annualParent.id, version: 1 },
			],
			items: [
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
		});
		const [monthlyAfterAdd, annualAfterAdd, baseAfterAdd] = await Promise.all([
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
		const addedWords = baseAfterAdd.entitlements.find(
			(entitlement) => entitlement.feature_id === TestFeature.Words,
		);
		expect(addedWords).toBeDefined();
		for (const link of [monthlyAfterAdd, annualAfterAdd]) {
			expect(link.items.entitlements).toContainEqual(
				expect.objectContaining({ id: addedWords?.id, allowance: 50 }),
			);
		}

		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			update_license_parents: [
				{ plan_id: monthlyParent.id, version: 1 },
				{ plan_id: annualParent.id, version: 1 },
			],
			items: [
				itemsV2.monthlyMessages({ included: 200 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
		});

		const [monthlyAfter, annualAfter, baseAfter, monthlyApi, annualApi] =
			await Promise.all([
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
				autumnV2_2.post("/plans.get", { plan_id: monthlyParent.id }),
				autumnV2_2.post("/plans.get", { plan_id: annualParent.id }),
			]);
		const newEntitlement = baseAfter.entitlements[0];

		// Shared item refs follow the replacement base row on both links.
		expect(newEntitlement.allowance).toBe(200);
		expect(newEntitlement.id).not.toBe(oldEntitlement.id);
		for (const link of [monthlyAfter, annualAfter]) {
			expect(link.planLicense.customized).toBe(true);
			expect(link.items.entitlements).toHaveLength(2);
			expect(link.items.entitlements).toContainEqual(
				expect.objectContaining({
					id: newEntitlement.id,
					feature_id: TestFeature.Messages,
					allowance: 200,
				}),
			);
			expect(
				link.fullLicenseProduct.entitlements.map(({ id }) => id),
			).toContain(newEntitlement.id);
		}

		// Parent-specific prices survive the base item replacement unchanged.
		expect(monthlyAfter.items.prices[0]).toMatchObject({
			id: monthlyPrice.id,
			config: expect.objectContaining({
				amount: 20,
				interval: BillingInterval.Month,
			}),
		});
		expect(annualAfter.items.prices[0]).toMatchObject({
			id: annualPrice.id,
			config: expect.objectContaining({
				amount: 200,
				interval: BillingInterval.Year,
			}),
		});

		// API diffs remain price-only because the shared item now matches the base.
		for (const plan of [monthlyApi, annualApi] as ApiPlanV1[]) {
			expect(plan.licenses?.[0]?.customize?.price).toBeDefined();
			expect(plan.licenses?.[0]?.customize?.add_items).toBeUndefined();
			expect(plan.licenses?.[0]?.customize?.remove_items).toBeUndefined();
		}

		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			update_license_parents: [
				{ plan_id: monthlyParent.id, version: 1 },
				{ plan_id: annualParent.id, version: 1 },
			],
			items: [itemsV2.monthlyMessages({ included: 200 })],
		});
		const [monthlyAfterRemove, annualAfterRemove] = await Promise.all([
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
		]);
		for (const link of [monthlyAfterRemove, annualAfterRemove]) {
			expect(link.items.entitlements).toHaveLength(1);
			expect(link.items.entitlements[0]).toMatchObject({
				feature_id: TestFeature.Messages,
				allowance: 200,
			});
			expect(link.items.prices[0].id).toBe(
				link.planLicense.id === monthlyAfterRemove.planLicense.id
					? monthlyPrice.id
					: annualPrice.id,
			);
		}
	},
);
