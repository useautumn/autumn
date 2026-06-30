import { describe, expect, test } from "bun:test";
import type {
	FeatureOptions,
	FullCusProduct,
	FullProduct,
	SyncParamsV1,
	SyncPlanInstance,
} from "@autumn/shared";
import { buildIncrementalSyncParams } from "@/internal/billing/v2/actions/sync/scope/buildIncrementalSyncParams";
import type {
	MatchedPlan,
	SubscriptionMatch,
} from "@/internal/billing/v2/actions/sync/detect/types";

const product = ({
	id,
	group = "main",
	isAddOn = false,
}: {
	id: string;
	group?: string | null;
	isAddOn?: boolean;
}): FullProduct =>
	({
		id,
		internal_id: `${id}_internal`,
		group,
		is_add_on: isAddOn,
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

const draft = ({
	matchedPlans,
	syncPlans = matchedPlans.map((plan) =>
		syncPlan({ productId: plan.product.id }),
	),
}: {
	matchedPlans: MatchedPlan[];
	syncPlans?: SyncPlanInstance[];
}): { match: SubscriptionMatch; params: SyncParamsV1 } => ({
	match: {
		stripe_subscription_id: "sub_incremental",
		stripe_schedule_id: null,
		phaseMatches: [
			{
				start_date: 123,
				end_date: null,
				is_current: true,
				item_diffs: [],
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
		const { match, params } = draft({ matchedPlans: [matchedPlan({ product: pro })] });

		const result = buildIncrementalSyncParams({
			match,
			params,
			linkedCustomerProducts: [],
		});

		expect(result.shouldSync).toBe(true);
		if (!result.shouldSync) throw new Error(result.reason);
		expect(result.params.phases?.[0]?.plans.map((plan) => plan.plan_id)).toEqual([
			"pro",
		]);
	});

	test("prunes a plan when the linked target already has the same product", () => {
		const pro = product({ id: "pro" });
		const { match, params } = draft({ matchedPlans: [matchedPlan({ product: pro })] });

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
		expect(result.params.phases?.[0]?.plans).toHaveLength(1);
		expect(result.params.phases?.[0]?.plans[0]?.plan_id).toBe("premium");
	});

	test("preserves params metadata and sync plan fields while pruning no-op targets", () => {
		const pro = product({ id: "pro", group: "main" });
		const premium = product({ id: "premium", group: "main" });
		const analytics = product({ id: "analytics", group: "analytics" });
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
		expect(result.params.customer_id).toBe(params.customer_id);
		expect(result.params.stripe_subscription_id).toBe(params.stripe_subscription_id);
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
		expect(result.params.phases?.[0]?.plans[0]?.entity_id).toBe("entity_b");
	});

	test("rejects duplicate linked targets", () => {
		const pro = product({ id: "pro" });
		const premium = product({ id: "premium" });
		const { match, params } = draft({ matchedPlans: [matchedPlan({ product: pro })] });

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

	test("rejects unsupported targets with no product group or add-on products", () => {
		const noGroup = product({ id: "no_group", group: null });
		const blankGroup = product({ id: "blank_group", group: "" });
		const addOn = product({ id: "addon", isAddOn: true });

		for (const unsupported of [noGroup, blankGroup, addOn]) {
			const { match, params } = draft({
				matchedPlans: [matchedPlan({ product: unsupported })],
			});

			const result = buildIncrementalSyncParams({
				match,
				params,
				linkedCustomerProducts: [],
			});

			expect(result).toMatchObject({
				shouldSync: false,
				reason: "unsupported_target",
			});
		}
	});
});
