import { describe, expect, test } from "bun:test";
import { fullSubjectToCustomerEntitlements } from "@autumn/shared";
import {
	createSubjectState,
	subjectBlobsToSubjectState,
	subjectStateToSubjectBlobs,
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
};
const customerRollover = {
	id: "ro_cus",
	cus_ent_id: customerRow.id,
	balance: 2,
	usage: 0,
	expires_at: null,
};

const view = createSubjectState({
	identity,
	customerProducts: [createCustomerProduct()],
	customerEntitlements: [customerRow, entityRow],
	rollovers: [customerRollover, entityRollover],
	entities: [entity],
});

describe("subject blobs", () => {
	test("a view splits into the customer's blob and one blob per entity with rows", () => {
		const blobs = subjectStateToSubjectBlobs({ state: view });

		expect(blobs.customer.identity.entityId).toBeNull();
		expect(blobs.customer.customerEntitlements.map((row) => row.id)).toEqual([
			"messages_customer",
		]);
		expect(blobs.customer.rollovers.map((row) => row.id)).toEqual(["ro_cus"]);
		expect(blobs.customer.entities).toEqual([entity]);
		expect(blobs.entities).toHaveLength(1);
		expect(blobs.entities[0]).toMatchObject({
			identity: { ...identity, entityId: "ent_42" },
			customerEntitlements: [entityRow],
			rollovers: [entityRollover],
			customerProducts: [],
			entities: [],
		});
	});

	test("customer blob plus the entity's blob is the original view", () => {
		const blobs = subjectStateToSubjectBlobs({ state: view });

		expect(
			subjectBlobsToSubjectState({
				customer: blobs.customer,
				entity: blobs.entities[0],
			}),
		).toEqual(view);
		expect(subjectBlobsToSubjectState({ customer: blobs.customer })).toEqual(
			blobs.customer,
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
