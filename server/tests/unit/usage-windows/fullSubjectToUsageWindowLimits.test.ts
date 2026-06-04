import { describe, expect, test } from "bun:test";
import {
	buildUsageWindowKey,
	CusProductStatus,
	type DbSpendLimit,
	EntInterval,
	type Feature,
	FeatureType,
	type FullSubject,
	fullSubjectToUsageWindowLimits,
	getUsageWindowBounds,
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

// Test-input shape for a windowed usage cap. usage_limit arms the cap; `interval`
// is the optional override (omit it to test inheriting from the entitlement).
type UsageCap = {
	feature_id: string;
	limit: number;
	interval?: EntInterval;
};

const toSpendLimit = (cap: UsageCap): DbSpendLimit => ({
	feature_id: cap.feature_id,
	// Entry-level enabled gates the (absent) overage cap, not the usage window.
	enabled: false,
	usage_limit: cap.limit,
	usage_limit_interval: cap.interval,
});

// Minimal loose (product-less) customer entitlement for anchor/inherit tests.
// `interval` is the entitlement's reset interval (the inherited window source).
const looseEntitlement = ({
	id,
	featureId,
	usageLimit,
	interval = EntInterval.Month,
}: {
	id: string;
	featureId: string;
	usageLimit?: number;
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
			usage_limit: usageLimit ?? null,
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
	usageLimit,
	cycleAnchor,
}: {
	id: string;
	featureId: string;
	usageLimit?: number;
	cycleAnchor?: number;
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
				entitlement: {
					id: `ent_${id}`,
					feature_id: featureId,
					interval: EntInterval.Month,
					usage_limit: usageLimit ?? null,
					feature: { id: featureId, internal_id: featureId },
				},
				rollovers: [],
				replaceables: [],
			},
		],
	}) as unknown as FullSubject["customer_products"][number];

const buildSubject = ({
	customerLimits = [],
	entityLimits,
	looseEntitlements = [],
	extraCustomerSpendLimits = [],
	customerProducts = [],
}: {
	customerLimits?: UsageCap[];
	entityLimits?: UsageCap[];
	looseEntitlements?: FullSubject["extra_customer_entitlements"];
	// Raw spend-limit entries (e.g. overage-only or both-cap) injected as-is.
	extraCustomerSpendLimits?: DbSpendLimit[];
	customerProducts?: FullSubject["customer_products"];
}): FullSubject =>
	({
		customer: {
			spend_limits: [
				...customerLimits.map(toSpendLimit),
				...extraCustomerSpendLimits,
			],
		},
		customer_products: customerProducts,
		extra_customer_entitlements: looseEntitlements,
		entity: entityLimits
			? {
					id: "ent_1",
					internal_id: "ient_1",
					spend_limits: entityLimits.map(toSpendLimit),
				}
			: undefined,
	}) as unknown as FullSubject;

describe("fullSubjectToUsageWindowLimits", () => {
	test("resolves a customer-level metered-feature cap", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				customerLimits: [
					{ feature_id: "action1", limit: 5, interval: EntInterval.Month },
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
				customerLimits: [
					{ feature_id: "action1", limit: 5, interval: EntInterval.Month },
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
				customerLimits: [
					{ feature_id: "credits", limit: 3, interval: EntInterval.Day },
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

	test("inherits the interval from the anchor entitlement when no override", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				// No `interval` => inherit the entitlement's reset interval (Month).
				customerLimits: [{ feature_id: "credits", limit: 5 }],
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
			limit: 5,
			interval: EntInterval.Month,
			anchor_customer_entitlement_id: "ce_credits",
		});
	});

	test("an explicit usage_limit_interval overrides the inherited interval", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				// Entitlement interval is Month; the cap overrides to Day.
				customerLimits: [
					{ feature_id: "credits", limit: 3, interval: EntInterval.Day },
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

	test("a usage_limit with no override and a null-interval entitlement resolves nothing", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				customerLimits: [{ feature_id: "credits", limit: 3 }],
				looseEntitlements: [
					looseEntitlement({
						id: "ce_credits",
						featureId: "credits",
						interval: null,
					}),
				],
			}),
			featureIds: ["credits"],
			features: [creditsFeature],
			now: NOW,
		});

		expect(limits).toHaveLength(0);
	});

	test("a usage_limit of 0 is a valid hard cap (blocks all usage)", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				customerLimits: [
					{ feature_id: "credits", limit: 0, interval: EntInterval.Day },
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
				customerLimits: [
					{ feature_id: "credits", limit: 3, interval: EntInterval.Day },
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

	test("a spend_limit with usage_limit_interval but no usage_limit is not armed", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				extraCustomerSpendLimits: [
					{
						feature_id: "action1",
						enabled: false,
						usage_limit_interval: EntInterval.Month,
					},
				],
			}),
			featureIds: ["action1"],
			features: [meteredAction1],
			now: NOW,
		});

		expect(limits).toHaveLength(0);
	});

	test("ignores an overage-only spend_limit (no usage_limit)", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				extraCustomerSpendLimits: [
					{ feature_id: "action1", enabled: true, overage_limit: 20 },
				],
			}),
			featureIds: ["action1"],
			features: [meteredAction1],
			now: NOW,
		});

		expect(limits).toHaveLength(0);
	});

	test("resolves the window when one entry carries both overage and usage caps", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				extraCustomerSpendLimits: [
					{
						feature_id: "action1",
						enabled: true,
						overage_limit: 20,
						usage_limit: 5,
						usage_limit_interval: EntInterval.Month,
					},
				],
			}),
			featureIds: ["action1"],
			features: [meteredAction1],
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0]).toMatchObject({ feature_id: "action1", limit: 5 });
	});

	test("ignores entity-scoped usage windows in v1; the customer cap applies", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				customerLimits: [
					{ feature_id: "action1", limit: 5, interval: EntInterval.Month },
				],
				entityLimits: [
					{ feature_id: "action1", limit: 2, interval: EntInterval.Month },
				],
			}),
			featureIds: ["action1"],
			features: [meteredAction1],
			now: NOW,
		});

		expect(limits).toHaveLength(1);
		expect(limits[0]).toMatchObject({
			scope_type: "customer",
			entity_id: null,
			internal_entity_id: null,
			limit: 5,
		});
	});

	test("an entity-only usage window resolves nothing in v1", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				entityLimits: [
					{ feature_id: "action1", limit: 2, interval: EntInterval.Month },
				],
			}),
			featureIds: ["action1"],
			features: [meteredAction1],
			now: NOW,
		});

		expect(limits).toHaveLength(0);
	});

	test("returns nothing when no cap matches the feature", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({ customerLimits: [] }),
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
				customerLimits: [
					{ feature_id: "action1", limit: 5, interval: EntInterval.Month },
					{ feature_id: "action2", limit: 9, interval: EntInterval.Day },
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
				customerLimits: [
					{ feature_id: "credits", limit: 3, interval: EntInterval.Day },
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
			anchor_feature_id: "credits",
		});
	});

	test("metered cap with no native entitlement anchors to the containing credit system", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				customerLimits: [
					{ feature_id: "action1", limit: 5, interval: EntInterval.Month },
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
			anchor_feature_id: "credits",
		});
	});

	test("anchor is null when no owning entitlement exists (fail-closed signal)", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				customerLimits: [
					{ feature_id: "credits", limit: 3, interval: EntInterval.Day },
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
				customerLimits: [
					{ feature_id: "action1", limit: 5, interval: EntInterval.Month },
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
				customerLimits: [
					{ feature_id: "action1", limit: 5, interval: EntInterval.Month },
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
