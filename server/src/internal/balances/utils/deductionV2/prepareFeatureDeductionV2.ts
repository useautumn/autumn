import {
	cusEntToStartingBalance,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	fullSubjectToOverageAllowedByFeatureId,
	fullSubjectToSpendLimitByFeatureId,
	fullSubjectToUsageBasedCusEntsByFeatureId,
	getMaxOverage,
	getRelevantFeatures,
	isAllocatedCustomerEntitlement,
	isFreeCustomerEntitlement,
	notNullish,
	orgToInStatuses,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";
import { getUnlimitedAndUsageAllowed } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import type {
	CustomerEntitlementDeduction,
	DeductionOptions,
	PreparedFeatureDeduction,
} from "../types/deductionTypes.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

/**
 * Prepares all the inputs needed to execute a deduction for a single feature.
 * Mirrors the legacy helper, but reads from FullSubject.
 */
export const prepareFeatureDeductionV2 = ({
	ctx,
	fullSubject,
	deduction,
	options = {},
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	deduction: FeatureDeduction;
	options?: DeductionOptions;
}): PreparedFeatureDeduction => {
	const { org, env } = ctx;
	const { feature, lock, targetBalance } = deduction;
	const { overageBehaviour = "cap", customerEntitlementFilters } = options;

	const relevantFeatures = notNullish(targetBalance)
		? [feature]
		: getRelevantFeatures({
				features: ctx.features,
				featureId: feature.id,
			});

	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: relevantFeatures.map((candidate) => candidate.id),
		reverseOrder: org.config?.reverse_deduction_order,
		inStatuses: orgToInStatuses({ org }),
		customerEntitlementFilters,
	});

	const unlimitedFeatureIds: string[] = [];

	for (const relevantFeature of relevantFeatures) {
		const { unlimited: featureUnlimited } = getUnlimitedAndUsageAllowed({
			cusEnts: customerEntitlements,
			internalFeatureId: relevantFeature.internal_id!,
		});

		if (featureUnlimited) {
			unlimitedFeatureIds.push(relevantFeature.id);
		}
	}

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

	const nativeUsageAllowedFeatureIds = new Set(
		customerEntitlements
			.filter((customerEntitlement) => customerEntitlement.usage_allowed)
			.map((customerEntitlement) => customerEntitlement.entitlement.feature.id),
	);

	const customerEntitlementDeductions: CustomerEntitlementDeduction[] =
		customerEntitlements.map((customerEntitlement) => {
			const creditCost = getCreditCost({
				featureId: feature.id,
				creditSystem: customerEntitlement.entitlement.feature,
			});

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
			const overageAllowedControl =
				overageAllowedByFeatureId[customerEntitlement.entitlement.feature.id];

			let effectiveUsageAllowed =
				customerEntitlement.usage_allowed || isFreeAllocatedUsageAllowed;

			if (
				overageAllowedControl?.enabled === true &&
				!nativeUsageAllowedFeatureIds.has(
					customerEntitlement.entitlement.feature.id,
				)
			) {
				effectiveUsageAllowed = true;
			} else if (overageAllowedControl?.enabled === false) {
				effectiveUsageAllowed = false;
			}

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

	const sortedRollovers = customerEntitlements
		.flatMap((customerEntitlement) => {
			const creditCost = getCreditCost({
				featureId: feature.id,
				creditSystem: customerEntitlement.entitlement.feature,
			});

			return (customerEntitlement.rollovers || []).map((rollover) => ({
				...rollover,
				credit_cost: creditCost,
			}));
		})
		.sort((left, right) => {
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
		rollovers: sortedRollovers.map((rollover) => ({
			id: rollover.id,
			credit_cost: rollover.credit_cost,
		})),
		unlimitedFeatureIds,
		lock: preparedLock,
	};
};
