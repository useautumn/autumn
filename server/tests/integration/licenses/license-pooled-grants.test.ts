/**
 * Contract tests for pooled license feature grants.
 *
 * Pooled features on a license grant a shared customer-level balance sized by
 * pool capacity (included + paid quantity) instead of per-entity provisioning.
 * The grant ledger is keyed by customer x license x feature with a per-period
 * high-water marker, so assignment/upgrade/cancel churn can never re-mint.
 */

import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	type LicensePoolResponse,
	ProductCatalogType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireAllCusEntsForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

const PER_LICENSE_ALLOWANCE = 25;

const makePooledLicense = (id: string) => ({
	...products.base({
		id,
		items: [
			items.monthlyMessages({ includedUsage: PER_LICENSE_ALLOWANCE }),
			items.monthlyWords({ includedUsage: 10 }),
		],
	}),
	catalog_type: ProductCatalogType.License,
});

const checkRemaining = async ({
	autumn,
	customerId,
	entityId,
	featureId,
}: {
	autumn: AutumnInt;
	customerId: string;
	entityId?: string;
	featureId: string;
}) => {
	const result = await autumn.check<CheckResponseV3>({
		customer_id: customerId,
		...(entityId ? { entity_id: entityId } : {}),
		feature_id: featureId,
		skip_cache: true,
	});
	return {
		allowed: result.allowed,
		remaining: result.balance?.remaining ?? null,
	};
};

