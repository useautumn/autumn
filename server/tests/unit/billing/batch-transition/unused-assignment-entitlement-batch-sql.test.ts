/**
 * Unused assignment CPs (license link set, entity null) are part of
 * entitlement add / replace / delete. The candidate WHERE must not
 * require internal_entity_id.
 *
 * Red (current): replace and delete still filter entity IS NOT NULL.
 * Green (after): replace and delete candidate WHERE matches add — link + status only.
 */

import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import {
	AllowanceType,
	EntInterval,
	type EntitlementPrice,
	type EntitlementWithFeature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { buildDeleteCustomerEntitlementsBatchQuery } from "@/internal/billing/v2/actions/batchTransition/execute/sql/deleteCustomerEntitlementsBatch";
import { buildReplaceCustomerEntitlementsBatchQuery } from "@/internal/billing/v2/actions/batchTransition/execute/sql/replaceCustomerEntitlementsBatch";
import type {
	RemoveEntitlementPriceOperation,
	ReplaceEntitlementPriceOperation,
} from "@/internal/billing/v2/actions/batchTransition/types/entitlementPriceOperationTypes";

const ENTITY_REQUIRED = "internal_entity_id IS NOT NULL";

const flattenSql = (query: SQL): string =>
	JSON.stringify(query, (_key, value) =>
		typeof value === "string" ? value : value,
	);

const messages = {
	internal_id: "internal_messages",
	org_id: "org_test",
	created_at: 0,
	env: "sandbox",
	id: "messages",
	name: "messages",
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Single },
	display: null,
	archived: false,
	event_names: [],
	model_markups: null,
	stripe_meter: null,
};

const entitlement = (id: string): EntitlementWithFeature =>
	({
		id,
		created_at: 0,
		internal_feature_id: messages.internal_id,
		internal_product_id: "product_test",
		internal_reward_id: null,
		is_custom: false,
		allowance_type: AllowanceType.Fixed,
		allowance: 100,
		interval: EntInterval.Month,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: null,
		usage_limit: null,
		pooled: false,
		feature: messages,
	}) as EntitlementWithFeature;

const entitlementPrice = (id: string): EntitlementPrice => ({
	entitlement: entitlement(id),
});

const replaceOperation = (): ReplaceEntitlementPriceOperation => ({
	type: "replace",
	fromEntitlementIds: ["ent_from"],
	toEntitlementId: "ent_to",
	fromEntitlementPrice: entitlementPrice("ent_from"),
	toEntitlementPrice: entitlementPrice("ent_to"),
	customerEntitlementPatch: { balance: { type: "set", amount: 100 } },
});

const removeOperation = (): RemoveEntitlementPriceOperation => ({
	type: "remove",
	entitlementPrice: entitlementPrice("ent_from"),
	fromEntitlementIds: ["ent_from"],
});

describe("unused assignment seats stay in entitlement batch SQL", () => {
	test("replace does not require an entity on the seat", () => {
		const query = buildReplaceCustomerEntitlementsBatchQuery({
			customerLicenseLinkId: "link_unused",
			operation: replaceOperation(),
			batchSize: 50,
		});
		expect(flattenSql(query)).not.toContain(ENTITY_REQUIRED);
	});

	test("delete does not require an entity on the seat", () => {
		const query = buildDeleteCustomerEntitlementsBatchQuery({
			customerLicenseLinkId: "link_unused",
			operation: removeOperation(),
			batchSize: 50,
			now: 0,
		});
		expect(flattenSql(query)).not.toContain(ENTITY_REQUIRED);
	});
});
