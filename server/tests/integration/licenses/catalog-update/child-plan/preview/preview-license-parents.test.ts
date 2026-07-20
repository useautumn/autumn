/**
 * Contract: child-plan previews expose selected parent versions and their effective license diffs.
 * Parent versioning is based on parent customers, while the target license version follows the child update.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("plans.preview_update: previews child propagation into a customerless parent")}`,
	async () => {
		const childCustomerId = "license-parent-preview-child-customer";
		const parent = products.base({
			id: "license-parent-preview-customerless-parent",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-parent-preview-versioned-child",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3 } = await initScenario({
			customerId: childCustomerId,
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
				s.billing.attach({ productId: child.id }),
			],
		});

		const preview = await autumnV2_3.plans.previewUpdate({
			plan_id: child.id,
			items: [
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
			include_license_parents: true,
			update_license_parents: [{ plan_id: parent.id, version: 1 }],
		});

		expect(preview).toMatchObject({
			plan_id: child.id,
			has_customers: true,
			customer_count: 1,
			versionable: true,
		});
		expect(preview.license_parents).toHaveLength(1);
		expect(preview.license_parents[0]).toMatchObject({
			plan_id: parent.id,
			version: 1,
			name: parent.name,
			has_customers: false,
			customer_count: 0,
			versionable: false,
			will_apply: true,
			update_source: "propagated",
			conflicts: [],
			license_changes: [
				{
					action: "update",
					license_plan_id: child.id,
					version: 2,
					included: 0,
					prepaid_only: true,
					previous_attributes: { version: 1 },
					plan_changes: {
						plan_id: child.id,
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
		expect(preview.license_parents[0]?.plan_license_id).toBeTruthy();
	},
);
