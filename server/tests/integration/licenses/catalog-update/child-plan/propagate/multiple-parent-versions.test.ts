/**
 * Contract: child versioning advances every active parent-version link to the latest child.
 * Preserved parents remain discoverable for later preview/propagation and customer snapshots never move.
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
	`${chalk.yellowBright("plans.update: keeps every parent version linked to the latest child")}`,
	async () => {
		const childCustomerId = "license-multi-parent-child-customer";
		const parentV1CustomerId = "license-multi-parent-v1-customer";
		const parentV2CustomerId = "license-multi-parent-v2-customer";
		const parent = products.base({
			id: "license-multi-parent-family",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-multi-parent-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: childCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([
					{ id: parentV1CustomerId },
					{ id: parentV2CustomerId },
				]),
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
					customerId: parentV1CustomerId,
				}),
			],
		});

		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			items: [itemsV2.dashboard(), itemsV2.monthlyCredits({ included: 10 })],
		});
		await autumnV2_3.billing.attach({
			customer_id: parentV2CustomerId,
			plan_id: parent.id,
		});

		const [v1Before, v2Before, v1CustomerBefore, v2CustomerBefore] =
			await Promise.all([
				getFullLicenseProduct({
					ctx,
					parentPlanId: parent.id,
					parentVersion: 1,
					licensePlanId: child.id,
					licenseVersion: 1,
				}),
				getFullLicenseProduct({
					ctx,
					parentPlanId: parent.id,
					parentVersion: 2,
					licensePlanId: child.id,
					licenseVersion: 1,
				}),
				expectLicenseDefinitionCorrect({
					ctx,
					customerId: parentV1CustomerId,
					parentPlanId: parent.id,
					isCustom: false,
					isCustomized: false,
				}),
				expectLicenseDefinitionCorrect({
					ctx,
					customerId: parentV2CustomerId,
					parentPlanId: parent.id,
					isCustom: false,
					isCustomized: false,
				}),
			]);

		await autumnV2_3.post("/plans.update", {
			plan_id: child.id,
			items: [
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
			update_license_parents: [],
		});

		const childV2 = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: child.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const [v1Preserved, v2Preserved, v1CustomerPreserved, v2CustomerPreserved] =
			await Promise.all([
				getFullLicenseProduct({
					ctx,
					parentPlanId: parent.id,
					parentVersion: 1,
					licensePlanId: child.id,
					licenseVersion: 2,
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
					customerId: parentV1CustomerId,
					parentPlanId: parent.id,
					isCustom: true,
					isCustomized: false,
				}),
				expectLicenseDefinitionCorrect({
					ctx,
					customerId: parentV2CustomerId,
					parentPlanId: parent.id,
					isCustom: true,
					isCustomized: false,
				}),
			]);

		expect(childV2.version).toBe(2);
		for (const [preserved, before] of [
			[v1Preserved, v1Before],
			[v2Preserved, v2Before],
		] as const) {
			expect(preserved.planLicense).toMatchObject({
				license_internal_product_id: childV2.internal_id,
				customized: true,
			});
			expect(preserved.planLicense.id).not.toBe(before.planLicense.id);
			expect(preserved.fullLicenseProduct.entitlements).not.toContainEqual(
				expect.objectContaining({ feature_id: TestFeature.Words }),
			);
		}
		expect(v1CustomerPreserved).toMatchObject({
			id: v1CustomerBefore.id,
			plan_license_id: v1Before.planLicense.id,
		});
		expect(v2CustomerPreserved).toMatchObject({
			id: v2CustomerBefore.id,
			plan_license_id: v2Before.planLicense.id,
		});

		const updateItems = [
			itemsV2.monthlyMessages({ included: 100 }),
			itemsV2.monthlyWords({ included: 50 }),
			itemsV2.monthlyCredits({ included: 25 }),
		];
		const targets = [
			{ plan_id: parent.id, version: 1 },
			{ plan_id: parent.id, version: 2 },
		];
		const preview = await autumnV2_3.plans.previewUpdate({
			plan_id: child.id,
			items: updateItems,
			disable_version: true,
			include_license_parents: true,
			update_license_parents: targets,
		});

		expect(preview.license_parents).toHaveLength(2);
		expect(preview.license_parents.map(({ version }) => version)).toEqual([
			2, 1,
		]);
		for (const option of preview.license_parents) {
			expect(option).toMatchObject({
				plan_id: parent.id,
				has_customers: true,
				customer_count: 1,
				versionable: false,
				will_apply: true,
				license_changes: [
					{
						version: 2,
						plan_changes: {
							item_changes: [
								expect.objectContaining({
									feature_id: TestFeature.Credits,
									action: "created",
								}),
							],
						},
					},
				],
			});
		}

		await autumnV2_3.post("/plans.update", {
			plan_id: child.id,
			items: updateItems,
			disable_version: true,
			update_license_parents: targets,
		});

		const [v1After, v2After, v1CustomerAfter, v2CustomerAfter] =
			await Promise.all([
				getFullLicenseProduct({
					ctx,
					parentPlanId: parent.id,
					parentVersion: 1,
					licensePlanId: child.id,
					licenseVersion: 2,
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
					customerId: parentV1CustomerId,
					parentPlanId: parent.id,
					isCustom: true,
					isCustomized: false,
				}),
				expectLicenseDefinitionCorrect({
					ctx,
					customerId: parentV2CustomerId,
					parentPlanId: parent.id,
					isCustom: true,
					isCustomized: false,
				}),
			]);

		for (const link of [v1After, v2After]) {
			expect(link.fullLicenseProduct.entitlements).toContainEqual(
				expect.objectContaining({
					feature_id: TestFeature.Credits,
					allowance: 25,
				}),
			);
			expect(link.fullLicenseProduct.entitlements).not.toContainEqual(
				expect.objectContaining({ feature_id: TestFeature.Words }),
			);
		}
		expect(v1CustomerAfter).toMatchObject({
			id: v1CustomerBefore.id,
			plan_license_id: v1Before.planLicense.id,
		});
		expect(v2CustomerAfter).toMatchObject({
			id: v2CustomerBefore.id,
			plan_license_id: v2Before.planLicense.id,
		});
		for (const customer of [v1CustomerAfter, v2CustomerAfter]) {
			expect(customer.planLicense?.product.entitlements).not.toContainEqual(
				expect.objectContaining({ feature_id: TestFeature.Credits }),
			);
		}
	},
	{ timeout: 20_000 },
);
