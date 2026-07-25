import {
	EntInterval,
	type FullCusProduct,
	type FullCustomerEntitlement,
	getCycleEnd,
	InternalError,
	isCustomerProductFree,
	isCustomerProductPaidRecurring,
	PooledBalanceResetMode,
} from "@autumn/shared";
import type {
	PooledBalanceComputeContext,
	PooledBalanceLifecycle,
} from "../types/pooledBalanceComputeTypes";
import { initCustomerEntitlementPooledIdentity } from "./initCustomerEntitlementPooledIdentity";

const getResetMode = ({
	customerProduct,
	interval,
}: {
	customerProduct: FullCusProduct;
	interval: EntInterval;
}) => {
	if (interval === EntInterval.Lifetime) {
		return PooledBalanceResetMode.Lifetime;
	}
	if (customerProduct.customer_license_link_id) {
		return PooledBalanceResetMode.Lazy;
	}
	if (isCustomerProductFree(customerProduct)) {
		return PooledBalanceResetMode.Lazy;
	}
	if (isCustomerProductPaidRecurring(customerProduct)) {
		return PooledBalanceResetMode.Subscription;
	}

	throw new InternalError({
		message: "Paid pooled entitlements must belong to a recurring product.",
	});
};

const findExistingPoolResetCycleAnchor = ({
	computeContext,
	customerEntitlement,
	resetMode,
	stripeSubscriptionId,
	customerLicenseLinkId,
}: {
	computeContext: PooledBalanceComputeContext;
	customerEntitlement: FullCustomerEntitlement;
	resetMode: PooledBalanceResetMode;
	stripeSubscriptionId: string | null;
	customerLicenseLinkId: string | null;
}) => {
	const sourceIdentity = initCustomerEntitlementPooledIdentity({
		customerEntitlement,
		lifecycle: {
			resetCycleAnchor: null,
			resetMode,
			stripeSubscriptionId,
			customerLicenseLinkId,
		},
	});

	return computeContext.pooledCustomerEntitlements.find(
		({ pooled_balance }) =>
			pooled_balance.internal_feature_id === sourceIdentity.internalFeatureId &&
			pooled_balance.interval === sourceIdentity.interval &&
			pooled_balance.interval_count === sourceIdentity.intervalCount &&
			pooled_balance.reset_mode === resetMode &&
			pooled_balance.stripe_subscription_id === stripeSubscriptionId &&
			pooled_balance.customer_license_link_id === customerLicenseLinkId &&
			pooled_balance.rollover_signature === sourceIdentity.rolloverSignature,
	)?.pooled_balance.reset_cycle_anchor;
};

const getPooledBalanceLifecycleIds = ({
	customerProduct,
	resetMode,
	stripeSubscriptionId,
}: {
	customerProduct: FullCusProduct;
	resetMode: PooledBalanceResetMode;
	stripeSubscriptionId?: string;
}): Pick<
	PooledBalanceLifecycle,
	"stripeSubscriptionId" | "customerLicenseLinkId"
> => {
	if (resetMode === PooledBalanceResetMode.Lifetime) {
		return {
			stripeSubscriptionId: null,
			customerLicenseLinkId: null,
		};
	}

	if (customerProduct.customer_license_link_id) {
		return {
			stripeSubscriptionId: null,
			customerLicenseLinkId: customerProduct.customer_license_link_id,
		};
	}

	if (resetMode === PooledBalanceResetMode.Subscription) {
		return {
			stripeSubscriptionId:
				stripeSubscriptionId ??
				customerProduct.subscription_ids?.[0] ??
				customerProduct.id,
			customerLicenseLinkId: null,
		};
	}

	return {
		stripeSubscriptionId: null,
		customerLicenseLinkId: null,
	};
};

const resolveResetCycleAnchor = ({
	computeContext,
	customerEntitlement,
	resetMode,
	stripeSubscriptionId,
	customerLicenseLinkId,
	customerCreatedAt,
}: {
	computeContext: PooledBalanceComputeContext;
	customerEntitlement: FullCustomerEntitlement;
	resetMode: PooledBalanceResetMode;
	stripeSubscriptionId: string | null;
	customerLicenseLinkId: string | null;
	customerCreatedAt: number;
}) => {
	if (resetMode === PooledBalanceResetMode.Lifetime) return null;
	const existingResetCycleAnchor = findExistingPoolResetCycleAnchor({
		computeContext,
		customerEntitlement,
		resetMode,
		stripeSubscriptionId,
		customerLicenseLinkId,
	});
	if (existingResetCycleAnchor !== undefined) {
		return existingResetCycleAnchor;
	}

	if (
		resetMode === PooledBalanceResetMode.Subscription ||
		customerLicenseLinkId
	) {
		return customerEntitlement.reset_cycle_anchor ?? null;
	}

	return customerCreatedAt;
};

export const computePooledBalanceLifecycle = ({
	computeContext,
	customerEntitlement,
	customerProduct,
	stripeSubscriptionId: existingStripeSubscriptionId,
	customerCreatedAt,
	now,
}: {
	computeContext: PooledBalanceComputeContext;
	customerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
	stripeSubscriptionId?: string;
	customerCreatedAt: number;
	now: number;
}): PooledBalanceLifecycle => {
	const interval =
		customerEntitlement.entitlement.interval ?? EntInterval.Lifetime;

	const resetMode = getResetMode({ customerProduct, interval });
	const { stripeSubscriptionId, customerLicenseLinkId } =
		getPooledBalanceLifecycleIds({
			customerProduct,
			resetMode,
			stripeSubscriptionId: existingStripeSubscriptionId,
		});
	const resetCycleAnchor = resolveResetCycleAnchor({
		computeContext,
		customerEntitlement,
		resetMode,
		stripeSubscriptionId,
		customerLicenseLinkId,
		customerCreatedAt,
	});

	if (
		resetMode !== PooledBalanceResetMode.Lifetime &&
		resetCycleAnchor === null
	) {
		throw new InternalError({
			message: `Pooled entitlement '${customerEntitlement.id}' is missing its reset cycle anchor.`,
		});
	}

	return {
		resetMode,
		resetCycleAnchor,
		stripeSubscriptionId,
		customerLicenseLinkId,
		nextResetAt:
			resetMode === PooledBalanceResetMode.Lifetime
				? null
				: getCycleEnd({
						anchor: resetCycleAnchor ?? "now",
						interval,
						intervalCount: customerEntitlement.entitlement.interval_count ?? 1,
						now,
					}),
	};
};
