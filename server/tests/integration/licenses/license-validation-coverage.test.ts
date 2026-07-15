import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	type CheckResponseV3,
	ErrCode,
} from "@autumn/shared";
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
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 2,
				}),
				s.billing.attach({ productId: parent.id }),
				s.billing.attach({ productId: license.id }),
			],
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
		expect(entityCheck.balance?.granted).toBe(200);

		const afterAssign = await autumnV1.customers.get(customerId);
		const invoicesAfterAssign = afterAssign.invoices ?? [];
		expect(invoicesAfterAssign.length).toBe(invoiceCountBeforeAssign);
	},
);

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
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 3,
				}),
				s.billing.attach({ productId: parent.id }),
			],
		});

		for (const entity of entities) {
			await autumnV2_2.post("/licenses.attach", {
				customer_id: customerId,
				entity_id: entity.id,
				plan_id: license.id,
			});
		}

		const poolsAfterAssign = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
		});
		expect(poolsAfterAssign[0]).toMatchObject({
			granted: 3,
			usage: 2,
			remaining: 1,
		});
		const assignmentsAfterAssign = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			active: true,
		});
		expect(assignmentsAfterAssign).toHaveLength(2);

		await autumnV2_2.post("/licenses.release", {
			customer_id: customerId,
			entity_ids: [entities[0].id],
			license_plan_id: license.id,
		});

		const poolsAfterUnassign = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
		});
		expect(poolsAfterUnassign[0]).toMatchObject({
			granted: 3,
			usage: 1,
			remaining: 2,
		});
		const assignmentsAfterUnassign = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			active: true,
		});
		expect(assignmentsAfterUnassign).toHaveLength(1);
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

		const {
			customerId,
			autumnV2_2,
			licenseAssignments: [assignment],
		} = await initScenario({
			customerId: "license-active-flag",
			setup: [
				s.customer({ testClock: false }),
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

		await autumnV2_2.post("/licenses.update", {
			customer_id: customerId,
			cancel_action: "cancel_immediately",
			assignment_id: assignment.id,
		});

		const activeOnly = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			licensePlanId: license.id,
		});
		expect(activeOnly.some((row) => row.id === assignment.id)).toBe(false);

		const includingEnded = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			licensePlanId: license.id,
			active: false,
		});
		const endedRow = includingEnded.find((row) => row.id === assignment.id);
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

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "license-capacity-conflict",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 3,
				}),
				s.billing.attach({ productId: parent.id }),
				...[0, 1].map((entityIndex) =>
					s.licenses.assign({ licenseProductId: license.id, entityIndex }),
				),
			],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"Custom license changes conflict with active license assignments",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: parent.id,
					customize: {
						upsert_licenses: [
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
		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "license-capacity-transition",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [source, target, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: source.id,
					licenseProductId: license.id,
					included: 3,
				}),
				s.licenses.link({
					parentProductId: target.id,
					licenseProductId: license.id,
					included: 2,
				}),
				s.billing.attach({ productId: source.id }),
				...[0, 1, 2].map((entityIndex) =>
					s.licenses.assign({ licenseProductId: license.id, entityIndex }),
				),
			],
		});
		const before = await getLicenseDbState({ db: ctx.db, customerId });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "active license assignments",
			func: () =>
				autumnV2_2.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: target.id,
				}),
		});

		const after = await getLicenseDbState({ db: ctx.db, customerId });
		expect(
			after.assignments.map(({ id, status, customer_license_link_id }) => ({
				id,
				status,
				linkId: customer_license_link_id,
			})),
		).toEqual(
			before.assignments.map(({ id, status, customer_license_link_id }) => ({
				id,
				status,
				linkId: customer_license_link_id,
			})),
		);
		expect(after.pools).toEqual(before.pools);
	},
);
