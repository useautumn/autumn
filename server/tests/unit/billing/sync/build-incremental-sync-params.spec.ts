/**
 * Pre-fix: a non-add-on linked product with no `product.group` set made
 * `linkedCustomerProductsToTargetGroupMap` bail with `{ ok: false }` even when
 * it was the only linked product -- blocking Stripe-portal downgrades from
 * auto-syncing for any catalog that doesn't configure product groups (the
 * common case). Post-fix: missing/blank group is itself a valid group key;
 * ambiguity now only fires on an actual collision between two non-add-on
 * products sharing the same entity+group key.
 */
import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type FeatureOptions,
	type FullCusProduct,
	type FullProduct,
	PriceType,
	type SyncParamsV1,
	type SyncPlanInstance,
} from "@autumn/shared";
import type {
	ItemDiff,
	MatchedPlan,
	SubscriptionMatch,
} from "@/internal/billing/v2/actions/sync/detect/types";
import { buildIncrementalSyncParams } from "@/internal/billing/v2/actions/sync/scope/buildIncrementalSyncParams";

const product = ({
	id,
	group = "main",
	isAddOn = false,
	version = 1,
}: {
	id: string;
	group?: string | null;
	isAddOn?: boolean;
	version?: number;
}): FullProduct =>
	({
		id,
		internal_id: `${id}_internal`,
		group,
		is_add_on: isAddOn,
		version,
		prices: [],
		entitlements: [],
		items: [],
	}) as unknown as FullProduct;

const matchedPlan = ({ product }: { product: FullProduct }): MatchedPlan => ({
	product,
	quantity: 1,
	base: {
		kind: "matched",
		stripe_item_id: `si_${product.id}`,
		autumn_price_id: `price_${product.id}`,
	},
	features: [],
	extras: [],
	warnings: [],
});

const syncPlan = ({
	productId,
	entityId,
	quantity = 1,
	featureQuantities,
}: {
	productId: string;
	entityId?: string;
	quantity?: number;
	featureQuantities?: FeatureOptions[];
}): SyncPlanInstance => ({
	plan_id: productId,
	quantity,
	expire_previous: true,
	...(entityId ? { entity_id: entityId } : {}),
	...(featureQuantities ? { feature_quantities: featureQuantities } : {}),
});

const linkedCustomerProduct = ({
	product,
	entityId,
	id = `cp_${product.id}`,
}: {
	product: FullProduct;
	entityId?: string;
	id?: string;
}): FullCusProduct =>
	({
		id,
		product_id: product.id,
		product,
		internal_entity_id: entityId,
	}) as unknown as FullCusProduct;

const unmatchedItemDiff = (id: string): ItemDiff => ({
	stripe: {
		id,
		stripe_price_id: `price_${id}`,
		stripe_product_id: `prod_${id}`,
		unit_amount: null,
		unit_amount_decimal: null,
		currency: "usd",
		quantity: 1,
		billing_scheme: "per_unit",
		tiers_mode: null,
		tiers: null,
		recurring_interval: "month",
		recurring_interval_count: null,
		recurring_usage_type: "metered",
		metadata: {},
	} as ItemDiff["stripe"],
	match: { kind: "none" },
});

const draft = ({
	matchedPlans,
	syncPlans = matchedPlans.map((plan) =>
		syncPlan({ productId: plan.product.id }),
	),
	itemDiffs = [],
}: {
	matchedPlans: MatchedPlan[];
	syncPlans?: SyncPlanInstance[];
	itemDiffs?: ItemDiff[];
}): { match: SubscriptionMatch; params: SyncParamsV1 } => ({
	match: {
		stripe_subscription_id: "sub_incremental",
		stripe_schedule_id: null,
		phaseMatches: [
			{
				start_date: 123,
				end_date: null,
				is_current: true,
				item_diffs: itemDiffs,
				plans: matchedPlans,
			},
		],
	},
	params: {
		customer_id: "cus_incremental",
		stripe_subscription_id: "sub_incremental",
		phases: [
			{
				starts_at: "now",
				plans: syncPlans,
			},
		],
	},
});

