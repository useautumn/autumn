import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	type CheckResponseV3,
	ErrCode,
	type ProductV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import {
	listLicenseAssignments,
	listLicensePools,
	type TestLicenseAssignment,
} from "./licenseTestUtils.js";

const makeLicenseProduct = () => ({
	...products.base({
		id: "seat-license",
		items: [items.monthlyMessages({ includedUsage: 25 })],
	}),
});

test.concurrent(
	`${chalk.yellowBright("licenses: assignment lazily provisions entity-scoped grant")}`,
	async () => {
		const parent = products.base({
			id: "parent-plan",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct();

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "license-lazy-assign",
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

		const { products: licenseProducts } = (await autumnV2_2.get(
			"/products/license_products",
		)) as { products: ProductV2[] };
		const licenseProduct = licenseProducts.find(
			(product) => product.id === license.id,
		);
		expect(licenseProduct).toBeDefined();
		expect(licenseProducts.some((product) => product.id === parent.id)).toBe(
			false,
		);

		const { list: planProducts } = (await autumnV2_2.get("/products")) as {
			list: Array<{ id?: string; plan_id?: string }>;
		};
		expect(
			planProducts.some(
				(product) =>
					product.id === license.id || product.plan_id === license.id,
			),
		).toBe(true);

		const poolsBeforeAssign = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
		});
		expect(poolsBeforeAssign).toHaveLength(1);
		expect(poolsBeforeAssign[0]).toMatchObject({
			license_plan_id: license.id,
			license_plan_name: license.name,
			inventory: {
				included: 1,
				assigned: 0,
				available: 1,
			},
			assignments: [],
		});

		const customerBefore = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(customerBefore.allowed).toBe(false);

		const { assignment } = (await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		})) as { assignment: TestLicenseAssignment };
		expect(assignment).toMatchObject({
			entity_id: entities[0].id,
			license_plan_id: license.id,
			ended_at: null,
		});
		expect("internal_customer_id" in assignment).toBe(false);
		expect("internal_entity_id" in assignment).toBe(false);
		expect("license_internal_product_id" in assignment).toBe(false);
		expect(assignment.id).toBeTruthy();
		expect(assignment.started_at).toBeGreaterThan(0);

		const poolsAfterAssign = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
		});
		expect(poolsAfterAssign[0]).toMatchObject({
			license_plan_id: license.id,
			inventory: {
				included: 1,
				assigned: 1,
				available: 0,
			},
			assignments: [
				{
					entity_id: entities[0].id,
					license_plan_id: license.id,
				},
			],
		});
		expect(poolsAfterAssign[0].assignments[0].assignment_id).toBeTruthy();
		expect(poolsAfterAssign[0].assignments[0].started_at).toBeGreaterThan(0);
		const assignmentId = poolsAfterAssign[0].assignments[0].assignment_id;
		expect(assignmentId).toBe(assignment.id);

		const activeAssignments = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
			licensePlanId: license.id,
		});
		expect(activeAssignments).toHaveLength(1);
		expect(activeAssignments[0]).toMatchObject({
			id: assignmentId,
			entity_id: entities[0].id,
			license_plan_id: license.id,
			ended_at: null,
		});
		expect("internal_customer_id" in activeAssignments[0]).toBe(false);

		const assignedEntity = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(assignedEntity.allowed).toBe(true);

		const otherEntity = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
		});
		expect(otherEntity.allowed).toBe(false);

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.post("/licenses.attach", {
					customer_id: customerId,
					entity_id: entities[1].id,
					plan_id: license.id,
				}),
		});

		const assignmentsAfterExhaustedAttempt = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			licensePlanId: license.id,
		});
		expect(assignmentsAfterExhaustedAttempt).toHaveLength(1);

		const customerAfter = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(customerAfter.allowed).toBe(false);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expect(
			customer.subscriptions.some(
				(subscription) => subscription.plan_id === license.id,
			),
		).toBe(false);

		const page = await CusService.getProductsPage({
			ctx,
			idOrInternalId: customerId,
			params: { start_cursor: "", limit: 10, show_expired: false },
		});
		expect(page.list.some((item) => item.product.id === license.id)).toBe(
			false,
		);

		const { assignment: endedAssignment } = (await autumnV2_2.post(
			"/licenses.update",
			{
				customer_id: customerId,
				cancel_action: "cancel_immediately",
				assignment_id: assignmentId,
			},
		)) as {
			assignment: {
				id: string;
				entity_id: string;
				license_plan_id: string;
				ended_at: number | null;
			};
		};
		expect(endedAssignment.id).toBe(assignmentId);
		expect(endedAssignment.entity_id).toBe(entities[0].id);
		expect(endedAssignment.license_plan_id).toBe(license.id);
		expect(endedAssignment.ended_at).toBeGreaterThan(0);

		const activeAssignmentsAfterUnassign = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
			licensePlanId: license.id,
		});
		expect(activeAssignmentsAfterUnassign).toHaveLength(0);

		const allAssignmentsAfterUnassign = await listLicenseAssignments({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
			licensePlanId: license.id,
			active: false,
		});
		expect(allAssignmentsAfterUnassign[0].id).toBe(assignmentId);
		expect(allAssignmentsAfterUnassign[0].ended_at).toBeGreaterThan(0);

		const poolsAfterUnassign = await listLicensePools({
			autumn: autumnV2_2,
			customerId,
			entityId: entities[0].id,
		});
		expect(poolsAfterUnassign[0]).toMatchObject({
			inventory: {
				included: 1,
				assigned: 0,
				available: 1,
			},
			assignments: [],
		});

		const unassignedEntity = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(unassignedEntity.allowed).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("licenses: license plans attach directly like any plan")}`,
	async () => {
		const parent = products.base({
			id: "parent-plan",
			items: [items.dashboard()],
		});
		const license = makeLicenseProduct();

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "license-rejects",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: license.id,
			redirect_mode: "if_required",
		});
		const attached = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(attached.allowed).toBe(true);
	},
);
