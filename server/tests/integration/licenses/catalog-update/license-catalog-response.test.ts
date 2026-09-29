import { expect, test } from "bun:test";
import type { CatalogPreviewUpdateResponse } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const _makeLicenseProduct = () => ({
	...products.base({
		id: "seat-license",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	}),
});

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
				version: 1,
				included: 3,
				prepaid_only: true,
				previous_attributes: { included: 2 },
				plan_changes: null,
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
					version_slug?: string;
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
				version_slug: "v1",
				included: 3,
				prepaid_only: true,
			},
		]);
		const licensePlan = list.find((plan) => plan.id === license.id);
		expect(licensePlan?.licenses).toBeUndefined();
	},
);
