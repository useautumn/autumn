import type { AllowanceType, EntInterval } from "@autumn/shared";

// One balance row as sqlite projects it: a FullCustomerEntitlement without the
// parts the mirror cannot answer on its own — the feature, the customer product,
// replaceables and rollovers, all stitched on by loadSubject.
export type CustomerEntitlementRow = {
	id: string;
	internal_customer_id: string;
	internal_entity_id: string | null;
	internal_feature_id: string;
	feature_id: string;
	customer_product_id: string | null;
	entitlement_id: string;
	created_at: number;
	unlimited: boolean | null;
	balance: number;
	additional_balance: number;
	adjustment: number | null;
	usage_allowed: boolean | null;
	separate_interval: boolean;
	is_pooled_balance: boolean;
	next_reset_at: number | null;
	expires_at: number | null;
	external_id: string | null;
	cache_version: number;
	entitlement: {
		id: string;
		created_at: number;
		internal_feature_id: string;
		internal_product_id: string | null;
		is_custom: boolean;
		allowance_type: AllowanceType | null;
		allowance: number | null;
		interval: EntInterval | null;
		interval_count: number;
		entity_feature_id: string | null;
		pooled: boolean;
		feature_id: string;
		usage_limit: number | null;
	};
};
