/**
 * TDD regression: an unlimited entity-scoped entitlement must seed its
 * per-entity map for every existing entity at attach time (legacy parity).
 *
 * Red: the v2 init returned `entities: null` for unlimited grants. The next
 * entity creation then seeded the map with only the new entity, and
 * cusEntMatchesEntity locked every older entity out of the grant.
 */

import { expect, test } from "bun:test";
import {
	AllowanceType,
	type EntitlementWithFeature,
	type Entity,
	FeatureType,
} from "@autumn/shared";
import { initCustomerEntitlementBalance } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerEntitlement/initCustomerEntitlementBalance";

const entity = ({
	id,
	featureId,
}: {
	id: string;
	featureId: string;
}): Entity => ({
	id,
	org_id: "org_unit",
	created_at: 0,
	internal_id: `internal_${id}`,
	internal_customer_id: "internal_cus_unit",
	env: "sandbox",
	name: id,
	deleted: false,
	feature_id: featureId,
	internal_feature_id: `feat_${featureId}`,
});

const unlimitedEntitlement = ({
	entityFeatureId,
}: {
	entityFeatureId: string | null;
}) =>
	({
		id: "ent_documents_unlimited",
		created_at: 0,
		internal_feature_id: "feat_documents",
		internal_product_id: "prod_unit",
		is_custom: false,
		allowance_type: AllowanceType.Unlimited,
		allowance: null,
		interval: null,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: entityFeatureId,
		usage_limit: null,
		rollover: null,
		feature_id: "documents",
		feature: {
			id: "documents",
			internal_id: "feat_documents",
			type: FeatureType.Metered,
		},
	}) as EntitlementWithFeature;

const initContext = ({ entities }: { entities: Entity[] }) =>
	({
		fullCustomer: {
			id: "cus_unit",
			internal_id: "internal_cus_unit",
			entities,
		},
		fullProduct: { id: "prod_unit", prices: [] },
		featureQuantities: [],
	}) as unknown as Parameters<
		typeof initCustomerEntitlementBalance
	>[0]["initContext"];

test("unlimited entity-scoped entitlement seeds a zero entry for every matching entity", () => {
	const result = initCustomerEntitlementBalance({
		initContext: initContext({
			entities: [
				entity({ id: "workspace_1", featureId: "workspaces" }),
				entity({ id: "workspace_2", featureId: "workspaces" }),
				entity({ id: "seat_1", featureId: "seats" }),
			],
		}),
		entitlement: unlimitedEntitlement({ entityFeatureId: "workspaces" }),
	});

	expect(result.balance).toBe(0);
	expect(result.entities).toEqual({
		workspace_1: {
			id: "workspace_1",
			balance: 0,
			adjustment: 0,
			additional_balance: 0,
		},
		workspace_2: {
			id: "workspace_2",
			balance: 0,
			adjustment: 0,
			additional_balance: 0,
		},
	});
});

test("unlimited entity-scoped entitlement with no entities yet seeds an empty map", () => {
	const result = initCustomerEntitlementBalance({
		initContext: initContext({ entities: [] }),
		entitlement: unlimitedEntitlement({ entityFeatureId: "workspaces" }),
	});

	expect(result).toEqual({ balance: 0, entities: {} });
});

test("unlimited customer-level entitlement keeps a null entity map", () => {
	const result = initCustomerEntitlementBalance({
		initContext: initContext({
			entities: [entity({ id: "workspace_1", featureId: "workspaces" })],
		}),
		entitlement: unlimitedEntitlement({ entityFeatureId: null }),
	});

	expect(result).toEqual({ balance: 0, entities: null });
});
