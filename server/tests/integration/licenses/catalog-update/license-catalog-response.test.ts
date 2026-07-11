import { expect, test } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
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
	`${chalk.yellowBright("licenses: plan license customize overrides the base grant")}`,
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
					customize: {
						items: [itemsV2.monthlyMessages({ included: 100 })],
					},
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
		expect(enterprisePlanLicenses[0].customize?.add_items?.[0].included).toBe(
			100,
		);

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				{
					license_plan_id: license.id,
					included: 3,
					customize: {
						items: [itemsV2.monthlyMessages({ included: 100 })],
					},
				},
			],
		});
		const updatedEnterprisePlanLicenses = await listLicenseLinks({
			autumn: autumnV2_2,
			parentPlanId: parent.id,
		});
		expect(
			updatedEnterprisePlanLicenses[0].customize?.add_items?.[0].included,
		).toBe(100);

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

		expect(enterpriseCheck.balance?.granted).toBe(100);

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		const enterprisePool = pools[0];
		expect(enterprisePool?.inventory).toMatchObject({
			included: 3,
			assigned: 1,
			available: 2,
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
					included: number;
					prepaid_only: boolean;
				}>;
			}>;
		};
		const parentPlan = list.find((plan) => plan.id === parent.id);
		expect(parentPlan?.licenses).toEqual([
			{
				license_plan_id: license.id,
				included: 3,
				prepaid_only: true,
			},
		]);
		const licensePlan = list.find((plan) => plan.id === license.id);
		expect(licensePlan?.licenses).toBeUndefined();
	},
);
