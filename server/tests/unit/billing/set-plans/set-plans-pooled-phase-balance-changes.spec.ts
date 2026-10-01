import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	FeatureUsageType,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	ms,
	type SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { customers } from "@tests/utils/fixtures/db/customers";
import { features } from "@tests/utils/fixtures/db/features";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildSetPlansPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPhaseCustomers";
import { setPlansPhaseBalanceChanges } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPhaseBalanceChanges";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { applyPooledBalancePlanToFullCustomer } from "@/internal/billing/v2/utils/billingPlan/applyPooledBalancePlanToFullCustomer";
import {
	makeAutumnBillingPlan,
	makeUpdate,
} from "../billing-change-response/helpers/makeAutumnBillingPlan";

const NOW = 1_800_000_000_000;
const SUBSCRIBED_AT = NOW - ms.days(10);
const NEXT_YEAR = NOW + ms.days(365);
const SUBSCRIPTION_ID = "sub_pro";

const CONSUMABLE = { usage_type: FeatureUsageType.Single };
const aiCreditsFeature = features.create({
	id: "ai_credits",
	name: "AI Credits",
	config: CONSUMABLE,
});

const ctx = {
	...contexts.create({ features: [aiCreditsFeature] }),
	expand: [],
} as unknown as AutumnContext;

const aiCredits = ({
	customerProductId,
	allowance,
	pooled,
	resetCycleAnchor = SUBSCRIBED_AT,
}: {
	customerProductId: string;
	allowance: number;
	pooled: boolean;
	resetCycleAnchor?: number;
}): FullCustomerEntitlement => {
	const entitlementId = `ent_ai_credits_${pooled ? "pooled" : "usage"}_${customerProductId}`;
	const customerEntitlement = customerEntitlements.create({
		id: `cus_${entitlementId}`,
		entitlementId,
		featureId: "ai_credits",
		featureName: "AI Credits",
		featureConfig: CONSUMABLE,
		interval: EntInterval.Month,
		allowance,
		balance: allowance,
		customerProductId,
	});
	return {
		...customerEntitlement,
		reset_cycle_anchor: resetCycleAnchor,
		next_reset_at: resetCycleAnchor + ms.days(30),
		entitlement: { ...customerEntitlement.entitlement, pooled },
	};
};

/** Pro's credits: a pooled monthly allowance next to a usage-based zero allowance. */
const proCredits = ({
	customerProductId,
	pooledAllowance,
	resetCycleAnchor,
}: {
	customerProductId: string;
	pooledAllowance: number;
	resetCycleAnchor?: number;
}) => [
	aiCredits({
		customerProductId,
		allowance: pooledAllowance,
		pooled: true,
		resetCycleAnchor,
	}),
	aiCredits({
		customerProductId,
		allowance: 0,
		pooled: false,
		resetCycleAnchor,
	}),
];

const planRow = ({
	planId,
	rowId = `cp_${planId}`,
	balances,
	status = CusProductStatus.Active,
	startsAt = SUBSCRIBED_AT,
	isAddOn = false,
}: {
	planId: string;
	rowId?: string;
	balances: (customerProductId: string) => FullCustomerEntitlement[];
	status?: CusProductStatus;
	startsAt?: number;
	isAddOn?: boolean;
}): FullCusProduct => {
	const product = products.createFull({
		id: planId,
		isAddOn,
		prices: [prices.createFixed({ id: `price_${planId}` })],
	});
	return customerProducts.create({
		id: rowId,
		productId: planId,
		product,
		status,
		startsAt,
		subscriptionIds:
			status === CusProductStatus.Active ? [SUBSCRIPTION_ID] : [],
		customerEntitlements: balances(rowId),
		customerPrices: product.prices.map((price) =>
			prices.createCustomer({ price, customerProductId: rowId }),
		),
	});
};

/** The customer as attach leaves it: plan rows plus the pools their pooled entitlements feed. */
const savedCustomerWithPools = (current: FullCusProduct[]): FullCustomer => {
	const fullCustomer = customers.create({ customerProducts: current });
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer,
		incomingCustomerProducts: fullCustomer.customer_products,
		stripeSubscriptionId: SUBSCRIPTION_ID,
		now: SUBSCRIBED_AT,
	});
	applyPooledBalancePlanToFullCustomer({ fullCustomer, pooledBalancePlan });
	return fullCustomer;
};

