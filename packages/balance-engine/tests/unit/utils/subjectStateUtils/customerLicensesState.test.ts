import { describe, expect, test } from "bun:test";
import {
	createSubjectState,
	customerRowsToSubjectState,
	mergeCustomerAndEntities,
	parseSubjectState,
	splitCustomerAndEntities,
	splitSubjectState,
} from "../../../../src/balanceEngine.js";
import { createEntityState, entity, identity } from "../../engineFixtures.js";

const pool = {
	id: "cl_1",
	link_id: "link_1",
	internal_customer_id: "cus_internal_1",
	parent_customer_product_id: "cp_1",
	license_internal_product_id: "prod_internal_seat",
	plan_license_id: "pl_1",
	granted: 10,
	remaining: 7,
	paid_quantity: 5,
	created_at: 1,
	updated_at: 2,
};

/** As Postgres returns it through a join: extra columns the worker must drop. */
const hydratedPoolRow = { ...pool, joined_column: "dropped" };

const customerWithPool = () =>
	customerRowsToSubjectState({
		identity,
		customer: {
			internal_id: "cus_internal_1",
			id: identity.customerId,
			config: null,
			spend_limits: null,
			overage_allowed: null,
			usage_limits: null,
		},
		customerProducts: [],
		customerPrices: [],
		customerEntitlements: [],
		rollovers: [],
		replaceables: [],
		usageWindows: [],
		customerLicenses: [hydratedPoolRow],
		entity: null,
	});

describe("license pools in subject state", () => {
	test("hydrated rows keep every pool column, and only the pool's columns", () => {
		expect(customerWithPool().customerLicenses).toEqual([pool]);
	});

	test("a state logged before pools existed reads as having none", () => {
		const { customerLicenses: _customerLicenses, ...stored } =
			createSubjectState({
				identity,
			});
		expect(parseSubjectState({ input: stored }).customerLicenses).toEqual([]);
	});

	test("pools belong to the customer: an entity's part never carries them", () => {
		const view = mergeCustomerAndEntities({
			customer: customerWithPool(),
			entities: [createEntityState()],
		});
		const parts = splitCustomerAndEntities({ state: view, entities: [entity] });
		expect(parts.customer.customerLicenses).toEqual([pool]);
		expect(parts.entities[0]?.customerLicenses).toEqual([]);

		const single = splitSubjectState({
			state: { ...view, entity: createEntityState().entity },
		});
		expect(single.customer.customerLicenses).toEqual([pool]);
		expect(single.entity?.customerLicenses).toEqual([]);
	});
});
