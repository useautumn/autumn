import { describe, expect, test } from "bun:test";
import {
	buildUsageWindowKey,
	CusProductStatus,
	type DbSpendLimit,
	type DbUsageLimit,
	EntInterval,
	type Feature,
	FeatureType,
	type FullSubject,
	fullSubjectToUsageWindowLimits,
	getUsageWindowBounds,
	ResetInterval,
} from "@autumn/shared";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

const meteredAction1 = {
	id: "action1",
	internal_id: "iaction1",
	type: FeatureType.Metered,
} as Feature;
const creditsFeature = {
	id: "credits",
	internal_id: "icredits",
	type: FeatureType.CreditSystem,
} as Feature;
// Credit system whose schema contains action1, for the membership-anchor path.
const creditsContainingAction1 = {
	id: "credits",
	internal_id: "icredits",
	type: FeatureType.CreditSystem,
	config: { schema: [{ metered_feature_id: "action1", credit_amount: 5 }] },
} as unknown as Feature;
const credits2ContainingAction1 = {
	id: "credits2",
	internal_id: "icredits2",
	type: FeatureType.CreditSystem,
	config: { schema: [{ metered_feature_id: "action1", credit_amount: 3 }] },
} as unknown as Feature;

// Minimal loose (product-less) customer entitlement for anchor tests.
const looseEntitlement = ({
	id,
	featureId,
	interval = EntInterval.Month,
}: {
	id: string;
	featureId: string;
	interval?: EntInterval | null;
}) =>
	({
		id,
		feature_id: featureId,
		internal_entity_id: null,
		internal_feature_id: featureId,
		customer_product_id: null,
		entitlement_id: `ent_${id}`,
		created_at: 1000,
		balance: 0,
		expires_at: null,
		entitlement: {
			id: `ent_${id}`,
			feature_id: featureId,
			interval,
			feature: { id: featureId, internal_id: featureId },
		},
		rollovers: [],
		replaceables: [],
	}) as unknown as FullSubject["extra_customer_entitlements"][number];

// A customer product wrapping one entitlement, with an optional billing-cycle
// anchor. Unlike loose entitlements, product-backed ones keep their
// customer_product through fullSubjectToCustomerEntitlements, so the resolver can
// read the cycle anchor from it.
const customerProductWithEntitlement = ({
	id,
	featureId,
	cycleAnchor,
	nextResetAt,
}: {
	id: string;
	featureId: string;
	cycleAnchor?: number;
	nextResetAt?: number;
}) =>
	({
		id: `cusprod_${id}`,
		status: CusProductStatus.Active,
		created_at: 1000,
		product: { is_add_on: false },
		billing_cycle_anchor_resets_at: cycleAnchor ?? null,
		customer_entitlements: [
			{
				id,
				feature_id: featureId,
				internal_entity_id: null,
				internal_feature_id: featureId,
				customer_product_id: `cusprod_${id}`,
				entitlement_id: `ent_${id}`,
				created_at: 1000,
				balance: 0,
				expires_at: null,
				next_reset_at: nextResetAt ?? null,
				entitlement: {
					id: `ent_${id}`,
					feature_id: featureId,
					interval: EntInterval.Month,
					feature: { id: featureId, internal_id: featureId },
				},
				rollovers: [],
				replaceables: [],
			},
		],
	}) as unknown as FullSubject["customer_products"][number];

const buildSubject = ({
	usageLimits = [],
	spendLimits = [],
	looseEntitlements = [],
	customerProducts = [],
}: {
	// Entries injected as-is; pass Partial shapes to simulate stale stored data.
	usageLimits?: Partial<DbUsageLimit>[];
	spendLimits?: DbSpendLimit[];
	looseEntitlements?: FullSubject["extra_customer_entitlements"];
	customerProducts?: FullSubject["customer_products"];
}): FullSubject =>
	({
		customer: {
			usage_limits: usageLimits,
			spend_limits: spendLimits,
		},
		customer_products: customerProducts,
		extra_customer_entitlements: looseEntitlements,
	}) as unknown as FullSubject;