describe("buildIncrementalSyncParams", () => {
	test("keeps a plan when no linked customer product exists for its target", () => {
		const pro = product({ id: "pro" });
		const { match, params } = draft({
			matchedPlans: [matchedPlan({ product: pro })],
		});

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [],
		});

		expect(result.shouldSync).toBe(true);
		if (!result.shouldSync) throw new Error(result.reason);
		if (!result.params) throw new Error("expected incremental params");
		expect(
			result.params.phases?.[0]?.plans.map((plan) => plan.plan_id),
		).toEqual(["pro"]);
	});

	test("prunes a plan when the linked target already has the same product", () => {
		const pro = product({ id: "pro" });
		const { match, params } = draft({
			matchedPlans: [matchedPlan({ product: pro })],
		});

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [linkedCustomerProduct({ product: pro })],
		});

		expect(result).toMatchObject({
			shouldSync: false,
			reason: "no_changed_targets",
		});
	});

	test("keeps a plan when the public id matches but the version changed", () => {
		const proV1 = product({ id: "pro", version: 1 });
		const proV2 = product({ id: "pro", version: 2 });
		const { match, params } = draft({
			matchedPlans: [matchedPlan({ product: proV2 })],
			syncPlans: [{ ...syncPlan({ productId: "pro" }), version: 2 }],
		});

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [linkedCustomerProduct({ product: proV1 })],
		});

		expect(result.shouldSync).toBe(true);
		if (!result.shouldSync) throw new Error(result.reason);
		expect(result.params?.phases?.[0]?.plans).toEqual([
			{ expire_previous: true, plan_id: "pro", quantity: 1, version: 2 },
		]);
	});

	test("keeps a plan when the linked target has a different product", () => {
		const pro = product({ id: "pro" });
		const premium = product({ id: "premium" });
		const { match, params } = draft({
			matchedPlans: [matchedPlan({ product: premium })],
		});

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [linkedCustomerProduct({ product: pro })],
		});

		expect(result.shouldSync).toBe(true);
		if (!result.shouldSync) throw new Error(result.reason);
		if (!result.params) throw new Error("expected incremental params");
		expect(result.params.phases?.[0]?.plans).toHaveLength(1);
		expect(result.params.phases?.[0]?.plans[0]?.plan_id).toBe("premium");
	});

	test("preserves params metadata and sync plan fields while pruning no-op targets", () => {
		const pro = product({ id: "pro", group: "main" });
		const premium = product({ id: "premium", group: "main" });
		const analyticsV2 = product({ id: "analytics_v2", group: "analytics" });
		const featureQuantities: FeatureOptions[] = [
			{
				feature_id: "messages",
				internal_feature_id: "messages_internal",
				quantity: 42,
			},
		];
		const proPlan = syncPlan({ productId: premium.id, quantity: 2 });
		const analyticsPlan = syncPlan({
			productId: analyticsV2.id,
			featureQuantities,
		});
		const { match, params } = draft({
			matchedPlans: [
				matchedPlan({ product: premium }),
				matchedPlan({ product: analyticsV2 }),
			],
			syncPlans: [proPlan, analyticsPlan],
		});
		params.stripe_schedule_id = "sched_incremental";
		params.carry_over_usage = false;

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [
				linkedCustomerProduct({ product: pro }),
				linkedCustomerProduct({ product: analyticsV2 }),
			],
		});

		expect(result.shouldSync).toBe(true);
		if (!result.shouldSync) throw new Error(result.reason);
		if (!result.params) throw new Error("expected incremental params");
		expect(result.params.customer_id).toBe(params.customer_id);
		expect(result.params.stripe_subscription_id).toBe(
			params.stripe_subscription_id,
		);
		expect(result.params.stripe_schedule_id).toBe("sched_incremental");
		expect(result.params.carry_over_usage).toBe(false);
		expect(result.params.phases?.[0]?.starts_at).toBe("now");
		expect(result.params.phases?.[0]?.plans).toEqual([proPlan]);
		expect(result.params.phases?.[0]?.plans[0]?.quantity).toBe(2);
	});

	test("uses entity id as part of the target identity", () => {
		const pro = product({ id: "pro" });
		const { match, params } = draft({
			matchedPlans: [matchedPlan({ product: pro })],
			syncPlans: [syncPlan({ productId: pro.id, entityId: "entity_b" })],
		});

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [
				linkedCustomerProduct({ product: pro, entityId: "entity_a" }),
			],
		});

		expect(result.shouldSync).toBe(true);
		if (!result.shouldSync) throw new Error(result.reason);
		if (!result.params) throw new Error("expected incremental params");
		expect(result.params.phases?.[0]?.plans[0]?.entity_id).toBe("entity_b");
	});

	test("rejects duplicate linked targets", () => {
		const pro = product({ id: "pro" });
		const premium = product({ id: "premium" });
		const { match, params } = draft({
			matchedPlans: [matchedPlan({ product: pro })],
		});

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [
				linkedCustomerProduct({ product: pro, id: "cp_pro" }),
				linkedCustomerProduct({ product: premium, id: "cp_premium" }),
			],
		});

		expect(result).toMatchObject({
			shouldSync: false,
			reason: "ambiguous_linked_targets",
		});
	});

	test("syncs a single ungrouped product with no linked customer product", () => {
		const noGroup = product({ id: "no_group", group: null });
		const blankGroup = product({ id: "blank_group", group: "" });

		for (const unsupported of [noGroup, blankGroup]) {
			const { match, params } = draft({
				matchedPlans: [matchedPlan({ product: unsupported })],
			});

			const result = buildIncrementalSyncParams({
				match,
				params,
				linkedCustomerProducts: [],
			});

			expect(result.shouldSync).toBe(true);
			if (!result.shouldSync) throw new Error(result.reason);
			if (!result.params) throw new Error("expected incremental params");
			expect(
				result.params.phases?.[0]?.plans.map((plan) => plan.plan_id),
			).toEqual([unsupported.id]);
		}
	});

	test("syncs a downgrade between two ungrouped products with a single linked target (production regression)", () => {
		const ultra = product({ id: "poke_ultra", group: "" });
		const pro = product({ id: "poke_pro", group: "" });
		const { match, params } = draft({
			matchedPlans: [matchedPlan({ product: pro })],
		});

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [linkedCustomerProduct({ product: ultra })],
		});

		expect(result.shouldSync).toBe(true);
		if (!result.shouldSync) throw new Error(result.reason);
		if (!result.params) throw new Error("expected incremental params");
		expect(
			result.params.phases?.[0]?.plans.map((plan) => plan.plan_id),
		).toEqual(["poke_pro"]);
	});

	test("rejects genuinely ambiguous ungrouped linked targets", () => {
		const ultra = product({ id: "poke_ultra", group: null });
		const credits = product({ id: "poke_credits", group: "" });
		const { match, params } = draft({
			matchedPlans: [matchedPlan({ product: ultra })],
		});

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [
				linkedCustomerProduct({ product: ultra, id: "cp_ultra" }),
				linkedCustomerProduct({ product: credits, id: "cp_credits" }),
			],
		});

		expect(result).toMatchObject({
			shouldSync: false,
			reason: "ambiguous_linked_targets",
		});
	});

	test("keeps add-ons when linked quantity is below desired quantity", () => {
		const addOn = product({ id: "addon", isAddOn: true });
		const { match, params } = draft({
			matchedPlans: [matchedPlan({ product: addOn })],
			syncPlans: [syncPlan({ productId: addOn.id, quantity: 3 })],
		});

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [
				linkedCustomerProduct({ product: addOn, id: "cp_addon_1" }),
			],
		});

		expect(result.shouldSync).toBe(true);
		if (!result.shouldSync) throw new Error(result.reason);
		if (!result.params) throw new Error("expected incremental params");
		// Adding instances must not expire the ones already linked — add-on
		// expire_previous now replaces the linked same-product instance.
		expect(result.params.phases?.[0]?.plans).toEqual([
			{ expire_previous: false, plan_id: "addon", quantity: 2 },
		]);
	});

	test("does not expire a linked add-on whose Stripe item merely failed to match (detection miss, not removal)", () => {
		const addOn = product({ id: "addon", isAddOn: true });
		// No matched plans at all for this phase — simulates a detection miss
		// (e.g. the tiered-prepaid enrichment gap) rather than a true removal:
		// the add-on's Stripe item is still on the subscription as an
		// unmatched item_diff, not absent from it.
		const { match, params } = draft({
			matchedPlans: [],
			syncPlans: [],
			itemDiffs: [unmatchedItemDiff("addon_item")],
		});

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [
				linkedCustomerProduct({ product: addOn, id: "cp_addon_1" }),
			],
		});

		if (result.shouldSync) {
			expect(result.removedCustomerProducts).toEqual([]);
		} else {
			expect(result.reason).toBe("no_changed_targets");
		}
	});

	test("prunes add-ons when linked quantity already satisfies desired quantity", () => {
		const addOn = product({ id: "addon", isAddOn: true });
		const { match, params } = draft({
			matchedPlans: [matchedPlan({ product: addOn })],
			syncPlans: [syncPlan({ productId: addOn.id, quantity: 2 })],
		});

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [
				linkedCustomerProduct({ product: addOn, id: "cp_addon_1" }),
				linkedCustomerProduct({ product: addOn, id: "cp_addon_2" }),
			],
		});

		expect(result).toMatchObject({
			shouldSync: false,
			reason: "no_changed_targets",
		});
	});

	test("treats a missing prepaid Stripe item as converged when purchased packs are zero", () => {
		const prepaid = product({ id: "prepaid" });
		prepaid.entitlements = [
			{
				id: "entitlement_credits",
				internal_product_id: prepaid.internal_id,
				internal_feature_id: "internal_credits",
				feature_id: "credits",
				allowance: 100,
				feature: { id: "credits", internal_id: "internal_credits" },
			} as never,
		];
		prepaid.prices = [
			{
				id: "price_credits",
				internal_product_id: prepaid.internal_id,
				entitlement_id: "entitlement_credits",
				config: {
					type: PriceType.Usage,
					bill_when: BillWhen.InAdvance,
					billing_units: 100,
					internal_feature_id: "internal_credits",
					feature_id: "credits",
					usage_tiers: [{ to: -1, amount: 1 }],
					interval: BillingInterval.Month,
				},
			} as never,
		];
		const linkedProduct = linkedCustomerProduct({ product: prepaid });
		linkedProduct.options = [
			{
				feature_id: "credits",
				internal_feature_id: "internal_credits",
				quantity: 0,
			},
		];
		const { match, params } = draft({
			matchedPlans: [matchedPlan({ product: prepaid })],
			syncPlans: [
				syncPlan({
					productId: prepaid.id,
					featureQuantities: [
						{
							feature_id: "credits",
							internal_feature_id: "internal_credits",
							quantity: 0,
						},
					],
				}),
			],
		});

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [linkedProduct],
		});

		expect(result).toMatchObject({
			shouldSync: false,
			reason: "no_changed_targets",
		});
	});
});
