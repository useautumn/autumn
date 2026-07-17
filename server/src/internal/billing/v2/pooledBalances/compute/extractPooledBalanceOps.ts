import {
	AllowanceType,
	BillingType,
	cusEntsToUsage,
	cusEntToCusPrice,
	EntInterval,
	ErrCode,
	entToOptions,
	FeatureType,
	type FullCusProduct,
	getBillingType,
	getCycleEnd,
	getStartingBalance,
	type PooledBalanceOp,
	type PooledBalanceResetOwnerType,
	RecaseError,
} from "@autumn/shared";
import { isPooledSourceCustomerEntitlement } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";

const throwUnsupportedPooledEntitlement = ({
	message,
}: {
	message: string;
}): never => {
	throw new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

export const extractPooledBalanceOps = ({
	customerProduct,
	resetOwnerType,
	resetOwnerId,
	poolResetCycleAnchor,
	poolCycleNow,
	usageReapplySourceCustomerProduct,
}: {
	customerProduct: FullCusProduct;
	resetOwnerType: PooledBalanceResetOwnerType;
	resetOwnerId: string;
	poolResetCycleAnchor?: number;
	poolCycleNow?: number;
	usageReapplySourceCustomerProduct?: FullCusProduct;
}): {
	customerProduct: FullCusProduct;
	pooledBalanceOps: PooledBalanceOp[];
} => {
	const pooledCustomerEntitlements =
		customerProduct.customer_entitlements.filter(
			(customerEntitlement) => customerEntitlement.entitlement.pooled,
		);

	const pooledBalanceOps = pooledCustomerEntitlements.map(
		(customerEntitlement): PooledBalanceOp => {
			const { entitlement } = customerEntitlement;
			const customerEntitlementWithProduct = {
				...customerEntitlement,
				customer_product: customerProduct,
			};
			const usageToReapply = cusEntsToUsage({
				cusEnts: [customerEntitlementWithProduct],
			});
			const hasCarriableUsageSource =
				usageReapplySourceCustomerProduct?.customer_entitlements.some(
					(sourceCustomerEntitlement) =>
						!isPooledSourceCustomerEntitlement({
							customerEntitlement: sourceCustomerEntitlement,
							customerProduct: usageReapplySourceCustomerProduct,
						}) &&
						sourceCustomerEntitlement.internal_feature_id ===
							customerEntitlement.internal_feature_id,
				) ?? false;
			const usageReapplySourceCustomerProductId = hasCarriableUsageSource
				? usageReapplySourceCustomerProduct?.id
				: undefined;
			const relatedCustomerPrice = cusEntToCusPrice({
				cusEnt: customerEntitlementWithProduct,
			});

			if (
				entitlement.feature.type !== FeatureType.Metered ||
				entitlement.allowance_type !== AllowanceType.Fixed ||
				typeof entitlement.allowance !== "number" ||
				!Number.isFinite(entitlement.allowance) ||
				entitlement.allowance < 0 ||
				!entitlement.interval ||
				entitlement.entity_feature_id
			) {
				return throwUnsupportedPooledEntitlement({
					message: `Pooled feature '${entitlement.feature.id}' must be a finite metered entitlement without entity sub-balances.`,
				});
			}

			if (
				relatedCustomerPrice &&
				getBillingType(relatedCustomerPrice.price.config) !==
					BillingType.UsageInAdvance
			) {
				return throwUnsupportedPooledEntitlement({
					message: `Pooled priced feature '${entitlement.feature.id}' must use recurring prepaid billing; pooled overage attribution is not supported.`,
				});
			}

			const currentOptions = entToOptions({
				ent: entitlement,
				options: customerProduct.options,
			});
			const nextOptions = currentOptions
				? {
						...currentOptions,
						quantity:
							currentOptions.upcoming_quantity ?? currentOptions.quantity,
					}
				: undefined;
			const currentCycleContribution = getStartingBalance({
				entitlement,
				options: currentOptions,
				relatedPrice: relatedCustomerPrice?.price,
				productQuantity: customerProduct.quantity,
			});
			const nextCycleContribution = getStartingBalance({
				entitlement,
				options: nextOptions,
				relatedPrice: relatedCustomerPrice?.price,
				productQuantity: customerProduct.quantity,
			});
			if (
				!Number.isFinite(currentCycleContribution) ||
				currentCycleContribution < 0 ||
				!Number.isFinite(nextCycleContribution) ||
				nextCycleContribution < 0
			) {
				return throwUnsupportedPooledEntitlement({
					message: `Pooled feature '${entitlement.feature.id}' requires a finite, non-negative contribution grant.`,
				});
			}

			const intervalCount = entitlement.interval_count ?? 1;
			if (
				!Number.isFinite(intervalCount) ||
				!Number.isInteger(intervalCount) ||
				intervalCount <= 0
			) {
				return throwUnsupportedPooledEntitlement({
					message: `Pooled feature '${entitlement.feature.id}' requires a positive integer reset interval count.`,
				});
			}

			let resetCycleAnchor: number | null = null;
			let nextResetAt: number | null = null;
			if (entitlement.interval !== EntInterval.Lifetime) {
				resetCycleAnchor =
					poolResetCycleAnchor ??
					customerEntitlement.reset_cycle_anchor ??
					null;
				nextResetAt =
					poolResetCycleAnchor !== undefined && poolCycleNow !== undefined
						? getCycleEnd({
								anchor: poolResetCycleAnchor,
								interval: entitlement.interval,
								intervalCount,
								now: poolCycleNow,
							})
						: (customerEntitlement.next_reset_at ?? null);
				if (
					typeof resetCycleAnchor !== "number" ||
					!Number.isFinite(resetCycleAnchor) ||
					typeof nextResetAt !== "number" ||
					!Number.isFinite(nextResetAt)
				) {
					return throwUnsupportedPooledEntitlement({
						message: `Pooled feature '${entitlement.feature.id}' requires a reset anchor and next reset date.`,
					});
				}
			}

			return {
				op: "upsert_source",
				internalCustomerId: customerProduct.internal_customer_id,
				featureId: entitlement.feature.id,
				internalFeatureId: entitlement.internal_feature_id,
				interval: entitlement.interval,
				intervalCount,
				resetCycleAnchor,
				nextResetAt,
				rollover: entitlement.rollover ?? null,
				resetOwnerType,
				resetOwnerId,
				priceId: relatedCustomerPrice?.price.id ?? null,
				sourceCustomerProductId: customerProduct.id,
				sourceEntitlementId: entitlement.id,
				currentCycleContribution,
				nextCycleContribution,
				...(usageReapplySourceCustomerProductId && usageToReapply > 0
					? {
							usageReapply: {
								amount: usageToReapply,
								excludedSourceCustomerProductId:
									usageReapplySourceCustomerProductId,
							},
						}
					: {}),
			};
		},
	);

	const pooledCustomerEntitlementIds = new Set(
		pooledCustomerEntitlements.map(
			(customerEntitlement) => customerEntitlement.id,
		),
	);

	return {
		customerProduct: {
			...customerProduct,
			customer_entitlements: customerProduct.customer_entitlements.map(
				(customerEntitlement) => {
					if (!pooledCustomerEntitlementIds.has(customerEntitlement.id)) {
						return customerEntitlement;
					}

					const pooledBalanceOperation = pooledBalanceOps.find(
						(
							operation,
						): operation is Extract<PooledBalanceOp, { op: "upsert_source" }> =>
							operation.op === "upsert_source" &&
							operation.sourceEntitlementId ===
								customerEntitlement.entitlement.id,
					);
					return {
						...customerEntitlement,
						balance: 0,
						adjustment: 0,
						additional_balance: 0,
						entities: null,
						reset_cycle_anchor: pooledBalanceOperation
							? pooledBalanceOperation.resetCycleAnchor
							: customerEntitlement.reset_cycle_anchor,
						next_reset_at: pooledBalanceOperation
							? pooledBalanceOperation.nextResetAt
							: customerEntitlement.next_reset_at,
					};
				},
			),
		},
		pooledBalanceOps,
	};
};
