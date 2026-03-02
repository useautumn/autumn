import type { InsertCustomerEntitlement } from "@autumn/shared";
import {
	AllowanceType,
	type Entitlement,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils";

export const buildCarryOverEntitlement = ({
	cusEnt,
	orgId,
	allowance,
}: {
	cusEnt: FullCustomerEntitlement;
	orgId: string;
	allowance: number;
}): Entitlement => ({
	id: generateId("ent"),
	created_at: Date.now(),
	org_id: orgId,
	internal_feature_id: cusEnt.entitlement.internal_feature_id,
	feature_id: cusEnt.entitlement.feature_id as string,
	internal_product_id: null,
	is_custom: true,
	allowance,
	allowance_type: AllowanceType.Fixed,
	interval: null,
	interval_count: 1,
	carry_from_previous: false,
	entity_feature_id: null,
	usage_limit: null,
	rollover: null,
});

export const buildCarryOverCustomerEntitlement = ({
	cusEnt,
	entitlementId,
	internalCustomerId,
	customerId,
	internalEntityId,
	balance,
	expiresAt,
}: {
	cusEnt: FullCustomerEntitlement;
	entitlementId: string;
	internalCustomerId: string;
	customerId: string | null | undefined;
	internalEntityId: string | null;
	balance: number;
	expiresAt: number | null;
}): InsertCustomerEntitlement => ({
	id: generateId("cus_ent"),
	entitlement_id: entitlementId,
	internal_customer_id: internalCustomerId,
	internal_feature_id: cusEnt.entitlement.internal_feature_id,
	internal_entity_id: internalEntityId,
	customer_product_id: null,
	customer_id: customerId,
	feature_id: cusEnt.entitlement.feature.id,
	created_at: Date.now(),
	balance,
	additional_balance: 0,
	adjustment: 0,
	unlimited: false,
	usage_allowed: false,
	entities: null,
	next_reset_at: null,
	expires_at: expiresAt,
});
