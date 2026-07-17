import { expect, test } from "bun:test";
import type { CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	assignLicense,
	getLicenseDbState,
	listLicensePools,
} from "./licenseTestUtils.js";

// /licenses.update was removed; release takes entity_ids, so assignment_id 404 semantics have no replacement yet.
test.todo(
	"licenses-attach-edge: detach with unknown assignment_id returns 404 — /licenses.update replacement TBD",
	() => {},
);

// attach no longer takes pool_id/parent_plan_id; the pool disambiguation contract is TBD.
test.todo(
	"licenses-attach-edge: pool_id disambiguates pools on subscription-less parents — disambiguation contract TBD",
	() => {},
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
					plan_id: license.id,
					entities: [{ entity_id: entities[1].id }],
				}),
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [{ license_plan_id: license.id, included: 3 }],
		});
		const assignment = await assignLicense({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[1].id,
			licensePlanId: license.id,
		});
		expect(assignment.id).toBeTruthy();

		const pools = await listLicensePools({ autumn: autumnV2_2, customerId });
		expect(pools[0]).toMatchObject({
			granted: 3,
			usage: 2,
			remaining: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-attach-edge: release rejects an assignment owned by another customer")}`,
	async () => {
		const parent = products.base({
			id: "ownership-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "ownership-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { entities, autumnV2_2 } = await initScenario({
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
				await autumnV2_2.post("/licenses.release", {
					customer_id: "license-ownership-b",
					entity_ids: [entities[0].id],
					license_plan_id: license.id,
				}),
		});
	},
);

// /licenses.preview_attach and /licenses.preview_update were removed without replacement.
test.todo(
	"licenses-attach-edge: preview_attach and preview_update report without executing — preview endpoints removed",
	() => {},
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
					plan_id: license.id,
					entities: [{ entity_id: entity.id }],
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
		expect(pools[0]).toMatchObject({
			granted: 1,
			usage: 1,
			remaining: 0,
		});

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
