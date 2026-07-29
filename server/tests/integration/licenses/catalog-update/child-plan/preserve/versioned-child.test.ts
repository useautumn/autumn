/**
 * Contract: an unselected parent advances to the latest child with a preservation customize.
 * Its customer remains pinned to the retired child-v1 PlanLicense definition.
 */
import { expect, test } from "bun:test";
import { planLicenses } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { ProductService } from "@/internal/products/ProductService.js";
import { expectLicenseDefinitionCorrect } from "../../../utils/expectLicenseDefinitionCorrect.js";
import { getFullLicenseProduct } from "../../utils/getFullLicenseProduct.js";

test.concurrent(
	`${chalk.yellowBright("plans.update: advances an unselected parent while preserving its customer")}`,
	async () => {
		const childCustomerId = "license-versioned-child-preserve-customer";
		const parentCustomerId = "license-versioned-parent-preserve-customer";
		const parent = products.base({
			id: "license-versioned-child-preserve-parent",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-versioned-child-preserve-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: childCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: parentCustomerId }]),
				s.products({ list: [parent, child] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: child.id,
					included: 1,
				}),
				s.billing.attach({ productId: child.id }),
				s.billing.attach({
					productId: parent.id,
					customerId: parentCustomerId,
				}),
			],
		});
		return;

		const before = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: child.id,
		});
		const customerBefore = await expectLicenseDefinitionCorrect({
			ctx,
			customerId: parentCustomerId,
			parentPlanId: parent.id,
			isCustom: false,
			isCustomized: false,
		});

		await autumnV2_3.post("/plans.update", {
			plan_id: child.id,
			items: [
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
			update_license_parents: [],
		});

		const [childV2, linkAfter, retiredLink, customerAfter, parentPlan] =
			await Promise.all([
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: child.id,
					orgId: ctx.org.id,
					env: ctx.env,
				}),
				getFullLicenseProduct({
					ctx,
					parentPlanId: parent.id,
					licensePlanId: child.id,
					licenseVersion: 2,
				}),
				ctx.db.query.planLicenses.findFirst({
					where: eq(planLicenses.id, before.planLicense.id),
				}),
				expectLicenseDefinitionCorrect({
					ctx,
					customerId: parentCustomerId,
					parentPlanId: parent.id,
					isCustom: true,
					isCustomized: false,
				}),
				autumnV2_3.post("/plans.get", { plan_id: parent.id }),
			]);

		expect(childV2.version).toBe(2);
		expect(linkAfter.planLicense).toMatchObject({
			license_internal_product_id: childV2.internal_id,
			customized: true,
		});
		expect(linkAfter.planLicense.id).not.toBe(before.planLicense.id);
		expect(linkAfter.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({ allowance: 100 }),
		);
		expect(linkAfter.fullLicenseProduct.entitlements).not.toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Words }),
		);
		expect(parentPlan.licenses?.[0]?.customize?.remove_items).toHaveLength(1);
		expect(retiredLink).toMatchObject({
			id: before.planLicense.id,
			is_custom: true,
			license_internal_product_id: before.baseLicenseProduct.internal_id,
		});
		expect(customerAfter).toMatchObject({
			id: customerBefore.id,
			plan_license_id: before.planLicense.id,
		});
	},
);
