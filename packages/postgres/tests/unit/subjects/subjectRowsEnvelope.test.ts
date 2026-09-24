import { describe, expect, test } from "bun:test";
import { subjectRowsEnvelopeSchema } from "../../../src/subjects/types/subjectRowsEnvelope.js";

const envelope = {
	customer: {
		internal_id: "cus_internal_1",
		id: "cus_1",
		org_id: "org_1",
		env: "sandbox",
		name: "Acme",
	},
	customer_products: [
		{
			id: "cp_1",
			internal_product_id: "prod_internal_1",
			product_id: "pro",
			internal_customer_id: "cus_internal_1",
			customer_id: "cus_1",
			internal_entity_id: null,
			entity_id: null,
			created_at: 1_700_000_000_000,
			status: "active",
			canceled: false,
			starts_at: 1_700_000_000_000,
			options: [],
			free_trial_id: null,
			trial_ends_at: null,
			collection_method: "charge_automatically",
			subscription_ids: [],
			scheduled_ids: [],
			quantity: 1,
			is_custom: false,
			customer_license_link_id: null,
		},
	],
	customer_entitlements: [
		{
			id: "ce_1",
			internal_customer_id: "cus_internal_1",
			internal_entity_id: null,
			internal_feature_id: "feat_internal_1",
			feature_id: "api_calls",
			customer_product_id: "cp_1",
			entitlement_id: "ent_1",
			created_at: 1_700_000_000_000,
			unlimited: false,
			balance: 95,
			additional_balance: 0,
			usage_allowed: false,
			next_reset_at: 1_800_000_000_000,
			adjustment: 0,
			expires_at: null,
			cache_version: 0,
			external_id: null,
		},
	],
	rollovers: [],
	replaceables: [],
	entities: [],
	products: [
		{
			id: "pro",
			name: "Pro",
			description: null,
			is_add_on: false,
			is_default: false,
			version: 1,
			env: "sandbox",
			internal_id: "prod_internal_1",
			org_id: "org_1",
			created_at: 1_700_000_000_000,
		},
	],
	entitlements: [
		{
			id: "ent_1",
			created_at: 1_700_000_000_000,
			internal_feature_id: "feat_internal_1",
			internal_product_id: "prod_internal_1",
			allowance_type: "fixed",
			allowance: 1000,
			interval: "month",
			interval_count: 1,
			entity_feature_id: null,
			org_id: "org_1",
			feature_id: "api_calls",
			usage_limit: null,
		},
	],
	features: [
		{
			internal_id: "feat_internal_1",
			org_id: "org_1",
			created_at: 1_700_000_000_000,
			env: "sandbox",
			id: "api_calls",
			name: "API calls",
			type: "metered",
			config: { filters: [], aggregate: { type: "sum", property: "value" } },
		},
	],
};

describe("subjectRowsEnvelope", () => {
	test("rejects a row that lost a required column", () => {
		const { entitlement_id: _dropped, ...withoutEntitlementId } =
			envelope.customer_entitlements[0];
		expect(
			subjectRowsEnvelopeSchema.safeParse({
				...envelope,
				customer_entitlements: [withoutEntitlementId],
			}).success,
		).toBe(false);
	});
});
