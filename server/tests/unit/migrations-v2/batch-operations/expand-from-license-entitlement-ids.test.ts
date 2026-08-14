import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
} from "@autumn/shared";
import { expandFromLicenseEntitlementIds } from "@/internal/migrations/v2/batchOperations/actions/replaceLicenseEntitlementsForPage/expandFromLicenseEntitlementIds.js";

const messagesFeature = {
	internal_id: "feat_messages",
	id: "messages",
	type: FeatureType.Metered,
} as unknown as Feature;

const ent = ({
	id,
	allowance,
	interval,
}: {
	id: string;
	allowance: number;
	interval: EntInterval | null;
}): EntitlementWithFeature =>
	({
		id,
		internal_feature_id: messagesFeature.internal_id,
		feature_id: messagesFeature.id,
		allowance_type: AllowanceType.Fixed,
		allowance,
		interval,
		interval_count: 1,
		feature: messagesFeature,
	}) as unknown as EntitlementWithFeature;

describe("expandFromLicenseEntitlementIds", () => {
	const from = ent({
		id: "ent_catalog",
		allowance: 100,
		interval: EntInterval.Month,
	});

	test("includes the catalog id and entsAreSame custom ids, not the to id", () => {
		const customSame = ent({
			id: "ent_custom",
			allowance: 100,
			interval: EntInterval.Month,
		});
		const minted = ent({
			id: "ent_minted",
			allowance: 200,
			interval: EntInterval.Month,
		});
		const differentAllowance = ent({
			id: "ent_other",
			allowance: 50,
			interval: EntInterval.Month,
		});

		expect(
			expandFromLicenseEntitlementIds({
				candidateOutgoingEntitlements: [
					from,
					customSame,
					minted,
					differentAllowance,
				],
				fromEntitlement: from,
				toEntitlementId: minted.id,
			}),
		).toEqual(["ent_catalog", "ent_custom"]);
	});

	test("does not match a different interval as the same definition", () => {
		const lifetime = ent({
			id: "ent_lifetime",
			allowance: 100,
			interval: null,
		});

		expect(
			expandFromLicenseEntitlementIds({
				candidateOutgoingEntitlements: [lifetime],
				fromEntitlement: from,
				toEntitlementId: "ent_minted",
			}),
		).toEqual([]);
	});
});