const previewPooledBalanceChanges = async ({
	current,
	inserts,
	endings,
	phases,
}: {
	current: FullCusProduct[];
	inserts: FullCusProduct[];
	endings: FullCusProduct[];
	phases: SchedulePhasePlan[];
}) => {
	const fullCustomer = savedCustomerWithPools(current);
	const phaseCustomers = buildSetPlansPhaseCustomers({
		ctx,
		fullCustomer,
		autumnBillingPlan: makeAutumnBillingPlan({
			inserts,
			updates: endings.map((customerProduct) =>
				makeUpdate({ customerProduct, updates: { ended_at: NEXT_YEAR } }),
			),
		}),
		phases,
	});
	return setPlansPhaseBalanceChanges({
		ctx,
		originalFullCustomer: fullCustomer,
		phaseCustomers,
	});
};

const describeChange = ({
	feature_id,
	behavior,
	balance,
	previous_attributes,
}: SetPlansPreviewBalanceChange) =>
	`${feature_id} ${behavior}: ${previous_attributes.granted ?? balance.granted} -> ${balance.granted} granted`;

const describePhases = (phaseChanges: SetPlansPreviewBalanceChange[][]) =>
	phaseChanges.map((changes) => changes.map(describeChange));

describe(
	chalk.yellowBright("setPlansPhaseBalanceChanges: pooled balances"),
	() => {
		test("a future phase customizing Pro's pooled allowance re-sizes the pool", async () => {
			const pro = planRow({
				planId: "pro",
				balances: (id) =>
					proCredits({ customerProductId: id, pooledAllowance: 10000 }),
			});
			const customPro = planRow({
				planId: "pro",
				rowId: "cp_pro_custom",
				status: CusProductStatus.Scheduled,
				startsAt: NEXT_YEAR,
				balances: (id) =>
					proCredits({
						customerProductId: id,
						pooledAllowance: 20000,
						resetCycleAnchor: NEXT_YEAR,
					}),
			});

			const phaseChanges = await previewPooledBalanceChanges({
				current: [pro],
				inserts: [customPro],
				endings: [pro],
				phases: [
					{ startsAt: NOW, customerProductIds: [pro.id] },
					{ startsAt: NEXT_YEAR, customerProductIds: [customPro.id] },
				],
			});

			expect(describePhases(phaseChanges)).toEqual([
				[],
				["ai_credits updated: 10000 -> 20000 granted"],
			]);
		});

		test("a future phase switching to a plan with a larger pooled allowance re-sizes the pool", async () => {
			const pro = planRow({
				planId: "pro",
				balances: (id) =>
					proCredits({ customerProductId: id, pooledAllowance: 10000 }),
			});
			const enterprise = planRow({
				planId: "enterprise",
				status: CusProductStatus.Scheduled,
				startsAt: NEXT_YEAR,
				balances: (id) =>
					proCredits({
						customerProductId: id,
						pooledAllowance: 50000,
						resetCycleAnchor: NEXT_YEAR,
					}),
			});

			const phaseChanges = await previewPooledBalanceChanges({
				current: [pro],
				inserts: [enterprise],
				endings: [pro],
				phases: [
					{ startsAt: NOW, customerProductIds: [pro.id] },
					{ startsAt: NEXT_YEAR, customerProductIds: [enterprise.id] },
				],
			});

			expect(describePhases(phaseChanges)).toEqual([
				[],
				["ai_credits updated: 10000 -> 50000 granted"],
			]);
		});

		test("a pooled add-on ending with no replacement drains the pool", async () => {
			const pro = planRow({ planId: "pro", balances: () => [] });
			const creditsAddon = planRow({
				planId: "credits_addon",
				isAddOn: true,
				balances: (id) => [
					aiCredits({ customerProductId: id, allowance: 10000, pooled: true }),
				],
			});

			const phaseChanges = await previewPooledBalanceChanges({
				current: [pro, creditsAddon],
				inserts: [],
				endings: [creditsAddon],
				phases: [
					{ startsAt: NOW, customerProductIds: [pro.id, creditsAddon.id] },
					{ startsAt: NEXT_YEAR, customerProductIds: [pro.id] },
				],
			});

			expect(describePhases(phaseChanges)).toEqual([
				[],
				["ai_credits removed: 10000 -> 0 granted"],
			]);
		});
	},
);
