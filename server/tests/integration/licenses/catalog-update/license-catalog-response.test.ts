import { expect, test } from "bun:test";
import type {
	CatalogPreviewUpdateResponse,
	CheckResponseV3,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { listLicenseLinks, listLicensePools } from "../licenseTestUtils.js";

const makeLicenseProduct = () => ({
	...products.base({
		id: "seat-license",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	}),
});

test.concurrent(
	`${chalk.yellowBright("licenses: catalog resolves same-batch dependencies and rejects cycles")}`,
	async () => {
		const { autumnV2_2 } = await initScenario({
			customerId: "license-catalog-batch",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		const parentId = "license_catalog_batch_parent";
		const childId = "license_catalog_batch_child";

		await autumnV2_2.post("/catalog.update", {
			plans: [
				{
					plan_id: parentId,
					name: "Parent",
					licenses: [{ license_plan_id: childId, included: 4 }],
				},
				{ plan_id: childId, name: "Child", licenses: [] },
			],
		});
		const parent = await autumnV2_2.post("/plans.get", { plan_id: parentId });
		expect(parent.licenses).toEqual([
			{
				license_plan_id: childId,
				version: 1,
				included: 4,
				prepaid_only: true,
			},
		]);

		await expect(
			autumnV2_2.post("/catalog.preview_update", {
				plans: [
					{ plan_id: parentId, licenses: [{ license_plan_id: childId }] },
					{ plan_id: childId, licenses: [{ license_plan_id: parentId }] },
				],
			}),
		).rejects.toThrow("Plan dependency cycle");
		await autumnV2_2.post("/catalog.update", {
			skip_plan_ids: [parentId, childId],
			plans: [
				{ plan_id: parentId, licenses: [{ license_plan_id: childId }] },
				{ plan_id: childId, licenses: [{ license_plan_id: parentId }] },
			],
		});
	},
);

/** Fresh explicit versions must resolve and persist same-batch pinned license versions. */
test.concurrent(
	`${chalk.yellowBright("licenses: catalog creates fresh explicit versions with pinned dependencies")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const { autumnV2_2 } = await initScenario({
			customerId: `license-catalog-fresh-versions-${suffix}`,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		const parentId = `license_catalog_fresh_parent_${suffix}`;
		const childId = `license_catalog_fresh_child_${suffix}`;
		const plans = [
			{
				plan_id: childId,
				version: 1,
				name: "Child",
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 10,
						reset: { interval: "month" as const },
					},
				],
				licenses: [],
			},
			{
				plan_id: parentId,
				version: 1,
				name: "Parent",
				licenses: [{ license_plan_id: childId, version: 1, included: 1 }],
			},
			{
				plan_id: childId,
				version: 2,
				name: "Child",
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 20,
						reset: { interval: "month" as const },
					},
				],
				licenses: [],
			},
			{
				plan_id: parentId,
				version: 2,
				name: "Parent",
				licenses: [{ license_plan_id: childId, version: 2, included: 2 }],
			},
		].reverse();

		const preview = (await autumnV2_2.post("/catalog.preview_update", {
			expand: ["plan_changes.plan"],
			plans,
		})) as CatalogPreviewUpdateResponse;
		expect(preview.plan_changes).toHaveLength(4);
		expect(preview.plan_changes[0]?.plan?.licenses).toEqual([
			{
				license_plan_id: childId,
				version: 2,
				included: 2,
				prepaid_only: true,
			},
		]);

		await autumnV2_2.post("/catalog.update", { plans });
		const [parentV1, parentV2, childV1, childV2] = await Promise.all([
			autumnV2_2.post("/plans.get", { plan_id: parentId, version: 1 }),
			autumnV2_2.post("/plans.get", { plan_id: parentId, version: 2 }),
			autumnV2_2.post("/plans.get", { plan_id: childId, version: 1 }),
			autumnV2_2.post("/plans.get", { plan_id: childId, version: 2 }),
		]);
		expect([
			parentV1.version,
			parentV2.version,
			childV1.version,
			childV2.version,
		]).toEqual([1, 2, 1, 2]);
		expect(childV1.items[0]?.included).toBe(10);
		expect(childV2.items[0]?.included).toBe(20);
		expect(parentV1.licenses[0]?.version).toBe(1);
		expect(parentV2.licenses).toEqual([
			{
				license_plan_id: childId,
				version: 2,
				included: 2,
				prepaid_only: true,
			},
		]);

		for (const route of ["/catalog.preview_update", "/catalog.update"]) {
			await expect(
				autumnV2_2.post(route, {
					plans: [{ plan_id: `${childId}_gap`, version: 2, name: "Gap" }],
				}),
			).rejects.toThrow("version must be 1, received 2");
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: same-batch historical versioning resolves from the latest version")}`,
	async () => {
		const child = products.base({
			id: "license-historical-child",
			items: [items.monthlyMessages()],
		});
		const { autumnV2_2 } = await initScenario({
			customerId: "license-historical-batch",
			setup: [s.customer({ testClock: false }), s.products({ list: [child] })],
			actions: [],
		});
		await autumnV2_2.post("/plans.update", {
			plan_id: child.id,
			force_version: true,
		});

		const preview = (await autumnV2_2.post("/catalog.preview_update", {
			expand: ["plan_changes.plan"],
			plans: [
				{
					plan_id: "license-historical-parent",
					licenses: [{ license_plan_id: child.id }],
				},
				{
					plan_id: child.id,
					version: 1,
					force_version: true,
					items: [
						{
							feature_id: TestFeature.Messages,
							included: 50,
							reset: { interval: "month" },
						},
					],
				},
			],
		})) as CatalogPreviewUpdateResponse;
		const parent = preview.plan_changes.find(
			(change) => change.plan_id === "license-historical-parent",
		);
		expect(parent?.plan?.licenses?.[0]?.version).toBe(3);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: catalog preview reports update and removal")}`,
	async () => {
		const parent = products.base({
			id: "license-preview-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-preview-child",
			items: [items.monthlyMessages()],
		});
		const { autumnV2_2 } = await initScenario({
			customerId: "license-preview",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 2,
				}),
			],
		});

		const updatePreview = (await autumnV2_2.post("/catalog.preview_update", {
			expand: ["plan_changes.plan"],
			plans: [
				{
					plan_id: parent.id,
					licenses: [
						{
							license_plan_id: license.id,
							version: 1,
							included: 3,
						},
					],
				},
			],
		})) as CatalogPreviewUpdateResponse;
		const change = updatePreview.plan_changes[0]!;
		expect(change.action).toBe("updated");
		expect(change.license_changes).toEqual([
			{
				action: "update",
				license_plan_id: license.id,
			},
		]);
		expect(change.plan?.licenses).toEqual([
			{
				license_plan_id: license.id,
				version: 1,
				included: 3,
				prepaid_only: true,
			},
		]);

		const removePreview = (await autumnV2_2.post("/catalog.preview_update", {
			plans: [{ plan_id: parent.id, licenses: [] }],
		})) as CatalogPreviewUpdateResponse;
		expect(removePreview.plan_changes[0]?.license_changes[0]?.action).toBe(
			"remove",
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: plan license included updates in place, assignments grant stock items")}`,
	async () => {
		const parent = products.base({
			id: "license-custom-enterprise",
			items: [items.dashboard()],
		});
		const license = {
			...makeLicenseProduct(),
			id: "license-custom-seat",
		};

		const { customerId, entities, autumnV2_2 } = await initScenario({
			customerId: "license-custom-cus",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				{
					license_plan_id: license.id,
					included: 2,
				},
			],
		});

		const enterprisePlanLicenses = await listLicenseLinks({
			autumn: autumnV2_2,
			parentPlanId: parent.id,
		});
		expect(enterprisePlanLicenses).toHaveLength(1);
		expect(enterprisePlanLicenses[0].license_plan_id).toBe(license.id);
		expect("parent_internal_product_id" in enterprisePlanLicenses[0]).toBe(
			false,
		);
		expect("license_internal_product_id" in enterprisePlanLicenses[0]).toBe(
			false,
		);

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				{
					license_plan_id: license.id,
					included: 3,
				},
			],
		});
		const updatedEnterprisePlanLicenses = await listLicenseLinks({
			autumn: autumnV2_2,
			parentPlanId: parent.id,
		});
		expect(updatedEnterprisePlanLicenses[0].included).toBe(3);

		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		const enterpriseCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});

		expect(enterpriseCheck.balance?.granted).toBe(25);

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		const enterprisePool = pools[0];
		expect(enterprisePool).toMatchObject({
			granted: 3,
			usage: 1,
			remaining: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: plans.list exposes the licenses field")}`,
	async () => {
		const parent = products.base({
			id: "plan-lic-field-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "plan-lic-field-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: "license-plans-field",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 3,
				}),
			],
		});

		const { list } = (await autumnV2_2.post("/plans.list", {})) as {
			list: Array<{
				id: string;
				licenses?: Array<{
					license_plan_id: string;
					version: number;
					included: number;
					prepaid_only: boolean;
				}>;
			}>;
		};
		const parentPlan = list.find((plan) => plan.id === parent.id);
		expect(parentPlan?.licenses).toEqual([
			{
				license_plan_id: license.id,
				version: 1,
				included: 3,
				prepaid_only: true,
			},
		]);
		const licensePlan = list.find((plan) => plan.id === license.id);
		expect(licensePlan?.licenses).toBeUndefined();
	},
);
