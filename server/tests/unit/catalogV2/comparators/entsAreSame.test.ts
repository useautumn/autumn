import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	EntInterval,
	type Entitlement,
	entsAreSame,
	FeatureUsageType,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { features } from "@tests/utils/fixtures/db/features";

const seatsFeature = features.create({
	id: "seats",
	internalId: "feat_internal_seats",
	name: "Seats",
	config: { usage_type: FeatureUsageType.Continuous },
});

const ent = (overrides: Record<string, unknown> = {}) =>
	entitlements.build(overrides as Partial<Entitlement>);

/** Asserts symmetrically — comparators must not be order-sensitive. */
const expectSame = (
	a: Record<string, unknown>,
	b: Record<string, unknown>,
	expected: boolean,
) => {
	expect(entsAreSame(ent(a), ent(b))).toBe(expected);
	expect(entsAreSame(ent(b), ent(a))).toBe(expected);
};

describe("entsAreSame", () => {
	test("identical baseline entitlements are same", () => {
		expectSame({}, {}, true);
	});

	describe("internal_feature_id (strict)", () => {
		test("equal ids are same", () => {
			expectSame(
				{ internal_feature_id: "feat_a" },
				{ internal_feature_id: "feat_a" },
				true,
			);
		});

		test("different ids differ", () => {
			expectSame(
				{ internal_feature_id: "feat_a" },
				{ internal_feature_id: "feat_b" },
				false,
			);
		});

		test("comparison is case-sensitive", () => {
			expectSame(
				{ internal_feature_id: "feat_a" },
				{ internal_feature_id: "Feat_a" },
				false,
			);
		});

		test("same public feature_id does not rescue different internal ids", () => {
			expectSame(
				{ internal_feature_id: "feat_a", feature_id: "messages" },
				{ internal_feature_id: "feat_b", feature_id: "messages" },
				false,
			);
		});
	});

	describe("allowance_type (unlimited-ness is the boundary)", () => {
		test("both unlimited are same regardless of allowance values", () => {
			expectSame(
				{ allowance_type: AllowanceType.Unlimited, allowance: 100 },
				{ allowance_type: AllowanceType.Unlimited, allowance: 999 },
				true,
			);
		});

		test("unlimited vs fixed differ", () => {
			expectSame(
				{ allowance_type: AllowanceType.Unlimited },
				{ allowance_type: AllowanceType.Fixed },
				false,
			);
		});

		test("unlimited vs unset differ", () => {
			expectSame(
				{ allowance_type: AllowanceType.Unlimited },
				{ allowance_type: undefined },
				false,
			);
			expectSame(
				{ allowance_type: AllowanceType.Unlimited },
				{ allowance_type: null },
				false,
			);
		});

		test("null vs undefined are same", () => {
			expectSame({ allowance_type: null }, { allowance_type: undefined }, true);
		});

		test("unset vs fixed are same when allowance matches", () => {
			expectSame(
				{ allowance_type: null },
				{ allowance_type: AllowanceType.Fixed },
				true,
			);
			expectSame(
				{ allowance_type: undefined },
				{ allowance_type: AllowanceType.Fixed },
				true,
			);
		});

		test("fixed vs none are same when allowance matches", () => {
			expectSame(
				{ allowance_type: AllowanceType.Fixed, allowance: null },
				{ allowance_type: AllowanceType.None, allowance: null },
				true,
			);
		});

		test("non-unlimited types still differ through allowance values", () => {
			expectSame(
				{ allowance_type: AllowanceType.Fixed, allowance: 100 },
				{ allowance_type: AllowanceType.None, allowance: null },
				false,
			);
		});
	});

	describe("interval (unset means lifetime)", () => {
		test("equal intervals are same", () => {
			expectSame(
				{ interval: EntInterval.Month },
				{ interval: EntInterval.Month },
				true,
			);
		});

		test("different intervals differ", () => {
			expectSame(
				{ interval: EntInterval.Month },
				{ interval: EntInterval.Year },
				false,
			);
		});

		test("null and undefined are same", () => {
			expectSame({ interval: null }, { interval: undefined }, true);
		});

		test("unset equals explicit lifetime", () => {
			expectSame({ interval: null }, { interval: EntInterval.Lifetime }, true);
			expectSame(
				{ interval: undefined },
				{ interval: EntInterval.Lifetime },
				true,
			);
		});

		test("unset (lifetime) vs a real interval differ", () => {
			expectSame({ interval: null }, { interval: EntInterval.Month }, false);
			expectSame(
				{ interval: undefined },
				{ interval: EntInterval.Month },
				false,
			);
		});
	});

	describe("interval_count (unset means 1; ignored for lifetime)", () => {
		test("equal counts are same, different counts differ", () => {
			expectSame({ interval_count: 2 }, { interval_count: 2 }, true);
			expectSame({ interval_count: 1 }, { interval_count: 2 }, false);
		});

		test("unset equals 1", () => {
			expectSame({ interval_count: undefined }, { interval_count: 1 }, true);
			expectSame({ interval_count: null }, { interval_count: 1 }, true);
			expectSame({ interval_count: null }, { interval_count: undefined }, true);
		});

		test("unset vs 2 differ", () => {
			expectSame({ interval_count: undefined }, { interval_count: 2 }, false);
			expectSame({ interval_count: null }, { interval_count: 2 }, false);
		});

		test("count is ignored for lifetime entitlements", () => {
			expectSame(
				{ interval: EntInterval.Lifetime, interval_count: 1 },
				{ interval: EntInterval.Lifetime, interval_count: 5 },
				true,
			);
			expectSame(
				{ interval: null, interval_count: 5 },
				{ interval: EntInterval.Lifetime, interval_count: 99 },
				true,
			);
		});

		test("count still matters for real intervals", () => {
			expectSame(
				{ interval: EntInterval.Month, interval_count: 1 },
				{ interval: EntInterval.Month, interval_count: 3 },
				false,
			);
		});
	});

	describe("allowance (loose; skipped when both unlimited)", () => {
		test("equal allowances are same, different differ", () => {
			expectSame({ allowance: 100 }, { allowance: 100 }, true);
			expectSame({ allowance: 100 }, { allowance: 200 }, false);
		});

		test("zero is preserved (not collapsed to null)", () => {
			expectSame({ allowance: 0 }, { allowance: 0 }, true);
			expectSame({ allowance: 0 }, { allowance: null }, false);
			expectSame({ allowance: 0 }, { allowance: undefined }, false);
			expectSame({ allowance: 0 }, { allowance: 100 }, false);
		});

		test("null and undefined are same (loose nullish)", () => {
			expectSame({ allowance: null }, { allowance: undefined }, true);
			expectSame({ allowance: null }, { allowance: null }, true);
		});

		test("nullish vs value differ", () => {
			expectSame({ allowance: null }, { allowance: 100 }, false);
			expectSame({ allowance: undefined }, { allowance: 100 }, false);
		});

		test("both unlimited ignores allowance entirely", () => {
			expectSame(
				{ allowance_type: AllowanceType.Unlimited, allowance: null },
				{ allowance_type: AllowanceType.Unlimited, allowance: 0 },
				true,
			);
		});
	});

	describe("carry_from_previous (unset means false)", () => {
		test("equal values are same, true vs false differ", () => {
			expectSame(
				{ carry_from_previous: true },
				{ carry_from_previous: true },
				true,
			);
			expectSame(
				{ carry_from_previous: true },
				{ carry_from_previous: false },
				false,
			);
		});

		test("unset equals false", () => {
			expectSame(
				{ carry_from_previous: undefined },
				{ carry_from_previous: false },
				true,
			);
			expectSame(
				{ carry_from_previous: null },
				{ carry_from_previous: false },
				true,
			);
			expectSame(
				{ carry_from_previous: null },
				{ carry_from_previous: undefined },
				true,
			);
		});

		test("unset vs true differ", () => {
			expectSame(
				{ carry_from_previous: undefined },
				{ carry_from_previous: true },
				false,
			);
		});
	});

	describe("entity_feature_id (empty string collapses to null)", () => {
		test("equal ids are same, different ids differ", () => {
			expectSame(
				{ entity_feature_id: "entities" },
				{ entity_feature_id: "entities" },
				true,
			);
			expectSame(
				{ entity_feature_id: "entities" },
				{ entity_feature_id: "other" },
				false,
			);
		});

		test("empty string, null, and undefined are all same", () => {
			expectSame({ entity_feature_id: "" }, { entity_feature_id: null }, true);
			expectSame(
				{ entity_feature_id: "" },
				{ entity_feature_id: undefined },
				true,
			);
			expectSame(
				{ entity_feature_id: null },
				{ entity_feature_id: undefined },
				true,
			);
		});

		test("collapsed empty vs a real id differ", () => {
			expectSame(
				{ entity_feature_id: "" },
				{ entity_feature_id: "entities" },
				false,
			);
			expectSame(
				{ entity_feature_id: null },
				{ entity_feature_id: "entities" },
				false,
			);
		});
	});

	describe("pooled (unset means false)", () => {
		test("true vs false differ; unset equals false", () => {
			expectSame({ pooled: true }, { pooled: false }, false);
			expectSame({ pooled: undefined }, { pooled: false }, true);
			expectSame({ pooled: null }, { pooled: false }, true);
			expectSame({ pooled: null }, { pooled: true }, false);
		});
	});

	describe("usage_limit (loose)", () => {
		test("equal values same, different differ", () => {
			expectSame({ usage_limit: 100 }, { usage_limit: 100 }, true);
			expectSame({ usage_limit: 100 }, { usage_limit: 200 }, false);
		});

		test("null and undefined are same; nullish vs value differ", () => {
			expectSame({ usage_limit: null }, { usage_limit: undefined }, true);
			expectSame({ usage_limit: null }, { usage_limit: 100 }, false);
			expectSame({ usage_limit: 0 }, { usage_limit: null }, false);
		});
	});

	describe("rollover", () => {
		const rollover = {
			max: 10,
			max_percentage: null,
			duration: RolloverExpiryDurationType.Month,
			length: 1,
		};

		test("both absent are same; one-sided differs", () => {
			expectSame({ rollover: null }, { rollover: undefined }, true);
			expectSame({ rollover: null }, { rollover }, false);
			expectSame({ rollover: undefined }, { rollover }, false);
		});

		test("identical rollovers are same", () => {
			expectSame({ rollover }, { rollover: { ...rollover } }, true);
		});

		test("max differences", () => {
			expectSame(
				{ rollover },
				{ rollover: { ...rollover, max: 20 } },
				false,
			);
			expectSame(
				{ rollover: { ...rollover, max: null } },
				{ rollover: { ...rollover, max: undefined } },
				true,
			);
			expectSame(
				{ rollover: { ...rollover, max: 0 } },
				{ rollover: { ...rollover, max: null } },
				false,
			);
		});

		test("max_percentage differences", () => {
			expectSame(
				{ rollover: { ...rollover, max_percentage: 50 } },
				{ rollover: { ...rollover, max_percentage: 50 } },
				true,
			);
			expectSame(
				{ rollover: { ...rollover, max_percentage: 50 } },
				{ rollover: { ...rollover, max_percentage: 75 } },
				false,
			);
			expectSame(
				{ rollover: { ...rollover, max_percentage: null } },
				{ rollover: { ...rollover, max_percentage: undefined } },
				true,
			);
		});

		test("duration unset equals month (schema default)", () => {
			expectSame(
				{ rollover: { ...rollover, duration: undefined } },
				{ rollover: { ...rollover, duration: RolloverExpiryDurationType.Month } },
				true,
			);
			expectSame(
				{ rollover: { ...rollover, duration: RolloverExpiryDurationType.Month } },
				{
					rollover: {
						...rollover,
						duration: RolloverExpiryDurationType.Forever,
					},
				},
				false,
			);
		});

		test("length differences", () => {
			expectSame(
				{ rollover },
				{ rollover: { ...rollover, length: 3 } },
				false,
			);
			expectSame(
				{ rollover: { ...rollover, length: null } },
				{ rollover: { ...rollover, length: undefined } },
				true,
			);
		});

		test("empty object rollover vs absent differ (presence check, pinned)", () => {
			expectSame({ rollover: {} }, { rollover: null }, false);
			expectSame({ rollover: {} }, { rollover: {} }, true);
		});
	});

	describe("ignored fields (differ but still same)", () => {
		test.each([
			["id", "ent_a", "ent_b"],
			["created_at", 1, 999],
			["internal_product_id", "prod_a", "prod_b"],
			["internal_reward_id", "rew_a", "rew_b"],
			["is_custom", true, false],
			["org_id", "org_a", "org_b"],
			["feature_id", "messages", "seats"],
			["expiry_duration", "month", "year"],
			["expiry_length", 1, 12],
		])("%s is ignored", (field, a, b) => {
			expectSame({ [field]: a }, { [field]: b }, true);
		});

		test("joined feature object is ignored", () => {
			expectSame({ feature: seatsFeature }, { feature: undefined }, true);
		});
	});

	describe("compound cases", () => {
		test("one real difference wins over many ignored differences", () => {
			expectSame(
				{ interval: EntInterval.Month, id: "ent_a", org_id: "org_a" },
				{ interval: EntInterval.Year, id: "ent_b", org_id: "org_b" },
				false,
			);
		});

		test("unlimited with different allowances and ignored feature_id are same", () => {
			expectSame(
				{
					allowance_type: AllowanceType.Unlimited,
					allowance: 100,
					feature_id: "a",
				},
				{
					allowance_type: AllowanceType.Unlimited,
					allowance: 999,
					feature_id: "b",
				},
				true,
			);
		});
	});
});
