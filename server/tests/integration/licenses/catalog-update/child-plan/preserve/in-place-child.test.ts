/**
 * Contract: an unselected parent is frozen when its child version is edited in place.
 * The generated customization preserves the old effective plan and its parent customer snapshot.
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
	`${chalk.yellowBright("plans.update: preserves an unselected parent during an in-place child update")}`,
	async () => {
		const parentCustomerId = "license-in-place-child-preserve-customer";
		const parent = products.base({
			id: "license-in-place-child-preserve-parent",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-in-place-child-preserve-seat",
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
		expect(customerBefore.plan_license_id).toBe(before.planLicense.id);

		await autumnV2_3.post("/plans.update", {
			plan_id: child.id,
			items: [itemsV2.monthlyMessages({ included: 200 })],
			disable_version: true,
			update_license_parents: [],
		});

		const [childAfter, linkAfter, parentPlan, customerAfter] =
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
				}),
				autumnV2_3.post("/plans.get", { plan_id: parent.id }),
				expectLicenseDefinitionCorrect({
					ctx,
					customerId: parentCustomerId,
					parentPlanId: parent.id,
					isCustom: false,
					isCustomized: true,
				}),
			]);

		expect(childAfter.version).toBe(1);
		expect(childAfter.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: 200,
			}),
		);
		expect(linkAfter.planLicense).toMatchObject({
			id: before.planLicense.id,
			customized: true,
		});
		expect(linkAfter.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: 100,
			}),
		);
		expect(parentPlan.licenses?.[0]?.customize).toMatchObject({
			remove_items: [
				expect.objectContaining({ feature_id: TestFeature.Messages }),
			],
			add_items: [
				expect.objectContaining({
					feature_id: TestFeature.Messages,
					included: 100,
				}),
			],
		});
		expect(customerAfter).toMatchObject({
			id: customerBefore.id,
			plan_license_id: before.planLicense.id,
		});
		expect(customerAfter.planLicense?.product.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: 100,
			}),
		);
	},
);
