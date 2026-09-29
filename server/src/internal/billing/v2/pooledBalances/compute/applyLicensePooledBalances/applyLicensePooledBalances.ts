import {
	type CustomerLicenseTransition,
	EntInterval,
	type EntitlementWithFeature,
	entToPooledBalanceIdentity,
	type FullCusProduct,
	type FullCustomerLicense,
	getCycleEnd,
	getStartingBalance,
	isBooleanEntitlement,
	isUnlimitedEntitlement,
	PooledBalanceResetMode,
	pooledBalanceIdentityToKey,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addInsertedPooledBalanceToComputeContext } from "../context/pooledBalanceComputeContextUtils";
import type { PooledBalanceComputeContext } from "../types/pooledBalanceComputeTypes";
import { addToUpdatePoolBalances } from "../utils/pooledBalancePlanUtils";
import { resolvePooledBalanceResetCycleAnchor } from "../utils/resolvePooledBalanceResetCycleAnchor";
import { expireRemovedLicensePools } from "./expireRemovedLicensePools";
import { initLicensePooledBalanceGraph } from "./initLicensePooledBalanceGraph";
import { shouldResetLicensePooledUsage } from "./shouldResetLicensePooledUsage";

const licensePooledEntitlements = ({
	customerLicense,
}: {
	customerLicense: FullCustomerLicense;
}): EntitlementWithFeature[] =>
	(customerLicense.planLicense?.product.entitlements ?? []).filter(
		(entitlement) => entitlement.pooled === true,
	);

const perSeatGrant = ({
	entitlement,
}: {
	entitlement: EntitlementWithFeature;
}): number => {
	if (
		isBooleanEntitlement({ entitlement }) ||
		isUnlimitedEntitlement({ entitlement })
	) {
		return 0;
	}
	return getStartingBalance({ entitlement });
};

const licensePooledGranted = ({
	customerLicense,
	entitlement,
}: {
	customerLicense: FullCustomerLicense;
	entitlement: EntitlementWithFeature;
}): number =>
	new Decimal(customerLicense.granted)
		.mul(perSeatGrant({ entitlement }))
		.toNumber();

const findExistingLicensePool = ({
	computeContext,
	customerLicense,
	entitlement,
	resetMode,
}: {
	computeContext: PooledBalanceComputeContext;
	customerLicense: FullCustomerLicense;
	entitlement: EntitlementWithFeature;
	resetMode: PooledBalanceResetMode;
}) => {
	const entIdentity = entToPooledBalanceIdentity({ entitlement });
	return computeContext.pooledCustomerEntitlements.find(
		({ pooled_balance }) =>
			pooled_balance.internal_feature_id === entIdentity.internalFeatureId &&
			(pooled_balance.unlimited ?? false) === entIdentity.unlimited &&
			pooled_balance.interval === entIdentity.interval &&
			pooled_balance.interval_count === entIdentity.intervalCount &&
			pooled_balance.reset_mode === resetMode &&
			pooled_balance.stripe_subscription_id === null &&
			pooled_balance.customer_license_link_id === customerLicense.link_id &&
			pooled_balance.rollover_signature === entIdentity.rolloverSignature,
	);
};

const licensePooledIdentity = ({
	customerLicense,
	entitlement,
	existingResetCycleAnchor,
	parentBillingCycleAnchor,
	customerCreatedAt,
	now,
}: {
	customerLicense: FullCustomerLicense;
	entitlement: EntitlementWithFeature;
	existingResetCycleAnchor?: number | null;
	parentBillingCycleAnchor: number | null;
	customerCreatedAt: number;
	now: number;
}) => {
	const entIdentity = entToPooledBalanceIdentity({ entitlement });
	const resetMode =
		entIdentity.interval === EntInterval.Lifetime
			? PooledBalanceResetMode.Lifetime
			: PooledBalanceResetMode.Lazy;
	const hasNoCycle =
		resetMode === PooledBalanceResetMode.Lifetime ||
		isBooleanEntitlement({ entitlement }) ||
		isUnlimitedEntitlement({ entitlement });
	const resetCycleAnchor = hasNoCycle
		? null
		: resolvePooledBalanceResetCycleAnchor({
				existingResetCycleAnchor,
				anchorsToSource: parentBillingCycleAnchor !== null,
				sourceResetCycleAnchor: parentBillingCycleAnchor,
				customerCreatedAt,
			});
	const nextResetAt =
		resetCycleAnchor === null
			? null
			: getCycleEnd({
					anchor: resetCycleAnchor,
					interval: entIdentity.interval,
					intervalCount: entIdentity.intervalCount,
					now,
				});

	return {
		identity: {
			...entIdentity,
			resetCycleAnchor,
			resetMode,
			stripeSubscriptionId: null,
			customerLicenseLinkId: customerLicense.link_id,
		},
		nextResetAt,
	};
};

