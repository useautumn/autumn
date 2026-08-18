import { describe, expect, test } from "bun:test";
import {
	EntInterval,
	type Entitlement,
	EntitlementMatchPrecision,
	findEntitlementSuccessor,
} from "@autumn/shared";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";

const ent = (overrides: Record<string, unknown> = {}) =>
	entitlements.build(overrides as Partial<Entitlement>);

describe("findEntitlementSuccessor", () => {
	describe("pinned precision — Definition", () => {
		test("full definition match wins", () => {
			const candidate = ent({ id: "cand" });
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent(),
					candidateEntitlements: [candidate],
					matchPrecision: EntitlementMatchPrecision.Definition,
				}),
			).toBe(candidate);
		});

		test("same feature+interval but different allowance is not a definition match", () => {
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ allowance: 100 }),
					candidateEntitlements: [ent({ id: "cand", allowance: 200 })],
					matchPrecision: EntitlementMatchPrecision.Definition,
				}),
			).toBeUndefined();
		});

		test("pinned precision never falls through to weaker levels", () => {
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent(),
					candidateEntitlements: [ent({ id: "cand", allowance: 999 })],
					matchPrecision: EntitlementMatchPrecision.Definition,
				}),
			).toBeUndefined();
		});
	});

	describe("pinned precision — Interval (feature + interval + count key)", () => {
		test("matches on interval key regardless of allowance/rollover", () => {
			const candidate = ent({
				id: "cand",
				allowance: 999,
				carry_from_previous: true,
			});
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ allowance: 1 }),
					candidateEntitlements: [candidate],
					matchPrecision: EntitlementMatchPrecision.Interval,
				}),
			).toBe(candidate);
		});

		test("different interval breaks the key", () => {
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ interval: EntInterval.Month }),
					candidateEntitlements: [ent({ id: "cand", interval: EntInterval.Year })],
					matchPrecision: EntitlementMatchPrecision.Interval,
				}),
			).toBeUndefined();
		});

		test("different interval_count breaks the key", () => {
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ interval_count: 1 }),
					candidateEntitlements: [ent({ id: "cand", interval_count: 2 })],
					matchPrecision: EntitlementMatchPrecision.Interval,
				}),
			).toBeUndefined();
		});

		test("unset interval_count equals 1 in the key", () => {
			const candidate = ent({ id: "cand", interval_count: 1 });
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ interval_count: undefined }),
					candidateEntitlements: [candidate],
					matchPrecision: EntitlementMatchPrecision.Interval,
				}),
			).toBe(candidate);
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ interval_count: null }),
					candidateEntitlements: [candidate],
					matchPrecision: EntitlementMatchPrecision.Interval,
				}),
			).toBe(candidate);
		});

		test("unset interval equals lifetime in the key", () => {
			const candidate = ent({ id: "cand", interval: EntInterval.Lifetime });
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ interval: null }),
					candidateEntitlements: [candidate],
					matchPrecision: EntitlementMatchPrecision.Interval,
				}),
			).toBe(candidate);
		});

		test("interval_count is ignored for lifetime keys", () => {
			const candidate = ent({
				id: "cand",
				interval: EntInterval.Lifetime,
				interval_count: 99,
			});
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ interval: null, interval_count: 5 }),
					candidateEntitlements: [candidate],
					matchPrecision: EntitlementMatchPrecision.Interval,
				}),
			).toBe(candidate);
		});

		test("lifetime (unset) vs a real interval do not key-match", () => {
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ interval: null }),
					candidateEntitlements: [ent({ id: "cand", interval: EntInterval.Month })],
					matchPrecision: EntitlementMatchPrecision.Interval,
				}),
			).toBeUndefined();
		});

		test("different feature breaks the key", () => {
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ internal_feature_id: "feat_a" }),
					candidateEntitlements: [
						ent({ id: "cand", internal_feature_id: "feat_b" }),
					],
					matchPrecision: EntitlementMatchPrecision.Interval,
				}),
			).toBeUndefined();
		});
	});

	describe("pinned precision — Feature (internal_feature_id only)", () => {
		test("matches on internal feature id alone", () => {
			const candidate = ent({
				id: "cand",
				interval: EntInterval.Year,
				allowance: 999,
			});
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent(),
					candidateEntitlements: [candidate],
					matchPrecision: EntitlementMatchPrecision.Feature,
				}),
			).toBe(candidate);
		});

		test("same public feature_id with different internal id does not match", () => {
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({
						internal_feature_id: "feat_a",
						feature_id: "messages",
					}),
					candidateEntitlements: [
						ent({
							id: "cand",
							internal_feature_id: "feat_b",
							feature_id: "messages",
						}),
					],
					matchPrecision: EntitlementMatchPrecision.Feature,
				}),
			).toBeUndefined();
		});
	});

	describe("cascade (no pinned precision)", () => {
		test("definition match beats a weaker match earlier in the array", () => {
			const weaker = ent({ id: "weaker", allowance: 999 });
			const exact = ent({ id: "exact" });
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent(),
					candidateEntitlements: [weaker, exact],
				}),
			).toBe(exact);
		});

		test("falls to Interval when no definition match exists", () => {
			const intervalMatch = ent({ id: "interval", allowance: 999 });
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ allowance: 1 }),
					candidateEntitlements: [intervalMatch],
				}),
			).toBe(intervalMatch);
		});

		test("falls to Feature when interval also differs", () => {
			const featureMatch = ent({
				id: "feature",
				interval: EntInterval.Year,
				allowance: 999,
			});
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ interval: EntInterval.Month, allowance: 1 }),
					candidateEntitlements: [featureMatch],
				}),
			).toBe(featureMatch);
		});

		test("no match when features differ", () => {
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent({ internal_feature_id: "feat_a" }),
					candidateEntitlements: [
						ent({ id: "cand", internal_feature_id: "feat_b" }),
					],
				}),
			).toBeUndefined();
		});

		test("empty candidates return undefined", () => {
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent(),
					candidateEntitlements: [],
				}),
			).toBeUndefined();
		});

		test("first-in-array wins within the same precision", () => {
			const first = ent({ id: "first" });
			const second = ent({ id: "second" });
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent(),
					candidateEntitlements: [first, second],
				}),
			).toBe(first);
		});
	});

	describe("excludedEntitlementIds", () => {
		test("excluding the exact match falls through to a weaker candidate", () => {
			const exact = ent({ id: "exact" });
			const weaker = ent({ id: "weaker", allowance: 999 });
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent(),
					candidateEntitlements: [exact, weaker],
					excludedEntitlementIds: new Set(["exact"]),
				}),
			).toBe(weaker);
		});

		test("excluding the first exact match returns the second exact match", () => {
			const first = ent({ id: "first" });
			const second = ent({ id: "second" });
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent(),
					candidateEntitlements: [first, second],
					excludedEntitlementIds: new Set(["first"]),
				}),
			).toBe(second);
		});

		test("excluding every candidate returns undefined", () => {
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent(),
					candidateEntitlements: [ent({ id: "a" }), ent({ id: "b" })],
					excludedEntitlementIds: new Set(["a", "b"]),
				}),
			).toBeUndefined();
		});

		test("excluding an unrelated id has no effect", () => {
			const candidate = ent({ id: "cand" });
			expect(
				findEntitlementSuccessor({
					sourceEntitlement: ent(),
					candidateEntitlements: [candidate],
					excludedEntitlementIds: new Set(["unrelated"]),
				}),
			).toBe(candidate);
		});
	});
});
