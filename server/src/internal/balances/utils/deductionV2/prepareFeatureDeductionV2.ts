import {
	AllowanceType,
	cusEntToStartingBalance,
	deduplicateArray,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	fullSubjectToOverageAllowedByFeatureId,
	fullSubjectToSpendLimitByFeatureId,
	fullSubjectToUsageBasedCusEntsByFeatureId,
	getMaxOverage,
	InsufficientBalanceError,
	isThresholdBillingCustomerProduct,
	notNullish,
	orgToInStatuses,
	usageLimitFilterMatchesProperties,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resolveAllocationLuaGates } from "@/internal/balances/allocate/deduction/resolveAllocationLuaGate.js";
import { getCheckSubject } from "@/internal/balances/check/getCheckSubject.js";
import { buildLockReceiptKey } from "@/internal/balances/utils/lock/buildLockReceiptKey.js";
import { resolveUsageWindowLimits } from "@/internal/balances/utils/usageWindows/resolveUsageWindowLimits.js";
import { generateId } from "@/utils/genUtils.js";
import { computeCreditCosts } from "../deduction/computeCreditCosts.js";
import { resolveOverageAllowance } from "../deduction/resolveOverageAllowance.js";
import type {
	CustomerEntitlementDeduction,
	DeductionOptions,
	PreparedFeatureDeduction,
} from "../types/deductionTypes.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

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
	const hasPastDueProduct = fullSubject.customer_products.some(
		(customerProduct) =>
			customerProduct.status === "past_due" &&
			!customerProduct.product.config?.ignore_past_due &&
			isThresholdBillingCustomerProduct({ customerProduct }) &&
			customerProduct.customer_entitlements.some(
				(customerEntitlement) =>
					customerEntitlement.entitlement.feature.id === feature.id,
			),
	);
	const blockOverdueUsage =
		(deduction.enforceOverdueBlock && org.config.block_overdue_entitlements) ||
		hasPastDueProduct;
	if (blockOverdueUsage) {
		fullSubject = getCheckSubject({ ctx, fullSubject });
	}

	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		...(notNullish(targetBalance)
			? { featureIds: [feature.id] }
			: { fundsFeatureId: feature.id }),
		reverseOrder: org.config?.reverse_deduction_order,
		inStatuses: orgToInStatuses({ org }),
		customerEntitlementFilters,
	});
	const requiresEntitlement = blockOverdueUsage && deduction.deduction > 0;
	if (requiresEntitlement && customerEntitlements.length === 0) {
		throw new InsufficientBalanceError({
			featureId: feature.id,
			value: deduction.deduction,
		});
	}

	const isUnlimitedCusEnt = (ce: FullCusEntWithFullCusProduct): boolean =>
		ce.entitlement.allowance_type === AllowanceType.Unlimited ||
		Boolean(ce.unlimited);

	const hasUnlimitedCusEnt = customerEntitlements.some(isUnlimitedCusEnt);

	const effectiveFeatureIds = deduplicateArray([
		feature.id,
		...customerEntitlements.map(
			(customerEntitlement) => customerEntitlement.entitlement.feature.id,
		),
	]);
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
	const fundingEntitlements = notNullish(targetBalance)
		? fullSubjectToCustomerEntitlements({
				fullSubject,
				fundsFeatureId: feature.id,
				inStatuses: orgToInStatuses({ org }),
			})
		: customerEntitlements;
	const windowFeatureIds = deduplicateArray([
		feature.id,
		...fundingEntitlements.map(
			(customerEntitlement) => customerEntitlement.entitlement.feature.id,
		),
	]);
	const allUsageWindowLimits = resolveUsageWindowLimits({
		ctx,
		fullSubject,
		featureIds: windowFeatureIds,
	});

	const usageWindowLimits = hasUnlimitedCusEnt
		? []
		: allUsageWindowLimits.filter((windowLimit) =>
				usageLimitFilterMatchesProperties({
					filterProperties: windowLimit.filter_properties,
					eventProperties: options.eventProperties,
				}),
			);

	for (const windowLimit of usageWindowLimits) {
		windowLimit.new_window_id = generateId("uw");
		if (
			windowLimit.anchor_mode === "billing_cycle" &&
			windowLimit.anchor_customer_entitlement_id === null
		) {
			ctx.logger.warn(
				`usage window for feature ${windowLimit.feature_id} has no anchor entitlement; using calendar-aligned bounds with no provenance.`,
			);
		}
	}

	const nativeUsageAllowedFeatureIds = new Set(
		customerEntitlements
			.filter((customerEntitlement) => customerEntitlement.usage_allowed)
			.map((customerEntitlement) => customerEntitlement.entitlement.feature.id),
	);

	const getCreditCostForEnt = computeCreditCosts({
		cusEnts: customerEntitlements,
		deduction,
		catalogFeatures: ctx.features,
		eventProperties: options.eventProperties ?? undefined,
	});

	const customerEntitlementDeductions: CustomerEntitlementDeduction[] =
		customerEntitlements.map((customerEntitlement) => {
			const { creditCost, rateCard } = getCreditCostForEnt(
				customerEntitlement.id,
			);

			const maxOverage = getMaxOverage({
				cusEnt: customerEntitlement,
			});
			const resetBalance = cusEntToStartingBalance({
				cusEnt: customerEntitlement,
			});

			const isUnlimited = isUnlimitedCusEnt(customerEntitlement);

			const featureId = customerEntitlement.entitlement.feature.id;
			const { usageAllowed, overagePriority } = resolveOverageAllowance({
				customerEntitlement,
				overageBehaviour,
				overageAllowedControl: overageAllowedByFeatureId[featureId],
				featureHasNativeOverage: nativeUsageAllowedFeatureIds.has(featureId),
				unlimited: isUnlimited,
			});

			return {
				customer_entitlement_id: customerEntitlement.id,
				credit_cost: creditCost,
				...(rateCard ? { rate_card: rateCard } : {}),
				feature_id: customerEntitlement.entitlement.feature.id,
				entity_feature_id:
					customerEntitlement.entitlement.entity_feature_id ?? null,
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

	const rolloverArrays = customerEntitlements.map((customerEntitlement) => {
		const { creditCost, rateCard } = getCreditCostForEnt(
			customerEntitlement.id,
		);
		return (customerEntitlement.rollovers || []).map((rollover) => ({
			...rollover,
			credit_cost: creditCost,
			...(rateCard ? { rate_card: rateCard } : {}),
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
				properties: options.eventProperties ?? null,
				overage_behavior: overageBehaviour,
				ttl_at: lock.expires_at
					? Math.ceil(lock.expires_at / 1000) + oneHourSeconds
					: Math.ceil(Date.now() / 1000) + oneDaySeconds,
			}
		: undefined;

	const allocation = hasUnlimitedCusEnt
		? null
		: resolveAllocationLuaGates({
				fullSubject,
				customerEntitlements,
				now: ctx.timestamp,
			});
	const luaWindowLimits = [...usageWindowLimits, ...(allocation?.limits ?? [])];

	return {
		customerEntitlements,
		customerEntitlementDeductions,
		allocationGates: allocation?.gates,
		spendLimitByFeatureId:
			Object.keys(spendLimitByFeatureId).length > 0
				? spendLimitByFeatureId
				: undefined,
		usageBasedCusEntIdsByFeatureId:
			Object.keys(usageBasedCusEntIdsByFeatureId).length > 0
				? usageBasedCusEntIdsByFeatureId
				: undefined,
		usageWindowLimits: luaWindowLimits.length > 0 ? luaWindowLimits : undefined,
		usageWindowFeatureIds:
			luaWindowLimits.length > 0
				? [...new Set(luaWindowLimits.map((limit) => limit.feature_id))]
				: undefined,
		rollovers: sortedRollovers.map((rollover) => ({
			id: rollover.id,
			credit_cost: rollover.credit_cost,
			...(rollover.rate_card ? { rate_card: rollover.rate_card } : {}),
		})),
		lock: preparedLock,
	};
};
