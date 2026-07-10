/**
 * High-value coverage for license catalog validation, priced-license billing
 * behavior, and the licenses read API (inventory math, active flags, and the
 * capacity-conflict payload).
 */

import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	ErrCode,
	type LicenseBalanceResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getLicenseDbState } from "./licenseTestUtils.js";

// ═══════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("licenses catalog: interval-mismatch link rejects, matching intervals link succeeds")}`,
	async () => {
		const monthlyParent = products.base({
			id: "interval-monthly-parent",
			items: [items.monthlyPrice({ price: 20 })],
		});
		const annualLicense = products.base({
			id: "interval-annual-license",
			items: [items.annualPrice({ price: 200 })],
		});
		const monthlyLicense = products.base({
			id: "interval-monthly-license",
			items: [items.monthlyPrice({ price: 30 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: "license-interval-mismatch",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [monthlyParent, annualLicense, monthlyLicense] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Billing intervals must match",
			func: () =>
				autumnV2_2.post("/licenses.link", {
					parent_plan_id: monthlyParent.id,
					license_plan_id: annualLicense.id,
					included: 1,
				}),
		});

		const link = (await autumnV2_2.post("/licenses.link", {
			parent_plan_id: monthlyParent.id,
			license_plan_id: monthlyLicense.id,
			included: 1,
		})) as { license_plan_id?: string };
		expect(link).toBeDefined();

		const { list } = (await autumnV2_2.post("/licenses.list_links", {
			parent_plan_id: monthlyParent.id,
		})) as {
			list: Array<{ parent_plan_id: string; license_plan_id: string }>;
		};
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({
			parent_plan_id: monthlyParent.id,
			license_plan_id: monthlyLicense.id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses catalog: self-link rejects")}`,
	async () => {
		const parent = products.base({
			id: "self-link-parent",
			items: [items.dashboard()],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: "license-self-link",
			setup: [s.customer({ testClock: false }), s.products({ list: [parent] })],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "cannot be linked as a license to itself",
			func: () =>
				autumnV2_2.post("/licenses.link", {
					parent_plan_id: parent.id,
					license_plan_id: parent.id,
					included: 1,
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses catalog: archived-license link rejects")}`,
	async () => {
		const parent = products.base({
			id: "archived-link-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "archived-link-license",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: "license-archived-link",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.post(`/products/${license.id}`, { archived: true });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "is archived and cannot be linked",
			func: () =>
				autumnV2_2.post("/licenses.link", {
					parent_plan_id: parent.id,
					license_plan_id: license.id,
					included: 1,
				}),
		});
	},
);

// ═══════════════════════════════════════════════════════════════════
// PRICED
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("licenses-priced: recurring-priced license grants entitlements but assignment never bills")}`,
	async () => {
		const parent = products.base({
			id: "priced-never-bill-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "priced-never-bill-license",
			items: [
				items.monthlyPrice({ price: 30 }),
				items.monthlyMessages({ includedUsage: 100 }),
			],
			group: "priced-never-bill-licenses",
		});

		const { customerId, entities, autumnV1, autumnV2_2 } = await initScenario({
			customerId: "license-priced-never-bill",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 2,
		});

		// Priced license must be attached at the customer level before it can be
		// assigned to an entity.
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: license.id,
		});

		const beforeAssign = await autumnV1.customers.get(customerId);
		const invoiceCountBeforeAssign = (beforeAssign.invoices ?? []).length;

		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		const entityCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(entityCheck.allowed).toBe(true);
		// Customer-level attach grants 100 and the assignment stacks another 100.
		expect(entityCheck.balance?.granted).toBe(200);

		const afterAssign = await autumnV1.customers.get(customerId);
		const invoicesAfterAssign = afterAssign.invoices ?? [];
		// Assigning the license to an entity must not create a new invoice.
		expect(invoicesAfterAssign.length).toBe(invoiceCountBeforeAssign);
	},
);

// ═══════════════════════════════════════════════════════════════════
// API READ
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("licenses: inventory math tracks assign and unassign")}`,
	async () => {
		const parent = products.base({
			id: "inventory-math-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "inventory-math-license",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { customerId, entities, autumnV2_2 } = await initScenario({
			customerId: "license-inventory-math",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 3,
		});

		for (const entity of entities) {
			await autumnV2_2.post("/licenses.attach", {
				customer_id: customerId,
				entity_id: entity.id,
				plan_id: license.id,
			});
		}

		const poolsAfterAssign = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(poolsAfterAssign.list[0].inventory).toMatchObject({
			included: 3,
			assigned: 2,
			available: 1,
		});
		expect(poolsAfterAssign.list[0].assignments).toHaveLength(2);

		const firstAssignmentId =
			poolsAfterAssign.list[0].assignments[0].assignment_id;
		await autumnV2_2.post("/licenses.update", {
			customer_id: customerId,
			cancel_action: "cancel_immediately",
			assignment_id: firstAssignmentId,
		});

		const poolsAfterUnassign = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(poolsAfterUnassign.list[0].inventory).toMatchObject({
			included: 3,
			assigned: 1,
			available: 2,
		});
		expect(poolsAfterUnassign.list[0].assignments).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: list_assignments active flag hides ended assignments by default")}`,
	async () => {
		const parent = products.base({
			id: "active-flag-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "active-flag-license",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { customerId, entities, autumnV2_2 } = await initScenario({
			customerId: "license-active-flag",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});
		const { assignment } = (await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		})) as { assignment: { id: string } };

		await autumnV2_2.post("/licenses.update", {
			customer_id: customerId,
			cancel_action: "cancel_immediately",
			assignment_id: assignment.id,
		});

		const activeOnly = (await autumnV2_2.post("/licenses.list_assignments", {
			customer_id: customerId,
			plan_id: license.id,
		})) as { list: Array<{ id: string; ended_at: number | null }> };
		expect(activeOnly.list.some((row) => row.id === assignment.id)).toBe(false);

		const includingEnded = (await autumnV2_2.post(
			"/licenses.list_assignments",
			{
				customer_id: customerId,
				plan_id: license.id,
				active: false,
			},
		)) as { list: Array<{ id: string; ended_at: number | null }> };
		const endedRow = includingEnded.list.find(
			(row) => row.id === assignment.id,
		);
		expect(endedRow).toBeDefined();
		expect(endedRow?.ended_at).toBeGreaterThan(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: capacity-conflict rejects lowering below active assignments")}`,
	async () => {
		const parent = products.base({
			id: "capacity-conflict-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "capacity-conflict-license",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { customerId, entities, autumnV2_2 } = await initScenario({
			customerId: "license-capacity-conflict",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 3,
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

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"Custom license changes conflict with active license assignments",
			func: () =>
				autumnV2_2.billing.update({
					customer_id: customerId,
					plan_id: parent.id,
					customize: {
						add_licenses: [
							{
								license_plan_id: license.id,
								included: 1,
							},
						],
					},
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses lifecycle: transition to insufficient inherited capacity rejects atomically")}`,
	async () => {
		const group = "license-capacity-transition";
		const source = products.base({
			id: "capacity-transition-source",
			group,
			items: [items.dashboard()],
		});
		const target = products.base({
			id: "capacity-transition-target",
			group,
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "capacity-transition-license",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-capacity-transition",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [source, target, license] }),
			],
			actions: [s.billing.attach({ productId: source.id })],
		});
		for (const [parent, included] of [
			[source, 3],
			[target, 2],
		] as const) {
			await autumnV2_2.post("/licenses.link", {
				parent_plan_id: parent.id,
				license_plan_id: license.id,
				included,
			});
		}
		for (const entity of entities) {
			await autumnV2_2.post("/licenses.attach", {
				customer_id: customerId,
				entity_id: entity.id,
				plan_id: license.id,
			});
		}
		const before = await getLicenseDbState({ db: ctx.db, customerId });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "active license assignments",
			func: () =>
				autumnV2_2.billing.attach({
					customer_id: customerId,
					plan_id: target.id,
				}),
		});

		const after = await getLicenseDbState({ db: ctx.db, customerId });
		expect(
			after.assignments.map(
				({ id, status, license_parent_customer_product_id }) => ({
					id,
					status,
					parentId: license_parent_customer_product_id,
				}),
			),
		).toEqual(
			before.assignments.map(
				({ id, status, license_parent_customer_product_id }) => ({
					id,
					status,
					parentId: license_parent_customer_product_id,
				}),
			),
		);
		expect(after.pools).toEqual(before.pools);
	},
);
