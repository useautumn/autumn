/**
 * TDD tests for license assign/unassign edge cases.
 *
 * Red-failure mode (current behavior):
 *  - licenses.detach with an unknown assignment_id returns 200 with an
 *    undefined assignment (silent no-op) instead of 404.
 *  - When two active pools offer the same license and the parents are free
 *    plans (no subscription id), assignment is impossible: the API demands
 *    parent_subscription_id but free parents have none, and pool_id is not
 *    accepted.
 *
 * Green-success criteria (after fix):
 *  - Unknown assignment_id → 404.
 *  - licenses.attach accepts pool_id to target an exact pool; without it the
 *    ambiguous case still fails with a clear error.
 */

import { expect, test } from "bun:test";
import type { LicensePoolResponse } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("licenses-attach-edge: detach with unknown assignment_id returns 404")}`,
	async () => {
		const { autumnV2_2 } = await initScenario({
			customerId: "license-unassign-404",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await expectAutumnError({
			errMessage: "not found",
			func: async () =>
				await autumnV2_2.post("/licenses.update", {
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
			actions: [],
		});

		for (const parentId of [parentA.id, parentB.id]) {
			await autumnV2_2.post("/licenses.link", {
				parent_plan_id: parentId,
				license_plan_id: license.id,
				included: 1,
			});
			await autumnV2_2.billing.attach({
				customer_id: customerId,
				plan_id: parentId,
			});
		}

		const pools = (await autumnV2_2.post("/licenses.list_pools", {
			customer_id: customerId,
			entity_id: entities[0].id,
		})) as { list: LicensePoolResponse[] };
		expect(pools.list).toHaveLength(2);

		await expectAutumnError({
			errMessage: "Multiple license pools",
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
			pool_id: pools.list[0].pool_id,
		})) as { assignment: { id: string; ended_at: number | null } };
		expect(assignment.id).toBeTruthy();
		expect(assignment.ended_at).toBeNull();
	},
);
