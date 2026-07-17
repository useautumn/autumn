/**
 * Contract: in-place propagation through a parent with customers uses copy-on-write.
 * The parent stays on v1, its catalog gets a successor link, and its customer retains the old definition.
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
	`${chalk.yellowBright("plans.update: copy-on-write protects a parent customer during in-place child propagation")}`,
	async () => {
		const parentCustomerId = "license-in-place-child-parent-customer";
		const parent = products.base({
			id: "license-in-place-child-parent-with-customer",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-in-place-child-cow-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: parentCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, child] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: child.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});
		const catalogBefore = await getFullLicenseProduct({
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
		expect(customerBefore.plan_license_id).toBe(catalogBefore.planLicense.id);
		const preview = await autumnV2_3.plans.previewUpdate({
			plan_id: child.id,
			items: [itemsV2.monthlyMessages({ included: 200 })],
			include_license_parents: true,
			update_license_parents: [{ plan_id: parent.id, version: 1 }],
		});
		expect(preview).toMatchObject({
			has_customers: false,
			versionable: false,
		});
		expect(preview.license_parents).toEqual([
			expect.objectContaining({
				plan_id: parent.id,
				version: 1,
				has_customers: true,
				customer_count: 1,
				versionable: true,
				will_apply: true,
			}),
		]);

		await autumnV2_3.post("/plans.update", {
			plan_id: child.id,
			items: [itemsV2.monthlyMessages({ included: 200 })],
			disable_version: true,
			update_license_parents: [{ plan_id: parent.id, version: 1 }],
		});

		const [parentAfter, catalogAfter, retiredLink, customerAfter] =
			await Promise.all([
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: parent.id,
					orgId: ctx.org.id,
					env: ctx.env,
				}),
				getFullLicenseProduct({
					ctx,
					parentPlanId: parent.id,
					licensePlanId: child.id,
				}),
				ctx.db.query.planLicenses.findFirst({
					where: eq(planLicenses.id, catalogBefore.planLicense.id),
				}),
				expectLicenseDefinitionCorrect({
					ctx,
					customerId: parentCustomerId,
					parentPlanId: parent.id,
					isCustom: true,
					isCustomized: true,
				}),
			]);

		expect(parentAfter).toMatchObject({
			version: 1,
			internal_id: catalogBefore.parentProduct.internal_id,
		});
		expect(catalogAfter.planLicense).toMatchObject({
			is_custom: false,
			customized: false,
		});
		expect(catalogAfter.planLicense.id).not.toBe(catalogBefore.planLicense.id);
		expect(catalogAfter.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: 200,
			}),
		);
		expect(retiredLink).toMatchObject({
			id: catalogBefore.planLicense.id,
			is_custom: true,
			customized: true,
		});
		expect(customerAfter).toMatchObject({
			id: customerBefore.id,
			plan_license_id: catalogBefore.planLicense.id,
		});
		expect(customerAfter.planLicense?.product.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: 100,
			}),
		);
	},
);
