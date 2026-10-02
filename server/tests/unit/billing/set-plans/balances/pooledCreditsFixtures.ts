import {
	BillingVersion,
	type CreateScheduleBillingContext,
	CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
	type Entity,
	FeatureType,
	FeatureUsageType,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	ms,
	type Price,
	type SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { entities } from "@tests/utils/fixtures/db/entities";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { features } from "@tests/utils/fixtures/db/features";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { savedComparisonCustomers } from "@/internal/billing/v2/actions/setPlans/preview/balances/savedComparisonCustomers";
import { buildSetPlansPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPhaseCustomers";
import { matchReviewPhases } from "@/internal/billing/v2/actions/setPlans/preview/review/matchReviewPhases";
import { setPlansPhaseBalanceChanges } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPhaseBalanceChanges";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { applyPooledBalancePlanToFullCustomer } from "@/internal/billing/v2/utils/billingPlan/applyPooledBalancePlanToFullCustomer";
import { computeSetPlansPlanFromContext } from "../setPlansTimelineHelpers";

export const NOW = 1_800_000_000_000;
export const SUBSCRIBED_AT = NOW - ms.days(10);
export const RENEWAL = NOW + ms.days(30);

const CREDITS_CONFIG = {
	schema: [{ credit_amount: 1, metered_feature_id: "messages" }],
	usage_type: FeatureUsageType.Single,
};

export const ctx = {
	...contexts.create({
		features: [
			features.create({
				id: "messages",
				name: "Messages",
				config: { usage_type: FeatureUsageType.Single },
			}),
			features.create({
				id: "credits",
				name: "Credits",
				type: FeatureType.CreditSystem,
				config: CREDITS_CONFIG,
			}),
			features.create({ id: "users", name: "Users" }),
		],
	}),
	expand: [],
} as unknown as AutumnContext;

export const entityA = entities.create({ id: "ent_a", featureId: "users" });
export const entityB = entities.create({ id: "ent_b", featureId: "users" });

const creditsEntitlement = ({
	id,
	allowance,
	pooled,
	isCustom = false,
}: {
	id: string;
	allowance: number;
	pooled: boolean;
	isCustom?: boolean;
}): EntitlementWithFeature => ({
	...entitlements.create({
		id,
		featureId: "credits",
		featureName: "Credits",
		featureType: FeatureType.CreditSystem,
		featureConfig: CREDITS_CONFIG,
		interval: EntInterval.Month,
		allowance,
	}),
	pooled,
	is_custom: isCustom,
});

const OVERAGE_ENTITLEMENT_ID = "ent_credits_overage";
const overagePrice = prices.createConsumable({
	id: "price_credits_overage",
	featureId: "credits",
	entitlementId: OVERAGE_ENTITLEMENT_ID,
});

/** A plan whose included credits pool into the customer's shared balance, with overage billed per use. */
export const pooledCreditsPlan = ({
	planId,
	pooledAllowance,
	pooledEntitlementId = `ent_credits_pooled_${planId}`,
	isCustom = false,
	basePrice = prices.createFixed({ id: `price_${planId}` }),
}: {
	planId: string;
	pooledAllowance: number;
	pooledEntitlementId?: string;
	isCustom?: boolean;
	basePrice?: Price;
}) => {
	const pooledEntitlement = creditsEntitlement({
		id: pooledEntitlementId,
		allowance: pooledAllowance,
		pooled: true,
		isCustom,
	});
	return {
		pooledEntitlement,
		product: products.createFull({
			id: planId,
			prices: [basePrice, overagePrice],
			entitlements: [
				pooledEntitlement,
				creditsEntitlement({
					id: OVERAGE_ENTITLEMENT_ID,
					allowance: 0,
					pooled: false,
				}),
			],
		}),
	};
};

/** A plan whose included credits stay with the entity. */
export const ownCreditsPlan = ({
	planId,
	allowance,
	entitlementId = `ent_credits_${planId}`,
	isCustom = false,
}: {
	planId: string;
	allowance: number;
	entitlementId?: string;
	isCustom?: boolean;
}) => {
	const ownEntitlement = creditsEntitlement({
		id: entitlementId,
		allowance,
		pooled: false,
		isCustom,
	});
	return {
		ownEntitlement,
		product: products.createFull({
			id: planId,
			prices: [prices.createFixed({ id: `price_${planId}` })],
			entitlements: [ownEntitlement],
		}),
	};
};

export const entityRow = ({
	product,
	entity,
	rowId,
	status = CusProductStatus.Active,
	startsAt = SUBSCRIBED_AT,
	endedAt,
}: {
	product: FullProduct;
	entity: Entity;
	rowId: string;
	status?: CusProductStatus;
	startsAt?: number;
	endedAt?: number;
}): FullCusProduct =>
	customerProducts.create({
		id: rowId,
		productId: product.id,
		product,
		status,
		startsAt,
		endedAt,
		internalEntityId: entity.internal_id,
		entityId: entity.id ?? undefined,
		customerEntitlements: product.entitlements.map((entitlement) => {
			const customerEntitlement = customerEntitlements.create({
				id: `cus_${entitlement.id}_${rowId}`,
				entitlementId: entitlement.id,
				featureId: "credits",
				featureName: "Credits",
				featureType: FeatureType.CreditSystem,
				featureConfig: CREDITS_CONFIG,
				interval: EntInterval.Month,
				allowance: entitlement.allowance ?? 0,
				balance: entitlement.allowance ?? 0,
				customerProductId: rowId,
				usageAllowed: entitlement.id === OVERAGE_ENTITLEMENT_ID,
			});
			return {
				...customerEntitlement,
				reset_cycle_anchor: startsAt,
				next_reset_at: startsAt + ms.days(30),
				entitlement: { ...customerEntitlement.entitlement, ...entitlement },
			};
		}),
		customerPrices: product.prices.map((price) =>
			prices.createCustomer({ price, customerProductId: rowId }),
		),
	});

/** The customer as attach leaves it: entity plan rows plus the pools their pooled credits feed. */
export const customerWithPools = (rows: FullCusProduct[]): FullCustomer => {
	const billing = contexts.createBilling({ customerProducts: rows });
	const fullCustomer = {
		...billing.fullCustomer,
		entities: [entityA, entityB],
	};
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer,
		incomingCustomerProducts: rows.filter(
			({ status }) => status === CusProductStatus.Active,
		),
		now: SUBSCRIBED_AT,
	});
	applyPooledBalancePlanToFullCustomer({ fullCustomer, pooledBalancePlan });
	return fullCustomer;
};

