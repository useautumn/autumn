/**
 * Regression: previews expose override conflicts and unselected parents retain their effective plan.
 * A stray early return previously skipped both assertions.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getFullLicenseProduct } from "../../utils/getFullLicenseProduct.js";

test.concurrent(
	`${chalk.yellowBright("plans.preview_update: reports conflicts against parent-specific license overrides")}`,
	async () => {
		const parent = products.base({
			id: "license-parent-preview-conflict-parent",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-parent-preview-conflict-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: "license-parent-preview-conflict-customer",
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
		await autumnV2_3.post("/plans.update", {
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
		});

		const preview = await autumnV2_3.plans.previewUpdate({
			plan_id: child.id,
			items: [
				itemsV2.monthlyMessages({ included: 200 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
			include_license_parents: true,
			update_license_parents: [{ plan_id: parent.id, version: 1 }],
		});

		expect(preview.license_parents).toHaveLength(1);
		expect(preview.license_parents[0]).toMatchObject({
			plan_id: parent.id,
			version: 1,
			will_apply: true,
			conflicts: [
				{
					reason: "value_divergence",
					item_filter: expect.objectContaining({
						feature_id: TestFeature.Messages,
					}),
				},
			],
			license_changes: [
				{
					customize: {
						remove_items: [
							expect.objectContaining({
								feature_id: TestFeature.Messages,
							}),
						],
						add_items: [
							expect.objectContaining({
								feature_id: TestFeature.Messages,
								included: 500,
							}),
						],
					},
					plan_changes: {
						item_changes: [
							expect.objectContaining({
								action: "created",
								feature_id: TestFeature.Words,
							}),
						],
					},
				},
			],
		});

		await autumnV2_3.post("/plans.update", {
			plan_id: child.id,
			items: [
				itemsV2.monthlyMessages({ included: 200 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
			disable_version: true,
			update_license_parents: [],
		});
		const unselectedParent = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: child.id,
		});
		expect(unselectedParent.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: 500,
			}),
		);
		expect(unselectedParent.fullLicenseProduct.entitlements).not.toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Words }),
		);
	},
);
