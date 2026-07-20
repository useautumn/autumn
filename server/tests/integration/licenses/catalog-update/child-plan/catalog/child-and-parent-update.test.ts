/**
 * Contract: a direct parent license update wins over child propagation in one catalog batch.
 * Preview and update resolve the same effective customized license against the edited child.
 */
import { expect, test } from "bun:test";
import type { CatalogPreviewUpdateResponse } from "@autumn/shared";
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
	`${chalk.yellowBright("catalog.update: direct parent customize takes priority over child propagation")}`,
	async () => {
		const parent = products.base({
			id: "license-catalog-direct-parent",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-catalog-direct-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: "license-catalog-direct-customer",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, child] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: child.id,
					included: 0,
				}),
			],
		});
		const params = {
			plans: [
				{
					plan_id: child.id,
					items: [
						itemsV2.monthlyMessages({ included: 200 }),
						itemsV2.monthlyWords({ included: 50 }),
					],
					include_license_parents: true,
					update_license_parents: [{ plan_id: parent.id, version: 1 }],
				},
				{
					plan_id: parent.id,
					licenses: [
						{
							license_plan_id: child.id,
							included: 0,
							customize: {
								remove_items: [{ feature_id: TestFeature.Messages }],
								add_items: [itemsV2.monthlyMessages({ included: 500 })],
							},
						},
					],
				},
			],
		};

		const preview = (await autumnV2_3.catalog.previewUpdate(
			params,
		)) as CatalogPreviewUpdateResponse;
		const childPreview = preview.plan_changes.find(
			(change) => change.plan_id === child.id,
		);
		expect(childPreview?.license_parents).toHaveLength(1);
		expect(childPreview?.license_parents[0]).toMatchObject({
			plan_id: parent.id,
			update_source: "direct",
			license_changes: [
				{
					customize: {
						add_items: [
							expect.objectContaining({
								feature_id: TestFeature.Messages,
								included: 500,
							}),
						],
					},
					plan_changes: {
						item_changes: expect.arrayContaining([
							expect.objectContaining({
								feature_id: TestFeature.Words,
								action: "created",
							}),
						]),
					},
				},
			],
		});

		await autumnV2_3.catalog.update(params);
		const after = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: child.id,
		});
		expect(after.planLicense.customized).toBe(true);
		expect(after.fullLicenseProduct.entitlements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					feature_id: TestFeature.Messages,
					allowance: 500,
				}),
				expect.objectContaining({
					feature_id: TestFeature.Words,
					allowance: 50,
				}),
			]),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalog.update: coalesces direct customize with propagated parent versioning")}`,
	async () => {
		const childCustomerId = "license-catalog-direct-child-customer";
		const parentCustomerId = "license-catalog-direct-parent-customer";
		const parent = products.base({
			id: "license-catalog-direct-versioned-parent",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-catalog-direct-versioned-seat",
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
		const oldLink = await getFullLicenseProduct({
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

		await autumnV2_3.catalog.update({
			plans: [
				{
					plan_id: child.id,
					items: [
						itemsV2.monthlyMessages({ included: 200 }),
						itemsV2.monthlyWords({ included: 50 }),
					],
					update_license_parents: [{ plan_id: parent.id, version: 1 }],
				},
				{
					plan_id: parent.id,
					licenses: [
						{
							license_plan_id: child.id,
							included: 1,
							customize: {
								remove_items: [{ feature_id: TestFeature.Messages }],
								add_items: [itemsV2.monthlyMessages({ included: 500 })],
							},
						},
					],
				},
			],
		});

		const [childAfter, parentAfter, newLink, customerAfter] = await Promise.all(
			[
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
					parentVersion: 2,
					licensePlanId: child.id,
					licenseVersion: 2,
				}),
				expectLicenseDefinitionCorrect({
					ctx,
					customerId: parentCustomerId,
					parentPlanId: parent.id,
					isCustom: true,
					isCustomized: false,
				}),
			],
		);

		expect(childAfter.version).toBe(2);
		expect(parentAfter.version).toBe(2);
		expect(newLink.planLicense.customized).toBe(true);
		expect(newLink.fullLicenseProduct.entitlements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					feature_id: TestFeature.Messages,
					allowance: 500,
				}),
				expect.objectContaining({
					feature_id: TestFeature.Words,
					allowance: 50,
				}),
			]),
		);
		expect(customerAfter).toMatchObject({
			id: customerBefore.id,
			plan_license_id: oldLink.planLicense.id,
		});
		expect(customerAfter.planLicense?.product.entitlements).not.toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Words }),
		);
	},
	{ timeout: 15_000 },
);
