import { describe, expect, test } from "bun:test";
import {
	BillWhen,
	EntInterval,
	type Entitlement,
	type EntitlementPrice,
	EntitlementPriceMatchPrecision,
	findEntitlementPriceSuccessor,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { prices } from "@tests/utils/fixtures/db/prices";

const ep = ({
	entitlement = {},
	priced = false,
	priceConfig = {},
	priceOverrides = {},
}: {
	entitlement?: Record<string, unknown>;
	priced?: boolean;
	priceConfig?: Record<string, unknown>;
	priceOverrides?: Record<string, unknown>;
} = {}): EntitlementPrice =>
	entitlements.buildPricePair({
		entitlement: entitlements.buildWithFeature(
			entitlement as Partial<Entitlement>,
		),
		price: priced
			? prices.buildUsage({
					configOverrides: priceConfig as Partial<UsagePriceConfig>,
					overrides: priceOverrides as Partial<Price>,
				})
			: undefined,
	});

const find = ({
	source,
	candidates,
	excluded,
	matchPrecision,
}: {
	source: EntitlementPrice;
	candidates: EntitlementPrice[];
	excluded?: Set<string>;
	matchPrecision?: EntitlementPriceMatchPrecision;
}) =>
	findEntitlementPriceSuccessor({
		sourceEntitlementPrice: source,
		candidateEntitlementPrices: candidates,
		excludedEntitlementIds: excluded,
		matchPrecision,
	});

describe("findEntitlementPriceSuccessor", () => {
	describe("matchPrecision pin — no ladder", () => {
		test("definition-only ignores weaker price-identity candidates", () => {
			const source = ep({ priced: true });
			const priceIdentity = ep({
				entitlement: { id: "priceid", allowance: 9 },
				priced: true,
				priceConfig: { usage_tiers: [{ to: "inf", amount: 999 }] },
			});

			expect(
				find({
					source,
					candidates: [priceIdentity],
					matchPrecision:
						EntitlementPriceMatchPrecision.EntitlementAndPriceDefinition,
				}),
			).toBeUndefined();
		});
	});

	describe("ladder precedence — strongest level wins regardless of array order", () => {
		test("exact definition beats price identity beats interval beats feature", () => {
			const source = ep({ priced: true });
			const featureOnly = ep({
				entitlement: { id: "feature", interval: EntInterval.Year, allowance: 9 },
			});
			const intervalMatch = ep({
				entitlement: { id: "interval", allowance: 9 },
			});
			const priceIdentity = ep({
				entitlement: { id: "priceid", allowance: 9 },
				priced: true,
				priceConfig: { usage_tiers: [{ to: "inf", amount: 999 }] },
			});
			const exact = ep({ entitlement: { id: "exact" }, priced: true });

			expect(
				find({
					source,
					candidates: [featureOnly, intervalMatch, priceIdentity, exact],
				}),
			).toBe(exact);
			expect(
				find({
					source,
					candidates: [featureOnly, intervalMatch, priceIdentity],
				}),
			).toBe(priceIdentity);
			expect(
				find({ source, candidates: [featureOnly, intervalMatch] }),
			).toBe(intervalMatch);
			expect(find({ source, candidates: [featureOnly] })).toBe(featureOnly);
		});

		test("first-in-array wins within the same precision level", () => {
			const source = ep();
			const first = ep({ entitlement: { id: "first" } });
			const second = ep({ entitlement: { id: "second" } });
			expect(find({ source, candidates: [first, second] })).toBe(first);
		});
	});

	describe("PriceIdentity level", () => {
		test("amount edit lands at price identity (same billing shape)", () => {
			const source = ep({ priced: true });
			const amountEdit = ep({
				entitlement: { id: "cand" },
				priced: true,
				priceConfig: { usage_tiers: [{ to: "inf", amount: 999 }] },
			});
			// Exact fails (amount differs), identity holds.
			expect(find({ source, candidates: [amountEdit] })).toBe(amountEdit);
		});

		test("requires both sides priced — free source never matches at identity", () => {
			const source = ep(); // free
			// Candidate ent differs (breaks exact + interval via allowance? no —
			// interval ignores allowance), so force interval mismatch too.
			const pricedCandidate = ep({
				entitlement: { id: "cand", interval: EntInterval.Year },
				priced: true,
			});
			// Falls all the way to Feature (identity requires both prices; interval key differs).
			expect(find({ source, candidates: [pricedCandidate] })).toBe(
				pricedCandidate,
			);
		});

		test("entitlement is NOT consulted at price identity (pinned surprise)", () => {
			const source = ep({ entitlement: { allowance: 1 }, priced: true });
			const differentEnt = ep({
				entitlement: { id: "cand", allowance: 999, carry_from_previous: true },
				priced: true,
				priceConfig: { usage_tiers: [{ to: "inf", amount: 5 }] },
			});
			expect(find({ source, candidates: [differentEnt] })).toBe(differentEnt);
		});

		test("billing shape change breaks price identity", () => {
			const source = ep({
				priced: true,
				priceConfig: { bill_when: BillWhen.EndOfPeriod },
			});
			const shapeChanged = ep({
				entitlement: { id: "cand", allowance: 999 },
				priced: true,
				priceConfig: { bill_when: BillWhen.InAdvance },
			});
			// Exact fails, identity fails (billing type), interval fails (allowance
			// is not in the interval key — actually interval key matches feature+interval).
			expect(find({ source, candidates: [shapeChanged] })).toBe(shapeChanged);
			// It matched — but at EntitlementInterval, not PriceIdentity. Verify by
			// also breaking the interval key: then only Feature remains.
			const shapeAndIntervalChanged = ep({
				entitlement: {
					id: "cand2",
					interval: EntInterval.Year,
					allowance: 999,
				},
				priced: true,
				priceConfig: { bill_when: BillWhen.InAdvance },
			});
			expect(find({ source, candidates: [shapeAndIntervalChanged] })).toBe(
				shapeAndIntervalChanged,
			);
		});
	});

	describe("EntitlementInterval level (price ignored)", () => {
		test("free-to-paid same feature+interval matches at interval level", () => {
			const freeSource = ep();
			const paidCandidate = ep({
				entitlement: { id: "cand" },
				priced: true,
			});
			expect(find({ source: freeSource, candidates: [paidCandidate] })).toBe(
				paidCandidate,
			);
		});

		test("paid-to-free same feature+interval matches at interval level", () => {
			const paidSource = ep({ priced: true });
			const freeCandidate = ep({ entitlement: { id: "cand", allowance: 9 } });
			expect(find({ source: paidSource, candidates: [freeCandidate] })).toBe(
				freeCandidate,
			);
		});

		test("unset interval equals lifetime at the interval level", () => {
			const source = ep({ entitlement: { interval: null } });
			const lifetimeCandidate = ep({
				entitlement: {
					id: "cand",
					interval: EntInterval.Lifetime,
					allowance: 9,
				},
			});
			expect(find({ source, candidates: [lifetimeCandidate] })).toBe(
				lifetimeCandidate,
			);
		});
	});

	describe("EntitlementFeature level and no-match", () => {
		test("interval change falls to feature level", () => {
			const source = ep({ entitlement: { interval: EntInterval.Month } });
			const intervalChanged = ep({
				entitlement: { id: "cand", interval: EntInterval.Year, allowance: 9 },
			});
			expect(find({ source, candidates: [intervalChanged] })).toBe(
				intervalChanged,
			);
		});

		test("feature change never matches", () => {
			const source = ep({ entitlement: { internal_feature_id: "feat_a" } });
			expect(
				find({
					source,
					candidates: [
						ep({ entitlement: { id: "cand", internal_feature_id: "feat_b" } }),
					],
				}),
			).toBeUndefined();
		});

		test("empty candidates return undefined", () => {
			expect(find({ source: ep(), candidates: [] })).toBeUndefined();
		});
	});

	describe("excludedEntitlementIds (claim mechanics)", () => {
		test("excluding the exact match falls through to a weaker candidate", () => {
			const source = ep({ priced: true });
			const exact = ep({ entitlement: { id: "exact" }, priced: true });
			const weaker = ep({ entitlement: { id: "weaker", allowance: 9 } });
			expect(
				find({
					source,
					candidates: [exact, weaker],
					excluded: new Set(["exact"]),
				}),
			).toBe(weaker);
		});

		test("excluding the first exact match returns the second at the same level", () => {
			const source = ep();
			const first = ep({ entitlement: { id: "first" } });
			const second = ep({ entitlement: { id: "second" } });
			expect(
				find({
					source,
					candidates: [first, second],
					excluded: new Set(["first"]),
				}),
			).toBe(second);
		});

		test("exclusion is by entitlement id, not price id", () => {
			const source = ep({ priced: true });
			const candidate = ep({
				entitlement: { id: "ent_cand" },
				priced: true,
				priceOverrides: { id: "price_cand" },
			});
			expect(
				find({
					source,
					candidates: [candidate],
					excluded: new Set(["price_cand"]),
				}),
			).toBe(candidate);
			expect(
				find({
					source,
					candidates: [candidate],
					excluded: new Set(["ent_cand"]),
				}),
			).toBeUndefined();
		});

		test("all candidates excluded returns undefined", () => {
			expect(
				find({
					source: ep(),
					candidates: [ep({ entitlement: { id: "a" } })],
					excluded: new Set(["a"]),
				}),
			).toBeUndefined();
		});
	});

	describe("claim-loop simulation (two sources, one exact target each)", () => {
		test("second source is forced to a weaker candidate after the first claims", () => {
			const sourceA = ep({ priced: true });
			const sourceB = ep({ priced: true });
			const exact = ep({ entitlement: { id: "exact" }, priced: true });
			const weaker = ep({ entitlement: { id: "weaker", allowance: 9 } });

			const claimed = new Set<string>();
			const firstMatch = find({
				source: sourceA,
				candidates: [exact, weaker],
				excluded: claimed,
			});
			expect(firstMatch).toBe(exact);
			claimed.add(firstMatch!.entitlement.id);

			const secondMatch = find({
				source: sourceB,
				candidates: [exact, weaker],
				excluded: claimed,
			});
			expect(secondMatch).toBe(weaker);
			claimed.add(secondMatch!.entitlement.id);

			expect(
				find({
					source: ep({ priced: true }),
					candidates: [exact, weaker],
					excluded: claimed,
				}),
			).toBeUndefined();
		});
	});
});
