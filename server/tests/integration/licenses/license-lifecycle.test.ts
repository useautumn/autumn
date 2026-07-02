/**
 * TDD tests for license assignment lifecycle on parent plan transitions.
 *
 * Red-failure mode (current behavior):
 *  - Cancelling the parent subscription leaves assignments open (ended_at null)
 *    and provisioned license customer products Active, so entities keep access.
 *  - A plain upgrade (no customize.licenses) leaves active assignments pointed
 *    at the expired parent's pools; the new parent's pool reports assigned=0.
 *
 * Green-success criteria (after fix):
 *  - Cancel immediately ends active assignments and expires provisioned
 *    license customer products; entity checks stop granting the license.
 *  - Plain upgrade re-parents active assignments onto the successor's pools;
 *    inventory counts and entity access carry over.
 */

import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	type LicensePoolResponse,
	ProductCatalogType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const makeLicenseProduct = (id: string) => ({
	...products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 25 })],
	}),
	catalog_type: ProductCatalogType.License,
});

test.concurrent(
	`${chalk.yellowBright("licenses-lifecycle: cancelling the parent ends assignments and revokes entity access")}`,
	async () => {
		const parent = products.pro({
			id: "lifecycle-cancel-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("lifecycle-cancel-license");

		const { customerId, entities, autumnV2_1, autumnV2_2 } =
			await initScenario({
				customerId: "license-lifecycle-cancel",
				setup: [
					s.customer({ paymentMethod: "success", testClock: false }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
					s.products({ list: [parent, license] }),
				],
				actions: [],
			});

		await autumnV2_2.post("/licenses.set_plan_license", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included_quantity: 1,
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});
		await autumnV2_2.post("/licenses.assign", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		const beforeCancel = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(beforeCancel.allowed).toBe(true);

		await autumnV2_2.billing.update({
			customer_id: customerId,
			plan_id: parent.id,
			cancel_action: "cancel_immediately",
		});

		const assignmentsAfterCancel = (await autumnV2_2.post(
			"/licenses.list_assignments",
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: license.id,
			},
		)) as { list: Array<{ ended_at: number | null }> };
		const openAssignments = assignmentsAfterCancel.list.filter(
			(assignment) => assignment.ended_at === null,
		);
		expect(openAssignments).toHaveLength(0);

		const afterCancel = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(afterCancel.allowed).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-lifecycle: plain upgrade re-parents assignments onto the new plan's pools")}`,
	async () => {
		const proPlan = products.pro({
			id: "lifecycle-upgrade-pro",
			items: [items.dashboard()],
		});
		const premiumPlan = products.premium({
			id: "lifecycle-upgrade-premium",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("lifecycle-upgrade-license");

		const { customerId, entities, autumnV2_1, autumnV2_2 } =
			await initScenario({
				customerId: "license-lifecycle-upgrade",
				setup: [
					s.customer({ paymentMethod: "success", testClock: false }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
					s.products({ list: [proPlan, premiumPlan, license] }),
				],
				actions: [],
			});

		for (const planId of [proPlan.id, premiumPlan.id]) {
			await autumnV2_2.post("/licenses.set_plan_license", {
				parent_plan_id: planId,
				license_plan_id: license.id,
				included_quantity: 1,
			});
		}
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: proPlan.id,
		});
		await autumnV2_2.post("/licenses.assign", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premiumPlan.id,
		});

		const poolsAfterUpgrade = (await autumnV2_2.post("/licenses.list_pools", {
			customer_id: customerId,
			entity_id: entities[0].id,
		})) as { list: LicensePoolResponse[] };
		expect(poolsAfterUpgrade.list).toHaveLength(1);
		expect(poolsAfterUpgrade.list[0]).toMatchObject({
			license_product_id: license.id,
			inventory: {
				included_quantity: 1,
				assigned: 1,
				available: 0,
			},
		});
		expect(poolsAfterUpgrade.list[0].assignments).toHaveLength(1);
		expect(poolsAfterUpgrade.list[0].assignments[0]).toMatchObject({
			entity_id: entities[0].id,
			license_product_id: license.id,
		});

		const afterUpgrade = await autumnV2_1.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(afterUpgrade.allowed).toBe(true);
	},
);
