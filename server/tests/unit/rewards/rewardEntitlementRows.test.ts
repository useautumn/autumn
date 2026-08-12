import { describe, expect, test } from "bun:test";
import { AllowanceType, type Feature, FeatureType } from "@autumn/shared";
import { rewardToEntitlementRows } from "@/internal/rewards/repos/rewardEntitlementRows.js";

const metered = {
	internal_id: "fe_metered",
	id: "credits",
	type: FeatureType.Metered,
} as unknown as Feature;

const boolean = {
	internal_id: "fe_bool",
	id: "dashboard",
	type: FeatureType.Boolean,
} as unknown as Feature;

const features = [metered, boolean];

const rowsFor = ({
	internalFeatureId,
	allowance,
}: {
	internalFeatureId: string;
	allowance?: number;
}) =>
	rewardToEntitlementRows({
		reward: {
			internal_id: "rew_1",
			org_id: "org_1",
			entitlements: [
				{
					internal_feature_id: internalFeatureId,
					...(allowance === undefined ? {} : { allowance }),
				},
			],
		},
		features,
	})[0];

describe("rewardToEntitlementRows allowance mapping", () => {
	test("zero allowance persists as fixed, not none", () => {
		const row = rowsFor({ internalFeatureId: "fe_metered", allowance: 0 });
		expect(row.allowance_type).toBe(AllowanceType.Fixed);
		expect(row.allowance).toBe(0);
	});

	test("positive allowance persists as fixed", () => {
		const row = rowsFor({ internalFeatureId: "fe_metered", allowance: 500 });
		expect(row.allowance_type).toBe(AllowanceType.Fixed);
		expect(row.allowance).toBe(500);
	});

	test("omitted allowance persists as none", () => {
		const row = rowsFor({ internalFeatureId: "fe_metered" });
		expect(row.allowance_type).toBe(AllowanceType.None);
		expect(row.allowance).toBeNull();
	});

	test("boolean feature stays none even when zero is supplied", () => {
		const row = rowsFor({ internalFeatureId: "fe_bool", allowance: 0 });
		expect(row.allowance_type).toBe(AllowanceType.None);
		expect(row.allowance).toBeNull();
	});

	test("boolean feature stays none even when a positive amount is supplied", () => {
		const row = rowsFor({ internalFeatureId: "fe_bool", allowance: 100 });
		expect(row.allowance_type).toBe(AllowanceType.None);
		expect(row.allowance).toBeNull();
	});
});
