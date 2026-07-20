/**
 * Contract: generated and explicit license customizations rebase semantically.
 * Preservation diffs collapse when unnecessary, overrides win, and explicit removals persist.
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
	`${chalk.yellowBright("plans.update: collapses a generated preservation customize when base matches again")}`,
	async () => {
		const parent = products.base({
			id: "license-generated-customize-parent",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-generated-customize-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: "license-generated-customize-customer",
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
			plan_id: child.id,
			items: [
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
			update_license_parents: [],
		});
		const preserved = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: child.id,
		});
		expect(preserved.planLicense.customized).toBe(true);
		expect(preserved.fullLicenseProduct.entitlements).not.toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Words }),
		);

		await autumnV2_3.post("/plans.update", {
			plan_id: child.id,
			items: [itemsV2.monthlyMessages({ included: 100 })],
			update_license_parents: [],
		});
		const collapsed = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: child.id,
		});
		expect(collapsed.planLicense.customized).toBe(false);
		expect(collapsed.items.entitlements).toHaveLength(0);
		expect(collapsed.items.prices).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("plans.update: propagates around an explicit override and collapses it when base matches")}`,
	async () => {
		const parent = products.base({
			id: "license-explicit-override-parent",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-explicit-override-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: "license-explicit-override-customer",
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

		await autumnV2_3.post("/plans.update", {
			plan_id: child.id,
			items: [
				itemsV2.monthlyMessages({ included: 200 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
			update_license_parents: [{ plan_id: parent.id, version: 1 }],
		});
		const rebased = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: child.id,
		});
		expect(rebased.planLicense.customized).toBe(true);
		expect(rebased.fullLicenseProduct.entitlements).toEqual(
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

		await autumnV2_3.post("/plans.update", {
			plan_id: child.id,
			items: [
				itemsV2.monthlyMessages({ included: 500 }),
				itemsV2.monthlyWords({ included: 50 }),
			],
			update_license_parents: [{ plan_id: parent.id, version: 1 }],
		});
		const collapsed = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: child.id,
		});
		expect(collapsed.planLicense.customized).toBe(false);
		expect(collapsed.items.entitlements).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("plans.update: keeps an explicit removal while inheriting unrelated child additions")}`,
	async () => {
		const parent = products.base({
			id: "license-explicit-removal-parent",
			items: [items.dashboard()],
		});
		const child = products.base({
			id: "license-explicit-removal-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: "license-explicit-removal-customer",
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
			update_license_parents: [{ plan_id: parent.id, version: 1 }],
		});
		const after = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: child.id,
		});
		expect(after.fullLicenseProduct.entitlements).not.toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Messages }),
		);
		expect(after.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Words,
				allowance: 50,
			}),
		);
	},
);
