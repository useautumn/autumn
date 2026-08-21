import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
} from "@autumn/shared";
import { toRemovedItem } from "@/internal/migrations/v2/batchOperations/actions/utils/toRemovedItem.js";

const messagesFeature = {
	internal_id: "fea_messages_internal",
	id: "messages",
	type: FeatureType.Metered,
	name: "Messages",
} as Feature;

const entitlement = ({
	id,
	allowance,
}: {
	id: string;
	allowance: number;
}): EntitlementWithFeature =>
	({
		id,
		internal_feature_id: messagesFeature.internal_id,
		feature_id: messagesFeature.id,
		feature: messagesFeature,
		allowance,
		interval: EntInterval.Month,
		interval_count: 1,
		allowance_type: "fixed",
	}) as unknown as EntitlementWithFeature;

const row = {
	internalCustomerId: "cus_1",
	customerProductId: "cp_1",
	entityId: null,
	liveBalance: 80,
	liveNextResetAt: 1_800_000_000_000,
	status: CusProductStatus.Active,
	startsAt: 1_700_000_000_000,
	canceledAt: null,
	endedAt: null,
	trialEndsAt: null,
};

describe("toRemovedItem", () => {
	test("stamps the row's live definition, not a shared catalog entitlement", () => {
		const live = entitlement({ id: "ent_custom_200", allowance: 200 });
		const catalog = entitlement({ id: "ent_catalog_100", allowance: 100 });
		const item = toRemovedItem({
			row,
			planId: "pro",
			fromEntitlement: live,
		});

		expect(item.entitlement).toBe(live);
		expect(item.entitlement).not.toBe(catalog);
		expect(item.entitlement.allowance).toBe(200);
		expect(item.granted).toBe(200);
		expect(item.remaining).toBe(80);
		expect(item.featureId).toBe("messages");
	});
});