export type RequestedPlan = {
	product: FullProduct;
	entity: Entity;
	currentRow?: FullCusProduct;
	scheduledRow?: FullCusProduct;
	customEntitlements?: EntitlementWithFeature[];
	customPrices?: Price[];
	ongoing?: boolean;
};

/** Runs the real set_plans compute, then the preview's per-phase balance diff against matched saved phases. */
export const previewPooledBalances = async ({
	current,
	now,
	later = [],
}: {
	current: FullCusProduct[];
	now: RequestedPlan[];
	later?: { startsAt: number; plans: RequestedPlan[] }[];
}): Promise<SetPlansPreviewBalanceChange[][]> => {
	const fullCustomer = customerWithPools(current);
	const billing = contexts.createBilling({
		customerProducts: current,
		fullProducts: [...now, ...later.flatMap(({ plans }) => plans)].map(
			({ product }) => product,
		),
		currentEpochMs: NOW,
		billingVersion: BillingVersion.V2,
	});
	const customPrices = now.flatMap((plan) => plan.customPrices ?? []);
	const customEnts = now.flatMap((plan) => plan.customEntitlements ?? []);
	const toPlanParams = ({ product, entity }: RequestedPlan) => ({
		plan_id: product.id,
		entity_id: entity.id,
	});
	const billingContext = {
		...billing,
		fullCustomer,
		productContexts: now.map((plan) => ({
			fullProduct: plan.product,
			customPrices: plan.customPrices ?? [],
			customEnts: plan.customEntitlements ?? [],
			featureQuantities: [],
			currentCustomerProduct: plan.currentRow,
			scheduledCustomerProduct: plan.scheduledRow,
			fullCustomer: { ...fullCustomer, entity: plan.entity },
			unscheduled: plan.ongoing === true,
		})),
		customPrices,
		customEnts,
		isCustom: customPrices.length > 0 || customEnts.length > 0,
		checkoutMode: null,
		billingStartsAt: NOW,
		immediatePhase: {
			starts_at: NOW,
			plans: now.filter((plan) => !plan.ongoing).map(toPlanParams),
		},
		futurePhases: later.map(({ startsAt, plans }) => ({
			starts_at: startsAt,
			plans: plans.map(toPlanParams),
		})),
		scheduledPhaseContexts: later.map(({ startsAt, plans }) => ({
			startsAt,
			endsAt: undefined,
			productContexts: plans.map((plan) => ({
				fullProduct: plan.product,
				entity: plan.entity,
				customPrices: [],
				customEntitlements: [],
				featureQuantities: [],
			})),
		})),
	} as unknown as CreateScheduleBillingContext;

	const { autumnBillingPlan, phases, timeline } =
		computeSetPlansPlanFromContext({ ctx, billingContext });
	const matches = matchReviewPhases({
		saved: timeline.saved,
		timeline: timeline.diff.timeline,
		phaseStarts: phases.map(({ startsAt }) => startsAt),
		now: timeline.diff.now,
	});

	return setPlansPhaseBalanceChanges({
		ctx,
		originalFullCustomer: fullCustomer,
		phaseCustomers: buildSetPlansPhaseCustomers({
			ctx,
			fullCustomer,
			autumnBillingPlan,
			phases,
		}),
		savedComparisonCustomers: savedComparisonCustomers({
			ctx,
			fullCustomer,
			autumnBillingPlan,
			phases,
			matches,
			now: timeline.diff.now,
		}),
	});
};

const describePooledChange = ({
	entity_id,
	feature_id,
	behavior,
	balance,
	previous_attributes,
	pooled,
}: SetPlansPreviewBalanceChange) => {
	const scope = entity_id ? `${entity_id}/` : "";
	const granted = `${previous_attributes.granted ?? balance.granted} -> ${balance.granted} granted`;
	const usageBased = balance.overage_allowed ? ", usage-based" : "";
	const pool = pooled
		? `, pool ${pooled.previous_total} -> ${pooled.total} across ${pooled.contributors}`
		: "";
	return `${scope}${feature_id} ${behavior}: ${granted}${usageBased}${pool}`;
};

export const describePooledPhases = (
	phaseChanges: SetPlansPreviewBalanceChange[][],
) => phaseChanges.map((changes) => changes.map(describePooledChange));
