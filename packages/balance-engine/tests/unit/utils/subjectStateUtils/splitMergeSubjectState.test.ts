import { describe, expect, test } from "bun:test";
import { fullSubjectToCustomerEntitlements } from "@autumn/shared";
import {
	createSubjectState,
	mergeSubjectStates,
	splitSubjectState,
} from "../../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createSubjectFor,
	identity,
} from "../../engineFixtures.js";

const entity = {
	id: "ent_42",
	internal_id: "ent_internal_42",
	internal_customer_id: "cus_internal_1",
	feature_id: "seats",
};
const customerRow = createCustomerEntitlement({ id: "messages_customer" });
const entityRow = {
	...createCustomerEntitlement({ id: "messages_ent_42" }),
	internal_entity_id: entity.internal_id,
};
const entityRollover = {
	id: "ro_ent",
	cus_ent_id: entityRow.id,
	balance: 3,
	usage: 0,
	expires_at: null,
	entities: {},
};
const customerRollover = {
	id: "ro_cus",
	cus_ent_id: customerRow.id,
	balance: 2,
	usage: 0,
	expires_at: null,
	entities: {},
};

const view = createSubjectState({
	identity: { ...identity, entityId: entity.id },
	customerProducts: [createCustomerProduct()],
	customerEntitlements: [customerRow, entityRow],
	rollovers: [customerRollover, entityRollover],
	entity,
});

describe("subject states", () => {
	test("a merged state splits into the customer's and the entity's, each owning its rows", () => {
		const states = splitSubjectState({ state: view });

		expect(states.customer.identity.entityId).toBeNull();
		expect(states.customer.customerEntitlements.map((row) => row.id)).toEqual([
			"messages_customer",
		]);
		expect(states.customer.rollovers.map((row) => row.id)).toEqual(["ro_cus"]);
		expect(states.customer.entity).toBeNull();
		expect(states.entity).toMatchObject({
			identity: { ...identity, entityId: "ent_42" },
			customerEntitlements: [entityRow],
			rollovers: [entityRollover],
			customerProducts: [],
			entity,
		});
	});

	test("customer state merged with the entity's is the original", () => {
		const states = splitSubjectState({ state: view });

		expect(
			mergeSubjectStates({
				customer: states.customer,
				entity: states.entity,
			}),
		).toEqual(view);
		expect(mergeSubjectStates({ customer: states.customer })).toEqual(
			states.customer,
		);
	});

	test("the shared selection orders an entity's own rows before the customer-level rows it shares", () => {
		const fundingOf = (entityId: string | null) =>
			fullSubjectToCustomerEntitlements({
				fullSubject: createSubjectFor({ state: view, entityId }),
				featureIds: ["messages"],
			}).map((row) => row.id);

		expect(fundingOf(null)).toEqual(["messages_customer"]);
		expect(fundingOf("ent_42")).toEqual([
			"messages_ent_42",
			"messages_customer",
		]);
	});
});
