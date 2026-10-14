import {
	AllowanceType,
	cusEntToStartingBalance,
	deduplicateArray,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	fullCustomerToOverageAllowedByFeatureId,
	fullCustomerToSpendLimitByFeatureId,
	fullCustomerToUsageBasedCusEntsByFeatureId,
	getMaxOverage,
	notNullish,
	orgToInStatuses,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";
import type {
	CustomerEntitlementDeduction,
	DeductionOptions,
	PreparedFeatureDeduction,
} from "../types/deductionTypes.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";
import { computeCreditCosts } from "./computeCreditCosts.js";
import { resolveOverageAllowance } from "./resolveOverageAllowance.js";

export const prepareFeatureDeduction = ({
	ctx,
	fullCustomer,
	deduction,
	options = {},
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	deduction: FeatureDeduction;
	options?: DeductionOptions;
}): PreparedFeatureDeduction => {
	const { org } = ctx;
	const { env } = ctx;
	const { feature, lock, targetBalance } = deduction;

	const { overageBehaviour = "cap", customerEntitlementFilters } = options;

	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		...(notNullish(targetBalance)
			? { featureIds: [feature.id] }
			: { fundsFeatureId: feature.id }),
		reverseOrder: org.config?.reverse_deduction_order,
		entity: fullCustomer.entity,
		inStatuses: orgToInStatuses({ org }),
		customerEntitlementFilters,
	});

	const isUnlimitedCusEnt = (ce: FullCusEntWithFullCusProduct): boolean =>
		ce.entitlement.allowance_type === AllowanceType.Unlimited ||
		Boolean(ce.unlimited);

	const effectiveFeatureIds = deduplicateArray([
		feature.id,
		...cusEnts.map((ce) => ce.entitlement.feature.id),
	]);
	const spendLimitByFeatureId = fullCustomerToSpendLimitByFeatureId({
		fullCustomer,
		featureIds: effectiveFeatureIds,
	});
	const usageBasedCusEntIdsByFeatureId =
		fullCustomerToUsageBasedCusEntsByFeatureId({
			fullCustomer,
			featureIds: effectiveFeatureIds,
		});
	const overageAllowedByFeatureId = fullCustomerToOverageAllowedByFeatureId({
		fullCustomer,
		featureIds: effectiveFeatureIds,
	});

	const nativeUsageAllowedFeatureIds = new Set(
		cusEnts
			.filter((ce) => ce.usage_allowed)
			.map((ce) => ce.entitlement.feature.id),
	);

	const getCreditCostForEnt = computeCreditCosts({
		cusEnts,
		deduction,
		catalogFeatures: ctx.features,
		eventProperties: options?.eventProperties ?? undefined,
	});

	const customerEntitlementDeductions: CustomerEntitlementDeduction[] =
		cusEnts.map((ce) => {
			const { creditCost, rateCard } = getCreditCostForEnt(ce.id);
			const maxOverage = getMaxOverage({ cusEnt: ce });

			const resetBalance = cusEntToStartingBalance({ cusEnt: ce });

			const isUnlimited = isUnlimitedCusEnt(ce);

			const { usageAllowed, overagePriority } = resolveOverageAllowance({
				customerEntitlement: ce,
				overageBehaviour,
				overageAllowedControl:
					overageAllowedByFeatureId[ce.entitlement.feature.id],
				featureHasNativeOverage: nativeUsageAllowedFeatureIds.has(
					ce.entitlement.feature.id,
				),
				unlimited: isUnlimited,
			});

			return {
				customer_entitlement_id: ce.id,
				credit_cost: creditCost,
				...(rateCard ? { rate_card: rateCard } : {}),
				feature_id: ce.entitlement.feature.id,
				entity_feature_id: ce.entitlement.entity_feature_id ?? null,
				usage_allowed: usageAllowed,
				overage_priority: overagePriority,
				min_balance:
					isUnlimited || !notNullish(maxOverage) ? undefined : -maxOverage,
				max_balance: isUnlimited ? undefined : resetBalance,
				...(isUnlimited ? { unlimited: true } : {}),
			};
		});

	const unlimitedEntryIndex = customerEntitlementDeductions.findIndex(
		(deductionEntry) => deductionEntry.unlimited,
	);
	if (unlimitedEntryIndex > 0) {
		const [unlimitedEntry] = customerEntitlementDeductions.splice(
			unlimitedEntryIndex,
			1,
		);
		customerEntitlementDeductions.unshift(unlimitedEntry);
	}

	const sortedRollovers = cusEnts
		.flatMap((ce) => {
			const { creditCost, rateCard } = getCreditCostForEnt(ce.id);
			return (ce.rollovers || []).map((r) => ({
				...r,
				credit_cost: creditCost,
				...(rateCard ? { rate_card: rateCard } : {}),
			}));
		})
		.sort((a, b) => {
			if (a.expires_at && b.expires_at) return a.expires_at - b.expires_at;
			if (a.expires_at && !b.expires_at) return -1;
			if (!a.expires_at && b.expires_at) return 1;
			return 0;
		});

	const ONE_DAY_S = 24 * 60 * 60;
	const ONE_HOUR_S = 60 * 60;

	const preparedLock = lock
		? {
				...lock,
				hashed_key: lock.hashed_key ?? Bun.hash(lock.lock_id!).toString(),
				redis_receipt_key: buildLockReceiptKey({
					orgId: org.id,
					env,
					lockKey: lock.hashed_key ?? Bun.hash(lock.lock_id!).toString(),
				}),
				created_at: Date.now(),
				ttl_at: lock.expires_at
					? Math.ceil(lock.expires_at / 1000) + ONE_HOUR_S
					: Math.ceil(Date.now() / 1000) + ONE_DAY_S,
			}
		: undefined;

	return {
		customerEntitlements: cusEnts,
		customerEntitlementDeductions,
		spendLimitByFeatureId:
			Object.keys(spendLimitByFeatureId).length > 0
				? spendLimitByFeatureId
				: undefined,
		usageBasedCusEntIdsByFeatureId:
			Object.keys(usageBasedCusEntIdsByFeatureId).length > 0
				? usageBasedCusEntIdsByFeatureId
				: undefined,
		rollovers: sortedRollovers.map((r) => ({
			id: r.id,
			credit_cost: r.credit_cost,
			...(r.rate_card ? { rate_card: r.rate_card } : {}),
		})),
		lock: preparedLock,
	};
};
