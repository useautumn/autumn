import { describe, expect, test } from "bun:test";
import {
	buildUsageWindowKey,
	type DbSpendLimit,
	EntInterval,
	type Feature,
	FeatureType,
	type FullSubject,
	fullSubjectToUsageWindowLimits,
	getUsageWindowBounds,
	SpendLimitUsageWindowSchema,
} from "@autumn/shared";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

const meteredAction1 = { id: "action1", type: FeatureType.Metered } as Feature;
const creditsFeature = {
	id: "credits",
	type: FeatureType.CreditSystem,
} as Feature;
// Credit system whose schema contains action1, for the membership-anchor path.
const creditsContainingAction1 = {
	id: "credits",
	type: FeatureType.CreditSystem,
	config: { schema: [{ metered_feature_id: "action1", credit_amount: 5 }] },
} as unknown as Feature;
const credits2ContainingAction1 = {
	id: "credits2",
	type: FeatureType.CreditSystem,
	config: { schema: [{ metered_feature_id: "action1", credit_amount: 3 }] },
} as unknown as Feature;

// Test-input shape for a windowed usage cap; wrapped into a spend_limit's
// usage_window sub-object by `toSpendLimit` (the cap config now lives there).
type UsageCap = {
	feature_id: string;
	enabled: boolean;
	limit: number;
	interval: EntInterval;
};

const toSpendLimit = (cap: UsageCap): DbSpendLimit => ({
	feature_id: cap.feature_id,
	// Entry-level enabled gates the (absent) overage cap, not the window cap.
	enabled: false,
	usage_window: {
		interval: cap.interval,
		limit: cap.limit,
		enabled: cap.enabled,
	},
});

// Minimal loose (product-less) customer entitlement for anchor candidate tests.
const looseEntitlement = ({
	id,
	featureId,
}: {
	id: string;
	featureId: string;
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
			interval: EntInterval.Month,
			feature: { id: featureId, internal_id: featureId },
		},
		rollovers: [],
		replaceables: [],
	}) as unknown as FullSubject["extra_customer_entitlements"][number];

const buildSubject = ({
	customerLimits = [],
	entityLimits,
	looseEntitlements = [],
	extraCustomerSpendLimits = [],
}: {
	customerLimits?: UsageCap[];
	entityLimits?: UsageCap[];
	looseEntitlements?: FullSubject["extra_customer_entitlements"];
	// Raw spend-limit entries (e.g. overage-only or both-cap) injected as-is.
	extraCustomerSpendLimits?: DbSpendLimit[];
}): FullSubject =>
	({
		customer: {
			spend_limits: [
				...customerLimits.map(toSpendLimit),
				...extraCustomerSpendLimits,
			],
		},
		customer_products: [],
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
					{
						feature_id: "action1",
						enabled: true,
						limit: 5,
						interval: EntInterval.Month,
					},
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

	test("a credit-system feature resolves to the balance dimension", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				customerLimits: [
					{
						feature_id: "credits",
						enabled: true,
						limit: 3,
						interval: EntInterval.Day,
					},
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

	test("skips caps whose usage_window is disabled", () => {
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				customerLimits: [
					{
						feature_id: "action1",
						enabled: false,
						limit: 5,
						interval: EntInterval.Month,
					},
				],
			}),
			featureIds: ["action1"],
			features: [meteredAction1],
			now: NOW,
		});

		expect(limits).toHaveLength(0);
	});

	test("usage_window with enabled omitted defaults to disabled and is not enforced", () => {
		const parsed = SpendLimitUsageWindowSchema.parse({
			interval: EntInterval.Month,
			limit: 5,
		});
		expect(parsed.enabled).toBe(false);

		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				extraCustomerSpendLimits: [
					{ feature_id: "action1", enabled: false, usage_window: parsed },
				],
			}),
			featureIds: ["action1"],
			features: [meteredAction1],
			now: NOW,
		});

		expect(limits).toHaveLength(0);
	});

	test("ignores an overage-only spend_limit (no usage_window)", () => {
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
						usage_window: {
							interval: EntInterval.Month,
							limit: 5,
							enabled: true,
						},
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
					{
						feature_id: "action1",
						enabled: true,
						limit: 5,
						interval: EntInterval.Month,
					},
				],
				entityLimits: [
					{
						feature_id: "action1",
						enabled: true,
						limit: 2,
						interval: EntInterval.Month,
					},
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
					{
						feature_id: "action1",
						enabled: true,
						limit: 2,
						interval: EntInterval.Month,
					},
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
			type: FeatureType.Metered,
		} as Feature;
		const limits = fullSubjectToUsageWindowLimits({
			fullSubject: buildSubject({
				customerLimits: [
					{
						feature_id: "action1",
						enabled: true,
						limit: 5,
						interval: EntInterval.Month,
					},
					{
						feature_id: "action2",
						enabled: true,
						limit: 9,
						interval: EntInterval.Day,
					},
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
					{
						feature_id: "credits",
						enabled: true,
						limit: 3,
						interval: EntInterval.Day,
					},
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
					{
						feature_id: "action1",
						enabled: true,
						limit: 5,
						interval: EntInterval.Month,
					},
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
					{
						feature_id: "credits",
						enabled: true,
						limit: 3,
						interval: EntInterval.Day,
					},
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
					{
						feature_id: "action1",
						enabled: true,
						limit: 5,
						interval: EntInterval.Month,
					},
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
					{
						feature_id: "action1",
						enabled: true,
						limit: 5,
						interval: EntInterval.Month,
					},
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
