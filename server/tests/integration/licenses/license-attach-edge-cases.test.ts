import { expect, test } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	getLicenseDbState,
	listLicenseAssignments,
	listLicensePools,
} from "./licenseTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("licenses-attach-edge: detach with unknown assignment_id returns 404")}`,
	async () => {
		const customerId = "license-unassign-404";
		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await expectAutumnError({
			errMessage: "not found",
			func: async () =>
				await autumnV2_2.post("/licenses.update", {
					customer_id: customerId,
					cancel_action: "cancel_immediately",
					assignment_id: "lic_asn_does_not_exist",
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-attach-edge: pool_id disambiguates pools on subscription-less parents")}`,
	async () => {
		const parentA = products.base({
			id: "assign-edge-parent-a",
			items: [items.dashboard()],
			group: "assign-edge-group-a",
		});
		const parentB = products.base({
			id: "assign-edge-parent-b",
			items: [items.dashboard()],
			group: "assign-edge-group-b",
		});
		const license = {
			...products.base({
				id: "assign-edge-license",
				items: [items.monthlyMessages({ includedUsage: 25 })],
			}),
		};

		const { customerId, entities, autumnV2_2 } = await initScenario({
			customerId: "license-assign-pool-id",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parentA, parentB, license] }),
			],
			actions: [
				...[parentA, parentB].flatMap((parent) => [
					s.licenses.link({
						parentProductId: parent.id,
						licenseProductId: license.id,
						included: 1,
					}),
					s.billing.attach({ productId: parent.id }),
				]),
			],
		});

		const pools = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
		});
		expect(pools).toHaveLength(2);

		await expectAutumnError({
			errMessage: "Multiple plans offer",
			func: async () =>
				await autumnV2_2.post("/licenses.attach", {
					customer_id: customerId,
					entity_id: entities[0].id,
					plan_id: license.id,
				}),
		});

		const { assignment } = (await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
			parent_plan_id: pools[0].parent_plan_id,
		})) as { assignment: { id: string; ended_at: number | null } };
		expect(assignment.id).toBeTruthy();
		expect(assignment.ended_at).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-attach-edge: raised catalog grant is assignable before any reconcile")}`,
	async () => {
		const customerId = "license-raise-included";
		const parent = products.base({
			id: "raise-included-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "raise-included-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { entities, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: license.id,
					entityIndex: 0,
				}),
			],
		});
		await expectAutumnError({
			errMessage: "No available licenses",
			func: async () =>
				await autumnV2_2.post("/licenses.attach", {
					customer_id: customerId,
					entity_id: entities[1].id,
					plan_id: license.id,
				}),
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 3,
		});
		const { assignment } = (await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[1].id,
			plan_id: license.id,
		})) as { assignment: { id: string } };
		expect(assignment.id).toBeTruthy();

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		expect(pools[0].inventory).toMatchObject({
			included: 3,
			assigned: 2,
			available: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-attach-edge: update rejects an assignment owned by another customer")}`,
	async () => {
		const parent = products.base({
			id: "ownership-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "ownership-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const {
			autumnV2_2,
			licenseAssignments: [assignment],
		} = await initScenario({
			customerId: "license-ownership-a",
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: "license-ownership-b" }]),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
				s.licenses.assign({
					licenseProductId: license.id,
					entityIndex: 0,
				}),
			],
		});

		await expectAutumnError({
			errMessage: "not found",
			func: async () =>
				await autumnV2_2.post("/licenses.update", {
					customer_id: "license-ownership-b",
					assignment_id: assignment.id,
					cancel_action: "cancel_immediately",
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-attach-edge: preview_attach and preview_update report without executing")}`,
	async () => {
		const customerId = "license-preview";
		const parent = products.base({
			id: "preview-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "preview-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { entities, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 2,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		const attachPreview = (await autumnV2_2.post("/licenses.preview_attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		})) as { intent: string; available: number };
		expect(attachPreview.intent).toBe("assign");
		expect(attachPreview.available).toBe(2);

		const assignments = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
		});
		expect(assignments).toHaveLength(0);

		const { assignment } = (await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		})) as { assignment: { id: string } };

		const updatePreview = (await autumnV2_2.post("/licenses.preview_update", {
			customer_id: customerId,
			assignment_id: assignment.id,
			cancel_action: "cancel_immediately",
		})) as { intent: string; ended_at: number };
		expect(updatePreview.intent).toBe("cancel_immediately");
		expect(updatePreview.ended_at).toBeGreaterThan(0);

		const stillActive = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
		});
		expect(stillActive).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-attach-edge: concurrent claims cannot over-allocate the final seat")}`,
	async () => {
		const parent = products.base({
			id: "assign-race-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "assign-race-license",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-assign-final-seat",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});
		const results = await Promise.allSettled(
			entities.map((entity) =>
				autumnV2_2.post("/licenses.attach", {
					customer_id: customerId,
					entity_id: entity.id,
					plan_id: license.id,
				}),
			),
		);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected"),
		).toHaveLength(1);

		const dbState = await getLicenseDbState({ db: ctx.db, customerId });
		expect(
			dbState.assignments.filter(({ status }) => status === "active"),
		).toHaveLength(1);
		expect(dbState.pools).toHaveLength(1);
		expect(dbState.pools[0]).toMatchObject({ granted: 1, remaining: 0 });

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		expect(pools).toHaveLength(1);
		expect(pools[0].inventory).toEqual({
			included: 1,
			assigned: 1,
			available: 0,
		});
		expect(pools[0].assignments).toHaveLength(1);

		const checks = await Promise.all(
			entities.map((entity) =>
				autumnV2_2.check<CheckResponseV3>({
					customer_id: customerId,
					entity_id: entity.id,
					feature_id: TestFeature.Messages,
					skip_cache: true,
				}),
			),
		);
		expect(checks.filter((check) => check.allowed)).toHaveLength(1);
	},
);
