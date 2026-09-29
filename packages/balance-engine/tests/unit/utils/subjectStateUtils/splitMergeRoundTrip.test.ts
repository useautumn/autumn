import { expect, test } from "bun:test";
import { createSubjectState } from "../../../../src/balanceEngine.js";
import {
	mergeSubjectStates,
	splitSubjectState,
} from "../../../../src/utils/subjectStateUtils/convertSubjectStateUtils.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	occurredAt,
} from "../../engineFixtures.js";

const entity = {
	id: "ent_1",
	internal_id: "ient_1",
	org_id: identity.orgId,
	env: identity.env,
	internal_customer_id: "icus_1",
	created_at: occurredAt,
	name: "entity one",
	feature_id: "seats",
	deleted: false,
} as never;

const usageWindow = (id: string, internalEntityId: string | null) => ({
	id,
	internal_customer_id: "icus_1",
	internal_entity_id: internalEntityId,
	feature_id: "messages",
	internal_feature_id: "feat_messages",
	filter_key: null,
	anchor_customer_entitlement_id: "ce_cust",
	window_start_at: occurredAt,
	window_end_at: occurredAt + 1,
	usage: 1,
	updated_at: occurredAt,
});

const tables = [
	"customerProducts",
	"customerPrices",
	"customerEntitlements",
	"rollovers",
	"replaceables",
	"usageWindows",
	"pooledBalances",
	"openLocks",
	"customerLicenses",
] as const;

test("splitting a view and merging its parts is a round trip, however often it is repeated", () => {
	const customerEntitlement = createCustomerEntitlement({
		id: "ce_cust",
		featureId: "messages",
		customerProductId: "cp_cust",
	} as never);
	const entityEntitlement = {
		...createCustomerEntitlement({
			id: "ce_ent",
			featureId: "messages",
			customerProductId: "cp_ent",
		} as never),
		internal_entity_id: "ient_1",
	};
	const full = createSubjectState({
		identity: { ...identity, entityId: "ent_1" },
		customerProducts: [
			createCustomerProduct({ id: "cp_cust" } as never),
			{
				...createCustomerProduct({ id: "cp_ent" } as never),
				internal_entity_id: "ient_1",
			},
		],
		customerEntitlements: [customerEntitlement, entityEntitlement],
		usageWindows: [
			usageWindow("uw_customer", null),
			usageWindow("uw_entity", "ient_1"),
		],
		entity,
	} as never);
	const countsOf = (state: typeof full) =>
		Object.fromEntries(tables.map((table) => [table, state[table].length]));
	const expected = countsOf(full);

	let { customer, entity: entityPart } = splitSubjectState({ state: full });
	// The windows follow their owner like every other row: one each side, never both.
	expect(customer.usageWindows.map((row) => row.id)).toEqual(["uw_customer"]);
	expect(entityPart?.usageWindows.map((row) => row.id)).toEqual(["uw_entity"]);

	for (let round = 0; round < 8; round++) {
		const merged = mergeSubjectStates({ customer, entity: entityPart });
		expect(countsOf(merged)).toEqual(expected);
		({ customer, entity: entityPart } = splitSubjectState({ state: merged }));
	}
});
