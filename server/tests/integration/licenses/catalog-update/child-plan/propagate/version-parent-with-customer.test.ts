/**
 * Contract: a customerless child update can version a selected parent with customers.
 * The child updates in place while the existing parent customer keeps its exact license definition.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { expectLicenseDefinitionCorrect } from "../../../utils/expectLicenseDefinitionCorrect.js";
import { getFullLicenseProduct } from "../../utils/getFullLicenseProduct.js";

test.concurrent(
	`${chalk.yellowBright("plans.update: versions a selected parent without cooking its customer license")}`,
	async () => {
		const customerId = "license-child-in-place-parent-version-customer";
		const parent = products.base({
			id: "license-child-in-place-parent-version",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-child-in-place-parent-version-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
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
		const before = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: child.id,
		});
		const customerBefore = await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: false,
			isCustomized: false,
		});

		await autumnV2_3.post("/plans.update", {
			plan_id: child.id,
			items: [itemsV2.monthlyMessages({ included: 200 })],
			update_license_parents: [{ plan_id: parent.id, version: 1 }],
		});

		const [childAfter, parentAfter, parentV1Link, parentV2Link, customerAfter] =
			await Promise.all([
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: child.id,
					orgId: ctx.org.id,
					env: ctx.env,
				}),
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: parent.id,
					orgId: ctx.org.id,
					env: ctx.env,
				}),
				getFullLicenseProduct({
					ctx,
					parentPlanId: parent.id,
					parentVersion: 1,
					licensePlanId: child.id,
				}),
				getFullLicenseProduct({
					ctx,
					parentPlanId: parent.id,
					parentVersion: 2,
					licensePlanId: child.id,
				}),
				expectLicenseDefinitionCorrect({
					ctx,
					customerId,
					parentPlanId: parent.id,
					isCustom: false,
					isCustomized: true,
				}),
			]);

		expect(childAfter).toMatchObject({ version: 1 });
		expect(childAfter.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: 200,
			}),
		);
		expect(parentAfter.version).toBe(2);
		expect(parentV1Link.planLicense).toMatchObject({
			id: before.planLicense.id,
			customized: true,
		});
		expect(parentV1Link.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({ allowance: 100 }),
		);
		expect(parentV2Link.planLicense.customized).toBe(false);
		expect(parentV2Link.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({ allowance: 200 }),
		);
		expect(customerAfter).toMatchObject({
			id: customerBefore.id,
			plan_license_id: before.planLicense.id,
		});
		expect(customerAfter.planLicense?.product.entitlements).toContainEqual(
			expect.objectContaining({ allowance: 100 }),
		);
	},
);