test.concurrent(
	`${chalk.yellowBright("licenses-pooled: capacity-based grant exists before assignment, shared with entities, split from entity-scoped items")}`,
	async () => {
		const parent = products.base({
			id: "pooled-basic-parent",
			items: [items.dashboard()],
		});
		const license = makePooledLicense("pooled-basic-license");

		const { customerId, entities, autumnV2_1, autumnV2_2 } = await initScenario(
			{
				customerId: "license-pooled-basic",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [parent, license] }),
				],
				actions: [],
			},
		);

		await autumnV2_2.post("/licenses.set_plan_license", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included_quantity: 2,
			pooled_feature_ids: [TestFeature.Messages],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});

		const beforeAssignment = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(beforeAssignment.allowed).toBe(true);
		expect(beforeAssignment.remaining).toBe(2 * PER_LICENSE_ALLOWANCE);

		const wordsBeforeAssignment = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Words,
		});
		expect(wordsBeforeAssignment.allowed).toBe(false);

		await autumnV2_2.post("/licenses.assign", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		const assignedEntityMessages = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
		});
		expect(assignedEntityMessages.allowed).toBe(true);
		expect(assignedEntityMessages.remaining).toBe(2 * PER_LICENSE_ALLOWANCE);

		const assignedEntityWords = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Words,
		});
		expect(assignedEntityWords.allowed).toBe(true);
		expect(assignedEntityWords.remaining).toBe(10);

		const unassignedEntityWords = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			entityId: entities[1].id,
			featureId: TestFeature.Words,
		});
		expect(unassignedEntityWords.allowed).toBe(false);

		const unassignedEntityMessages = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			entityId: entities[1].id,
			featureId: TestFeature.Messages,
		});
		expect(unassignedEntityMessages.allowed).toBe(true);

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		await timeout(2000);

		const afterTrack = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(afterTrack.remaining).toBe(2 * PER_LICENSE_ALLOWANCE - 10);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-pooled: assignment churn never re-mints the pooled balance")}`,
	async () => {
		const parent = products.base({
			id: "pooled-churn-parent",
			items: [items.dashboard()],
		});
		const license = makePooledLicense("pooled-churn-license");

		const { customerId, entities, autumnV2_1, autumnV2_2 } = await initScenario(
			{
				customerId: "license-pooled-churn",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [parent, license] }),
				],
				actions: [],
			},
		);

		await autumnV2_2.post("/licenses.set_plan_license", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included_quantity: 1,
			pooled_feature_ids: [TestFeature.Messages],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await timeout(2000);

		const churn = [
			{ assign: entities[0].id },
			{ unassign: entities[0].id },
			{ assign: entities[1].id },
			{ unassign: entities[1].id },
			{ assign: entities[0].id },
		];
		for (const step of churn) {
			if (step.assign) {
				await autumnV2_2.post("/licenses.assign", {
					customer_id: customerId,
					entity_id: step.assign,
					plan_id: license.id,
				});
			}
			if (step.unassign) {
				await autumnV2_2.post("/licenses.unassign", {
					customer_id: customerId,
					entity_id: step.unassign,
					plan_id: license.id,
				});
			}
		}

		const afterChurn = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(afterChurn.remaining).toBe(PER_LICENSE_ALLOWANCE - 5);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-pooled: capacity changes grant positive deltas only, never claw back")}`,
	async () => {
		const parent = products.base({
			id: "pooled-capacity-parent",
			items: [items.dashboard()],
		});
		const license = makePooledLicense("pooled-capacity-license");

		const { customerId, entities, autumnV2_1, autumnV2_2 } = await initScenario(
			{
				customerId: "license-pooled-capacity",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
					s.products({ list: [parent, license] }),
				],
				actions: [],
			},
		);

		const setCapacity = async (includedQuantity: number) => {
			await autumnV2_2.post("/licenses.set_plan_license", {
				parent_plan_id: parent.id,
				license_plan_id: license.id,
				included_quantity: includedQuantity,
				pooled_feature_ids: [TestFeature.Messages],
			});
			await autumnV2_2.post("/licenses.list_pools", {
				customer_id: customerId,
			});
		};

		await setCapacity(1);
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});
		const atOne = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(atOne.remaining).toBe(PER_LICENSE_ALLOWANCE);

		await setCapacity(3);
		const atThree = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(atThree.remaining).toBe(3 * PER_LICENSE_ALLOWANCE);

		await setCapacity(1);
		const backToOne = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(backToOne.remaining).toBe(3 * PER_LICENSE_ALLOWANCE);

		await setCapacity(2);
		const backToTwo = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(backToTwo.remaining).toBe(3 * PER_LICENSE_ALLOWANCE);

		await setCapacity(4);
		const atFour = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(atFour.remaining).toBe(4 * PER_LICENSE_ALLOWANCE);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-pooled: cancel revokes; re-attach in the same cycle restores the frozen balance")}`,
	async () => {
		const parent = products.pro({
			id: "pooled-cancel-parent",
			items: [items.dashboard()],
		});
		const license = makePooledLicense("pooled-cancel-license");

		const { customerId, autumnV2_1, autumnV2_2 } = await initScenario({
			customerId: "license-pooled-cancel",
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
			pooled_feature_ids: [TestFeature.Messages],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await timeout(2000);

		await autumnV2_2.billing.update({
			customer_id: customerId,
			plan_id: parent.id,
			cancel_action: "cancel_immediately",
		});

		const afterCancel = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(afterCancel.allowed).toBe(false);

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});

		const afterReattach = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(afterReattach.allowed).toBe(true);
		expect(afterReattach.remaining).toBe(PER_LICENSE_ALLOWANCE - 5);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-pooled: plain upgrade carries the marker, no re-mint")}`,
	async () => {
		const proPlan = products.pro({
			id: "pooled-upgrade-pro",
			items: [items.dashboard()],
		});
		const premiumPlan = products.premium({
			id: "pooled-upgrade-premium",
			items: [items.dashboard()],
		});
		const license = makePooledLicense("pooled-upgrade-license");

		const { customerId, autumnV2_1, autumnV2_2 } = await initScenario({
			customerId: "license-pooled-upgrade",
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
				pooled_feature_ids: [TestFeature.Messages],
			});
		}
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: proPlan.id,
		});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await timeout(2000);

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premiumPlan.id,
		});

		const afterUpgrade = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(afterUpgrade.allowed).toBe(true);
		expect(afterUpgrade.remaining).toBe(PER_LICENSE_ALLOWANCE - 5);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-pooled: validation rejects invalid pooled feature configs")}`,
	async () => {
		const parent = products.base({
			id: "pooled-validation-parent",
			items: [items.dashboard()],
		});
		const license = {
			...products.base({
				id: "pooled-validation-license",
				items: [
					items.monthlyMessages({ includedUsage: PER_LICENSE_ALLOWANCE }),
					items.dashboard(),
					constructFeatureItem({
						featureId: TestFeature.Storage,
						includedUsage: 10,
						interval: null,
					}),
				],
			}),
			catalog_type: ProductCatalogType.License,
		};

		const { autumnV2_2 } = await initScenario({
			customerId: "license-pooled-validation",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		const setPooled = (pooledFeatureIds: string[]) =>
			autumnV2_2.post("/licenses.set_plan_license", {
				parent_plan_id: parent.id,
				license_plan_id: license.id,
				included_quantity: 1,
				pooled_feature_ids: pooledFeatureIds,
			});

		await expectAutumnError({
			errMessage: "only metered features",
			func: () => setPooled([TestFeature.Dashboard]),
		});
		await expectAutumnError({
			errMessage: "no item for this feature",
			func: () => setPooled([TestFeature.Words]),
		});
		await expectAutumnError({
			errMessage: "reset interval",
			func: () => setPooled([TestFeature.Storage]),
		});
		await expectAutumnError({
			errMessage: "feature not found",
			func: () => setPooled(["does-not-exist"]),
		});

		const valid = (await setPooled([TestFeature.Messages])) as {
			plan_license: { pooled_feature_ids: string[] };
		};
		expect(valid.plan_license.pooled_feature_ids).toEqual([
			TestFeature.Messages,
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-pooled: reset rolls the balance to desired and realigns the marker")}`,
	async () => {
		const parent = products.base({
			id: "pooled-reset-parent",
			items: [items.dashboard()],
		});
		const license = makePooledLicense("pooled-reset-license");

		const { customerId, autumnV2_1, autumnV2_2, ctx } = await initScenario({
			customerId: "license-pooled-reset",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.post("/licenses.set_plan_license", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included_quantity: 2,
			pooled_feature_ids: [TestFeature.Messages],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 15,
		});
		await timeout(2000);

		const beforeReset = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(beforeReset.remaining).toBe(2 * PER_LICENSE_ALLOWANCE - 15);

		await expireAllCusEntsForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		const afterReset = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(afterReset.remaining).toBe(2 * PER_LICENSE_ALLOWANCE);

		await autumnV2_2.post("/licenses.set_plan_license", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included_quantity: 3,
			pooled_feature_ids: [TestFeature.Messages],
		});
		await autumnV2_2.post("/licenses.list_pools", {
			customer_id: customerId,
		});

		const afterCapacityIncrease = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(afterCapacityIncrease.remaining).toBe(3 * PER_LICENSE_ALLOWANCE);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-pooled: customize.licenses on attach pools with per-customer allowance")}`,
	async () => {
		const parent = products.base({
			id: "pooled-customize-parent",
			items: [items.dashboard()],
		});
		const license = makePooledLicense("pooled-customize-license");
		const CUSTOM_ALLOWANCE = 40;

		const { customerId, autumnV2_1, autumnV2_2 } = await initScenario({
			customerId: "license-pooled-customize",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				licenses: [
					{
						license_plan_id: license.id,
						included_quantity: 2,
						pooled_feature_ids: [TestFeature.Messages],
						customize: {
							items: [
								{
									feature_id: TestFeature.Messages,
									included: CUSTOM_ALLOWANCE,
									reset: { interval: "month" },
								},
							],
						},
					},
				],
			},
		});

		const pools = (await autumnV2_2.post("/licenses.list_pools", {
			customer_id: customerId,
		})) as { list: LicensePoolResponse[] };
		expect(pools.list).toHaveLength(1);

		const pooled = await checkRemaining({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(pooled.allowed).toBe(true);
		expect(pooled.remaining).toBe(2 * CUSTOM_ALLOWANCE);
	},
);
