import { expect, test } from "bun:test";
import type { ApiCustomerLicenseV0 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { reconcileLicenseStateForCustomer } from "@/internal/licenses/actions/reconcile/reconcileLicenseState.js";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo.js";

const makeLicenseProduct = (id: string) =>
	products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 25 })],
	});

type PoolsResponse = { list: ApiCustomerLicenseV0[] };
type AssignmentsResponse = {
	list: Array<{ id: string; entity_id: string; ended_at: number | null }>;
};

const findPool = (pools: PoolsResponse, parentPlanId: string) =>
	pools.list.find((pool) => pool.parent_plan_id === parentPlanId);

test.concurrent(
	`${chalk.yellowBright("licenses-reconcile: self-heals a drifted remaining balance")}`,
	async () => {
		const parent = products.pro({
			id: "reconcile-heal-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("reconcile-heal-license");

		const { customerId, entities, ctx, autumnV2_2 } = await initScenario({
			customerId: "licenses-reconcile-self-heal",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [{ license_plan_id: license.id, included: 2 }],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		const healthy = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as PoolsResponse;
		expect(healthy.list).toHaveLength(1);
		expect(healthy.list[0].inventory).toMatchObject({
			included: 2,
			assigned: 1,
			available: 1,
		});

		// Grab the balance row from reconcile's mirrored state, then corrupt
		// remaining to simulate a lost/duplicated atomic take.
		const state = await reconcileLicenseStateForCustomer({
			ctx,
			idOrInternalId: customerId,
		});
		if (!state) throw new Error("expected customer to touch licenses");
		expect(state.customerLicenses).toHaveLength(1);
		const balance = state.customerLicenses[0];

		await customerLicenseRepo.setRemaining({
			db: ctx.db,
			customerLicenseId: balance.id,
			remaining: 2,
		});

		// Drift landed: the raw row now reads remaining 2 with one live assignment.
		const drifted = await customerLicenseRepo.getByParentAndLicense({
			db: ctx.db,
			parentCustomerProductId: balance.parent_customer_product_id,
			licenseInternalProductId: balance.license_internal_product_id,
		});
		expect(drifted?.remaining).toBe(2);

		// Next reconcile self-heals remaining back to granted - live assignments.
		await reconcileLicenseStateForCustomer({ ctx, idOrInternalId: customerId });

		const healed = await customerLicenseRepo.getByParentAndLicense({
			db: ctx.db,
			parentCustomerProductId: balance.parent_customer_product_id,
			licenseInternalProductId: balance.license_internal_product_id,
		});
		expect(healed?.remaining).toBe(1);

		const healedList = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as PoolsResponse;
		expect(healedList.list[0].inventory).toMatchObject({
			included: 2,
			assigned: 1,
			available: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-reconcile: reconcile is idempotent across back-to-back runs")}`,
	async () => {
		const parent = products.pro({
			id: "reconcile-idem-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("reconcile-idem-license");

		const { customerId, entities, ctx, autumnV2_2 } = await initScenario({
			customerId: "licenses-reconcile-idempotency",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [{ license_plan_id: license.id, included: 2 }],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		await reconcileLicenseStateForCustomer({ ctx, idOrInternalId: customerId });
		const first = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as PoolsResponse;

		await reconcileLicenseStateForCustomer({ ctx, idOrInternalId: customerId });
		const second = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as PoolsResponse;

		expect(second).toEqual(first);

		const assignments = (await autumnV2_2.post("/licenses.list_assignments", {
			customer_id: customerId,
			plan_id: license.id,
		})) as AssignmentsResponse;
		const openAssignments = assignments.list.filter(
			(assignment) => assignment.ended_at === null,
		);
		expect(openAssignments).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-reconcile: assignment stays on one deterministic parent when two live parents offer the license")}`,
	async () => {
		const planA = products.pro({
			id: "reconcile-multi-a",
			items: [items.dashboard()],
			group: "reconcile-multi-a",
		});
		const planB = products.pro({
			id: "reconcile-multi-b",
			items: [items.dashboard()],
			group: "reconcile-multi-b",
		});
		const license = makeLicenseProduct("reconcile-multi-license");

		const { customerId, entities, ctx, autumnV2_2 } = await initScenario({
			customerId: "licenses-reconcile-multi-live",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [planA, planB, license] }),
			],
			actions: [],
		});

		for (const planId of [planA.id, planB.id]) {
			await autumnV2_2.post("/plans.update", {
				plan_id: planId,
				licenses: [{ license_plan_id: license.id, included: 2 }],
			});
		}

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: planA.id,
		});
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		// Second live parent, distinct group so A stays live (not an upgrade).
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: planB.id,
		});

		await reconcileLicenseStateForCustomer({ ctx, idOrInternalId: customerId });
		const first = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as PoolsResponse;
		expect(first.list).toHaveLength(2);

		const firstPoolA = findPool(first, planA.id);
		const firstPoolB = findPool(first, planB.id);
		expect(firstPoolA?.inventory).toMatchObject({
			included: 2,
			assigned: 1,
			available: 1,
		});
		expect(firstPoolB?.inventory).toMatchObject({
			included: 2,
			assigned: 0,
			available: 2,
		});
		expect(firstPoolA?.assignments).toHaveLength(1);
		expect(firstPoolB?.assignments).toHaveLength(0);

		// Determinism: a repeat reconcile lands the assignment on the same parent.
		await reconcileLicenseStateForCustomer({ ctx, idOrInternalId: customerId });
		const second = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as PoolsResponse;
		expect(second).toEqual(first);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-reconcile: partial successor re-parents the linked license and ends the unlinked one")}`,
	async () => {
		const parentP = products.pro({
			id: "reconcile-partial-parent",
			items: [items.dashboard()],
		});
		const successorQ = products.premium({
			id: "reconcile-partial-successor",
			items: [items.dashboard()],
		});
		const licenseX = makeLicenseProduct("reconcile-partial-x");
		const licenseY = makeLicenseProduct("reconcile-partial-y");

		const { customerId, entities, ctx, autumnV2_2 } = await initScenario({
			customerId: "licenses-reconcile-partial-successor",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parentP, successorQ, licenseX, licenseY] }),
			],
			actions: [],
		});

		// P links both X and Y; the successor Q links only X.
		await autumnV2_2.post("/plans.update", {
			plan_id: parentP.id,
			licenses: [
				{ license_plan_id: licenseX.id, included: 1 },
				{ license_plan_id: licenseY.id, included: 1 },
			],
		});
		await autumnV2_2.post("/plans.update", {
			plan_id: successorQ.id,
			licenses: [{ license_plan_id: licenseX.id, included: 1 }],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parentP.id,
		});
		for (const licensePlanId of [licenseX.id, licenseY.id]) {
			await autumnV2_2.post("/licenses.attach", {
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: licensePlanId,
			});
		}

		// Upgrade P -> Q (same group) expires P and strands both assignments.
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: successorQ.id,
		});
		await reconcileLicenseStateForCustomer({ ctx, idOrInternalId: customerId });

		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as PoolsResponse;
		expect(pools.list).toHaveLength(1);
		expect(pools.list[0]).toMatchObject({
			parent_plan_id: successorQ.id,
			license_plan_id: licenseX.id,
			inventory: { included: 1, assigned: 1, available: 0 },
		});
		expect(pools.list[0].assignments).toHaveLength(1);

		const xAssignments = (await autumnV2_2.post("/licenses.list_assignments", {
			customer_id: customerId,
			plan_id: licenseX.id,
			active: false,
		})) as AssignmentsResponse;
		const openX = xAssignments.list.filter(
			(assignment) => assignment.ended_at === null,
		);
		expect(openX).toHaveLength(1);

		const yAssignments = (await autumnV2_2.post("/licenses.list_assignments", {
			customer_id: customerId,
			plan_id: licenseY.id,
			active: false,
		})) as AssignmentsResponse;
		const openY = yAssignments.list.filter(
			(assignment) => assignment.ended_at === null,
		);
		expect(openY).toHaveLength(0);
		const endedY = yAssignments.list.filter(
			(assignment) => (assignment.ended_at ?? 0) > 0,
		);
		expect(endedY.length).toBeGreaterThan(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses-reconcile: lowering granted preserves in-flight assignments")}`,
	async () => {
		const parent = products.pro({
			id: "reconcile-granted-parent",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct("reconcile-granted-license");

		const { customerId, entities, ctx, autumnV2_2 } = await initScenario({
			customerId: "licenses-reconcile-granted-decrease",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [{ license_plan_id: license.id, included: 3 }],
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
		});
		for (const entity of entities) {
			await autumnV2_2.post("/licenses.attach", {
				customer_id: customerId,
				entity_id: entity.id,
				plan_id: license.id,
			});
		}

		// Drop capacity to exactly the active count; both assignments survive.
		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [{ license_plan_id: license.id, included: 2 }],
		});
		await reconcileLicenseStateForCustomer({ ctx, idOrInternalId: customerId });

		const tight = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as PoolsResponse;
		expect(tight.list).toHaveLength(1);
		expect(tight.list[0].inventory).toMatchObject({
			included: 2,
			assigned: 2,
			available: 0,
		});
		expect(tight.list[0].assignments).toHaveLength(2);

		const activeAssignments = (await autumnV2_2.post(
			"/licenses.list_assignments",
			{
				customer_id: customerId,
				plan_id: license.id,
			},
		)) as AssignmentsResponse;
		const openActive = activeAssignments.list.filter(
			(assignment) => assignment.ended_at === null,
		);
		expect(openActive).toHaveLength(2);

		// Raising capacity frees the difference back into availability.
		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [{ license_plan_id: license.id, included: 4 }],
		});
		await reconcileLicenseStateForCustomer({ ctx, idOrInternalId: customerId });

		const roomy = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as PoolsResponse;
		expect(roomy.list[0].inventory).toMatchObject({
			included: 4,
			assigned: 2,
			available: 2,
		});
	},
);