/** Creates, resizes (purchased seats × per-seat grant) and expires each
 * license link's pools. */
export const applyLicensePooledBalances = ({
	ctx,
	computeContext,
	customerLicenses,
	parentCustomerProducts,
	customerLicenseTransitions = [],
	customerCreatedAt,
	now,
}: {
	ctx: AutumnContext;
	computeContext: PooledBalanceComputeContext;
	customerLicenses: FullCustomerLicense[];
	parentCustomerProducts: FullCusProduct[];
	customerLicenseTransitions?: CustomerLicenseTransition[];
	customerCreatedAt: number;
	now: number;
}) => {
	const customerLicenseLinkIds = new Set<string>();
	const retainedPoolIds = new Set<string>();
	const transitionByLinkId = new Map(
		customerLicenseTransitions.map((transition) => [
			transition.updates.linkId,
			transition,
		]),
	);

	for (const customerLicense of customerLicenses) {
		if (!customerLicense.planLicense) continue;
		customerLicenseLinkIds.add(customerLicense.link_id);

		for (const entitlement of licensePooledEntitlements({ customerLicense })) {
			const targetGranted = licensePooledGranted({
				customerLicense,
				entitlement,
			});
			const existingByLink = findExistingLicensePool({
				computeContext,
				customerLicense,
				entitlement,
				resetMode:
					entToPooledBalanceIdentity({ entitlement }).interval ===
					EntInterval.Lifetime
						? PooledBalanceResetMode.Lifetime
						: PooledBalanceResetMode.Lazy,
			});
			const { identity, nextResetAt } = licensePooledIdentity({
				customerLicense,
				entitlement,
				existingResetCycleAnchor:
					existingByLink?.pooled_balance.reset_cycle_anchor,
				parentBillingCycleAnchor:
					parentCustomerProducts.find(
						(customerProduct) =>
							customerProduct.id === customerLicense.parent_customer_product_id,
					)?.billing_cycle_anchor ?? null,
				customerCreatedAt,
				now,
			});
			const existing =
				existingByLink ??
				computeContext.pooledCustomerEntitlementByIdentity.get(
					pooledBalanceIdentityToKey({ identity }),
				);

			if (!existing) {
				// Seats (bought or still assigned) need a pool, even at 0 grant.
				const hasSeats =
					customerLicense.granted > 0 ||
					customerLicense.remaining < customerLicense.granted;
				if (!hasSeats) continue;
				const inserted = initLicensePooledBalanceGraph({
					ctx,
					customerLicense,
					entitlement,
					identity,
					granted: targetGranted,
					nextResetAt,
					now,
				});
				addInsertedPooledBalanceToComputeContext({
					computeContext,
					pooledCustomerEntitlement: inserted,
				});
				retainedPoolIds.add(inserted.pooled_balance.id);
				continue;
			}

			retainedPoolIds.add(existing.pooled_balance.id);
			const resetsUsage = shouldResetLicensePooledUsage({
				transition: transitionByLinkId.get(customerLicense.link_id),
				entitlement,
			});
			const grantedDelta = new Decimal(targetGranted)
				.sub(existing.pooled_balance.granted)
				.toNumber();
			const nextBalance = resetsUsage
				? targetGranted
				: Math.max(
						0,
						new Decimal(existing.balance ?? 0).plus(grantedDelta).toNumber(),
					);
			const isUnchanged =
				grantedDelta === 0 && nextBalance === (existing.balance ?? 0);
			if (isUnchanged) continue;

			addToUpdatePoolBalances({
				pooledBalancePlan: computeContext.plan,
				pooledCustomerEntitlement: existing,
				balance: nextBalance,
				granted: targetGranted,
			});
		}
	}

	expireRemovedLicensePools({
		computeContext,
		customerLicenseLinkIds,
		retainedPoolIds,
		now,
	});
};