describe("fullSubjectToUsageWindowLimits", () => {
	test("resolves a customer-level metered-feature cap", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "action1", limit: 5, interval: ResetInterval.Month },
				],
			}),
			featureIds: ["action1"],
			features: [meteredAction1],
			now: NOW,
		});

		const { windowStartAt, windowEndAt } = getUsageWindowBounds({
			interval: EntInterval.Month,
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0]).toMatchObject({
			feature_id: "action1",
			internal_feature_id: "iaction1",
			dimension_type: "metered_feature",
			dimension_feature_id: "action1",
			scope_type: "customer",
			entity_id: null,
			interval: EntInterval.Month,
			window_start_at: windowStartAt,
			window_end_at: windowEndAt,
			limit: 5,
			key: buildUsageWindowKey({
				scopeType: "customer",
				internalEntityId: null,
				dimensionType: "metered_feature",
				dimensionFeatureId: "action1",
				interval: EntInterval.Month,
				windowStartAt,
			}),
		});
	});

	test("skips a cap whose feature is absent from the catalog (unresolvable internal_feature_id)", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "action1", limit: 5, interval: ResetInterval.Month },
				],
			}),
			featureIds: ["action1"],
			features: [],
			now: NOW,
		});

		expect(limits).toHaveLength(0);
	});

	test("a credit-system feature resolves to the balance dimension", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "credits", limit: 3, interval: ResetInterval.Day },
				],
			}),
			featureIds: ["credits"],
			features: [creditsFeature],
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0]).toMatchObject({
			dimension_type: "balance",
			dimension_feature_id: null,
		});
	});

	test("the window interval comes from the entry, independent of the entitlement's reset interval", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				// Entitlement resets monthly; the cap windows daily.
				usageLimits: [
					{ feature_id: "credits", limit: 3, interval: ResetInterval.Day },
				],
				looseEntitlements: [
					looseEntitlement({ id: "ce_credits", featureId: "credits" }),
				],
			}),
			featureIds: ["credits"],
			features: [creditsFeature],
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0]).toMatchObject({ limit: 3, interval: EntInterval.Day });
	});

	test("a stale entry missing its interval resolves nothing (fail-safe)", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [{ feature_id: "credits", limit: 3 }],
				looseEntitlements: [
					looseEntitlement({ id: "ce_credits", featureId: "credits" }),
				],
			}),
			featureIds: ["credits"],
			features: [creditsFeature],
			now: NOW,
		});

		expect(limits).toHaveLength(0);
	});

	test("a limit of 0 is a valid hard cap (blocks all usage)", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "credits", limit: 0, interval: ResetInterval.Day },
				],
			}),
			featureIds: ["credits"],
			features: [creditsFeature],
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0]).toMatchObject({ limit: 0 });
	});

	test("aligns window bounds to the billing-cycle anchor when present", () => {
		// Anchor: a non-midnight, non-first-of-month timestamp the cycle aligns to.
		const cycleAnchor = Date.UTC(2026, 0, 9, 15, 30, 0);
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "credits", limit: 3, interval: ResetInterval.Day },
				],
				customerProducts: [
					customerProductWithEntitlement({
						id: "ce_credits",
						featureId: "credits",
						cycleAnchor,
					}),
				],
			}),
			featureIds: ["credits"],
			features: [creditsFeature],
			now: NOW,
		});

		const aligned = getUsageWindowBounds({
			interval: EntInterval.Day,
			now: NOW,
			anchor: cycleAnchor,
		});
		const calendar = getUsageWindowBounds({
			interval: EntInterval.Day,
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0].window_start_at).toBe(aligned.windowStartAt);
		expect(limits[0].window_end_at).toBe(aligned.windowEndAt);
		// Sanity: the anchored window genuinely differs from calendar alignment.
		expect(aligned.windowStartAt).not.toBe(calendar.windowStartAt);
	});

	test("the anchor ent's next_reset_at outranks the billing-cycle anchor for bounds", () => {
		// Non-calendar, non-cycle-anchor timestamps so all three alignments differ.
		const cycleAnchor = Date.UTC(2026, 0, 9, 15, 30, 0);
		const nextResetAt = Date.UTC(2026, 5, 22, 8, 45, 0);
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "credits", limit: 3, interval: ResetInterval.Day },
				],
				customerProducts: [
					customerProductWithEntitlement({
						id: "ce_credits",
						featureId: "credits",
						cycleAnchor,
						nextResetAt,
					}),
				],
			}),
			featureIds: ["credits"],
			features: [creditsFeature],
			now: NOW,
		});

		const resetAligned = getUsageWindowBounds({
			interval: EntInterval.Day,
			now: NOW,
			anchor: nextResetAt,
		});
		const cycleAligned = getUsageWindowBounds({
			interval: EntInterval.Day,
			now: NOW,
			anchor: cycleAnchor,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0].window_start_at).toBe(resetAligned.windowStartAt);
		expect(limits[0].window_end_at).toBe(resetAligned.windowEndAt);
		// Sanity: the reset-cycle window genuinely differs from the cycle-anchor one.
		expect(resetAligned.windowStartAt).not.toBe(cycleAligned.windowStartAt);
	});

	test("an overage spend_limit does not arm a usage window", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				spendLimits: [
					{ feature_id: "action1", enabled: true, overage_limit: 20 },
				],
			}),
			featureIds: ["action1"],
			features: [meteredAction1],
			now: NOW,
		});

		expect(limits).toHaveLength(0);
	});

	test("a usage limit coexists with an overage spend_limit on the same feature", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "action1", limit: 5, interval: ResetInterval.Month },
				],
				spendLimits: [
					{ feature_id: "action1", enabled: true, overage_limit: 20 },
				],
			}),
			featureIds: ["action1"],
			features: [meteredAction1],
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0]).toMatchObject({ feature_id: "action1", limit: 5 });
	});

	test("returns nothing when no cap matches the feature", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({ usageLimits: [] }),
			featureIds: ["action1"],
			features: [meteredAction1],
			now: NOW,
		});

		expect(limits).toHaveLength(0);
	});

	test("returns one limit per feature when caps exist on multiple features", () => {
		const meteredAction2 = {
			id: "action2",
			internal_id: "iaction2",
			type: FeatureType.Metered,
		} as Feature;
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "action1", limit: 5, interval: ResetInterval.Month },
					{ feature_id: "action2", limit: 9, interval: ResetInterval.Day },
				],
			}),
			featureIds: ["action1", "action2"],
			features: [meteredAction1, meteredAction2],
			now: NOW,
		});

		expect(limits).toHaveLength(2);
		expect(limits.map((limit) => limit.feature_id).sort()).toEqual([
			"action1",
			"action2",
		]);
	});

	test("resolves the anchor to the owning entitlement (balance dim)", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "credits", limit: 3, interval: ResetInterval.Day },
				],
				looseEntitlements: [
					looseEntitlement({ id: "ce_credits", featureId: "credits" }),
				],
			}),
			featureIds: ["credits"],
			features: [creditsFeature],
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0]).toMatchObject({
			anchor_customer_entitlement_id: "ce_credits",
		});
	});

	test("metered cap with no native entitlement anchors to the containing credit system", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "action1", limit: 5, interval: ResetInterval.Month },
				],
				looseEntitlements: [
					looseEntitlement({ id: "ce_credits", featureId: "credits" }),
				],
			}),
			featureIds: ["action1"],
			features: [meteredAction1, creditsContainingAction1],
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0]).toMatchObject({
			dimension_type: "metered_feature",
			dimension_feature_id: "action1",
			anchor_customer_entitlement_id: "ce_credits",
		});
	});

	test("anchor is null when no reference entitlement exists (calendar bounds, no provenance)", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "credits", limit: 3, interval: ResetInterval.Day },
				],
			}),
			featureIds: ["credits"],
			features: [creditsFeature],
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0].anchor_customer_entitlement_id).toBeNull();
	});

	test("metered cap with a containing credit system but no entitlement resolves a null anchor", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "action1", limit: 5, interval: ResetInterval.Month },
				],
			}),
			featureIds: ["action1"],
			features: [meteredAction1, creditsContainingAction1],
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0].anchor_customer_entitlement_id).toBeNull();
	});

	test("metered cap contained by two credit systems anchors deterministically", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				usageLimits: [
					{ feature_id: "action1", limit: 5, interval: ResetInterval.Month },
				],
				looseEntitlements: [
					looseEntitlement({ id: "ce_credits", featureId: "credits" }),
					looseEntitlement({ id: "ce_credits2", featureId: "credits2" }),
				],
			}),
			featureIds: ["action1"],
			features: [
				meteredAction1,
				creditsContainingAction1,
				credits2ContainingAction1,
			],
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0].anchor_customer_entitlement_id).toBe("ce_credits");
	});
});
