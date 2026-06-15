import {
	AllowanceType,
	cusEntToStartingBalance,
	ErrCode,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	fullSubjectToOverageAllowedByFeatureId,
	fullSubjectToSpendLimitByFeatureId,
	fullSubjectToUsageBasedCusEntsByFeatureId,
	fullSubjectToUsageWindowLimits,
	getMaxOverage,
	getRelevantFeatures,
	isAllocatedCustomerEntitlement,
	isFreeCustomerEntitlement,
	notNullish,
	orgToInStatuses,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";
import { getUnlimitedAndUsageAllowed } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { computeCreditCosts } from "../deduction/computeCreditCosts.js";
import { resolveEffectiveUsageAllowed } from "../resolveEffectiveUsageAllowed.js";
import type {
	CustomerEntitlementDeduction,
	DeductionOptions,
	PreparedFeatureDeduction,
} from "../types/deductionTypes.js";
import {
	type FeatureDeduction,
	getRelevantFeaturesForDeduction,
} from "../types/featureDeduction.js";

/**
 * Prepares all the inputs needed to execute a deduction for a single feature.
 * Mirrors the legacy helper, but reads from FullSubject.
 */
export const prepareFeatureDeductionV2 = ({
	ctx,
	fullSubject,
	deduction,
	options = {},
	now,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	deduction: FeatureDeduction;
	options?: DeductionOptions;
	// Single timestamp shared with the Lua param so the resolved window key and
	// the script agree on which window a boundary-crossing request lands in.
	now: number;
}): PreparedFeatureDeduction => {
	const { org, env } = ctx;
	const { feature, lock, targetBalance } = deduction;
	const { overageBehaviour = "cap", customerEntitlementFilters } = options;

	const relevantFeatures = getRelevantFeaturesForDeduction({
		features: ctx.features,
		deduction,
	});

	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: relevantFeatures.map((candidate) => candidate.id),
		reverseOrder: org.config?.reverse_deduction_order,
		inStatuses: orgToInStatuses({ org }),
		customerEntitlementFilters,
	});

	const unlimitedFeatureIds: string[] = [];
	// Track the chosen unlimited cusEnt so the deduction short-circuit can
	// still attribute the event to a plan. Prefer cusEnts whose feature
	// matches the tracked one (over credit-system parents); within that,
	// take the first match in the already-sorted customerEntitlements list.
	let unlimitedCusEntPrimary: FullCusEntWithFullCusProduct | undefined;
	let unlimitedCusEntFallback: FullCusEntWithFullCusProduct | undefined;
	const isUnlimitedCusEnt = (ce: FullCusEntWithFullCusProduct): boolean =>
		ce.entitlement.allowance_type === AllowanceType.Unlimited ||
		Boolean(ce.unlimited);

	for (const relevantFeature of relevantFeatures) {
		const { unlimited: featureUnlimited } = getUnlimitedAndUsageAllowed({
			cusEnts: customerEntitlements,
			internalFeatureId: relevantFeature.internal_id!,
		});

		if (featureUnlimited) {
			unlimitedFeatureIds.push(relevantFeature.id);
			const matchingCusEnt = customerEntitlements.find(
				(ce) =>
					ce.internal_feature_id === relevantFeature.internal_id &&
					isUnlimitedCusEnt(ce),
			);
			if (!matchingCusEnt) continue;
			if (relevantFeature.id === feature.id) {
				unlimitedCusEntPrimary ??= matchingCusEnt;
			} else {
				unlimitedCusEntFallback ??= matchingCusEnt;
			}
		}
	}

	const unlimitedCusEnt = unlimitedCusEntPrimary ?? unlimitedCusEntFallback;

	const effectiveFeatureIds = relevantFeatures.map((candidate) => candidate.id);
	const spendLimitByFeatureId = fullSubjectToSpendLimitByFeatureId({
		fullSubject,
		featureIds: effectiveFeatureIds,
	});
	const usageBasedCusEntIdsByFeatureId =
		fullSubjectToUsageBasedCusEntsByFeatureId({
			fullSubject,
			featureIds: effectiveFeatureIds,
		});
	const overageAllowedByFeatureId = fullSubjectToOverageAllowedByFeatureId({
		fullSubject,
		featureIds: effectiveFeatureIds,
	});
	// Resolve windows against the full relevant set (incl credit-system parents)
	// even under set_usage, so a parent-feature cap can't be bypassed by set_usage
	// on a member feature.
	const windowFeatureIds = notNullish(targetBalance)
		? getRelevantFeatures({
				features: ctx.features,
				featureId: feature.id,
			}).map((candidate) => candidate.id)
		: effectiveFeatureIds;
	const usageWindowLimits = fullSubjectToUsageWindowLimits({
		fullSubject,
		featureIds: windowFeatureIds,
		features: ctx.features,
		now,
		inStatuses: orgToInStatuses({ org }),
	});

	// Counters are customer-scoped: a null anchor only means calendar-aligned
	// bounds with no provenance, not an unenforceable cap.
	for (const windowLimit of usageWindowLimits) {
		windowLimit.new_window_id = generateId("uw");
		if (windowLimit.anchor_customer_entitlement_id === null) {
			ctx.logger.warn(
				`usage window for feature ${windowLimit.feature_id} has no anchor entitlement; using calendar-aligned bounds with no provenance.`,
			);
		}
	}
	// set_usage carries no window provenance, so it would silently bypass the hard
	// cap; reject it when the feature has an enforced usage window.
	if (notNullish(targetBalance) && usageWindowLimits.length > 0) {
		throw new RecaseError({
			message: `Cannot set usage for feature ${feature.id}: it has an active usage limit. Remove or adjust the limit, or record usage normally instead of using set_usage.`,
			code: ErrCode.SetUsageNotAllowedWithUsageLimit,
		});
	}

	const nativeUsageAllowedFeatureIds = new Set(
		customerEntitlements
			.filter((customerEntitlement) => customerEntitlement.usage_allowed)
			.map((customerEntitlement) => customerEntitlement.entitlement.feature.id),
	);

	const getCreditCostForEnt = computeCreditCosts({
		cusEnts: customerEntitlements,
		deduction,
	});

	const customerEntitlementDeductions: CustomerEntitlementDeduction[] =
		customerEntitlements.map((customerEntitlement) => {
			const creditCost = getCreditCostForEnt(customerEntitlement.id);

			const maxOverage = getMaxOverage({
				cusEnt: customerEntitlement,
			});
			const isFreeAllocated =
				isFreeCustomerEntitlement(customerEntitlement) &&
				isAllocatedCustomerEntitlement(customerEntitlement);
			const resetBalance = cusEntToStartingBalance({
				cusEnt: customerEntitlement,
			});
			const isFreeAllocatedUsageAllowed =
				isFreeAllocated && overageBehaviour !== "reject";
			const effectiveUsageAllowed = resolveEffectiveUsageAllowed({
				baseUsageAllowed:
					customerEntitlement.usage_allowed || isFreeAllocatedUsageAllowed,
				featureId: customerEntitlement.entitlement.feature.id,
				overageAllowedByFeatureId,
				nativeUsageAllowedFeatureIds,
			});

			return {
				customer_entitlement_id: customerEntitlement.id,
				credit_cost: creditCost,
				feature_id: customerEntitlement.entitlement.feature.id,
				entity_feature_id:
					customerEntitlement.entitlement.entity_feature_id ?? null,
				usage_allowed: effectiveUsageAllowed,
				min_balance: notNullish(maxOverage) ? -maxOverage : undefined,
				max_balance: resetBalance,
			};
		});

	const rolloverArrays = customerEntitlements.map((customerEntitlement) => {
		const creditCost = getCreditCostForEnt(customerEntitlement.id);
		return (customerEntitlement.rollovers || []).map((rollover) => ({
			...rollover,
			credit_cost: creditCost,
		}));
	});

	const sortedRollovers = rolloverArrays.flat().sort((left, right) => {
		if (left.expires_at && right.expires_at) {
			return left.expires_at - right.expires_at;
		}
		if (left.expires_at && !right.expires_at) return -1;
		if (!left.expires_at && right.expires_at) return 1;
		return 0;
	});

	const oneDaySeconds = 24 * 60 * 60;
	const oneHourSeconds = 60 * 60;

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
					? Math.ceil(lock.expires_at / 1000) + oneHourSeconds
					: Math.ceil(Date.now() / 1000) + oneDaySeconds,
			}
		: undefined;

	return {
		customerEntitlements,
		customerEntitlementDeductions,
		spendLimitByFeatureId:
			Object.keys(spendLimitByFeatureId).length > 0
				? spendLimitByFeatureId
				: undefined,
		usageBasedCusEntIdsByFeatureId:
			Object.keys(usageBasedCusEntIdsByFeatureId).length > 0
				? usageBasedCusEntIdsByFeatureId
				: undefined,
		usageWindowLimits:
			usageWindowLimits.length > 0 ? usageWindowLimits : undefined,
		usageWindowFeatureIds:
			usageWindowLimits.length > 0
				? [...new Set(usageWindowLimits.map((limit) => limit.feature_id))]
				: undefined,
		rollovers: sortedRollovers.map((rollover) => ({
			id: rollover.id,
			credit_cost: rollover.credit_cost,
		})),
		unlimitedFeatureIds,
		unlimitedCusEnt,
		lock: preparedLock,
	};
};
