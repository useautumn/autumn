/**
 * TDD regression: an unlimited entity-scoped grant covers every entity of its
 * entity feature, even one missing from its per-entity map.
 *
 * Red: a map seeded by a later entity creation held only the new entity, so
 * cusEntMatchesEntity excluded older entities and /check answered allowed=false
 * on an unlimited feature.
 */

import { expect, test } from "bun:test";
import {
	AllowanceType,
	cusEntMatchesEntity,
	type EntitlementWithFeature,
	type Entity,
	FeatureType,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";

const entity = ({
	id,
	featureId = "workspaces",
}: {
	id: string;
	featureId?: string;
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

const entitlement = ({ allowanceType }: { allowanceType: AllowanceType }) =>
	({
		id: "ent_documents",
		created_at: 0,
		internal_feature_id: "feat_documents",
		internal_product_id: "prod_unit",
		is_custom: false,
		allowance_type: allowanceType,
		allowance: allowanceType === AllowanceType.Unlimited ? null : 10,
		interval: null,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: "workspaces",
		usage_limit: null,
		rollover: null,
		feature_id: "documents",
		feature: {
			id: "documents",
			internal_id: "feat_documents",
			type: FeatureType.Metered,
		},
	}) as EntitlementWithFeature;

const customerEntitlement = ({
	allowanceType,
	unlimited,
	entities,
}: {
	allowanceType: AllowanceType;
	unlimited: boolean | null;
	entities: Record<string, { id: string; balance: number; adjustment: number }>;
}) =>
	({
		id: "cus_ent_documents",
		internal_customer_id: "internal_cus_unit",
		internal_entity_id: null,
		internal_feature_id: "feat_documents",
		feature_id: "documents",
		customer_id: "cus_unit",
		customer_product_id: "cus_prod_unit",
		entitlement_id: "ent_documents",
		created_at: 0,
		unlimited,
		balance: 0,
		additional_balance: 0,
		usage_allowed: false,
		separate_interval: false,
		reset_cycle_anchor: null,
		next_reset_at: null,
		adjustment: 0,
		expires_at: null,
		cache_version: 0,
		entities,
		external_id: null,
		entitlement: entitlement({ allowanceType }),
		replaceables: [],
		rollovers: [],
		customer_product: { internal_entity_id: null },
	}) as unknown as FullCusEntWithFullCusProduct;

const onlyNewerEntity = {
	workspace_2: { id: "workspace_2", balance: 0, adjustment: 0 },
};

test("unlimited grant matches an entity missing from its per-entity map", () => {
	const cusEnt = customerEntitlement({
		allowanceType: AllowanceType.Unlimited,
		unlimited: true,
		entities: onlyNewerEntity,
	});

	expect(
		cusEntMatchesEntity({ cusEnt, entity: entity({ id: "workspace_1" }) }),
	).toBe(true);
	expect(
		cusEntMatchesEntity({ cusEnt, entity: entity({ id: "workspace_2" }) }),
	).toBe(true);
});

test("unlimited grant flagged only on the entitlement still matches", () => {
	const cusEnt = customerEntitlement({
		allowanceType: AllowanceType.Unlimited,
		unlimited: null,
		entities: onlyNewerEntity,
	});

	expect(
		cusEntMatchesEntity({ cusEnt, entity: entity({ id: "workspace_1" }) }),
	).toBe(true);
});

test("unlimited grant still requires the entity feature to match", () => {
	const cusEnt = customerEntitlement({
		allowanceType: AllowanceType.Unlimited,
		unlimited: true,
		entities: onlyNewerEntity,
	});

	expect(
		cusEntMatchesEntity({
			cusEnt,
			entity: entity({ id: "seat_1", featureId: "seats" }),
		}),
	).toBe(false);
});

test("finite grant still excludes an entity missing from its per-entity map", () => {
	const cusEnt = customerEntitlement({
		allowanceType: AllowanceType.Fixed,
		unlimited: false,
		entities: onlyNewerEntity,
	});

	expect(
		cusEntMatchesEntity({ cusEnt, entity: entity({ id: "workspace_1" }) }),
	).toBe(false);
	expect(
		cusEntMatchesEntity({ cusEnt, entity: entity({ id: "workspace_2" }) }),
	).toBe(true);
});
