import {
	EntInterval,
	type EntitlementWithFeature,
	entToPooledBalanceIdentity,
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
import { initLicensePooledBalanceGraph } from "./initLicensePooledBalanceGraph";

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
	now,
}: {
	customerLicense: FullCustomerLicense;
	entitlement: EntitlementWithFeature;
	existingResetCycleAnchor?: number | null;
	now: number;
}) => {
	const entIdentity = entToPooledBalanceIdentity({ entitlement });
	const resetMode =
		entIdentity.interval === EntInterval.Lifetime
			? PooledBalanceResetMode.Lifetime
			: PooledBalanceResetMode.Lazy;
	const resetCycleAnchor =
		resetMode === PooledBalanceResetMode.Lifetime
			? null
			: (existingResetCycleAnchor ?? now);
	const nextResetAt =
		resetMode === PooledBalanceResetMode.Lifetime
			? null
			: getCycleEnd({
					anchor: existingResetCycleAnchor ?? now,
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

/** Sets license-keyed pool.granted to purchased seats × per-seat G. */
export const applyLicensePooledGranted = ({
	ctx,
	computeContext,
	customerLicenses,
	now,
}: {
	ctx: AutumnContext;
	computeContext: PooledBalanceComputeContext;
	customerLicenses: FullCustomerLicense[];
	now: number;
}) => {
	for (const customerLicense of customerLicenses) {
		if (!customerLicense.planLicense) continue;

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
				now,
			});
			const existing =
				existingByLink ??
				computeContext.pooledCustomerEntitlementByIdentity.get(
					pooledBalanceIdentityToKey({ identity }),
				);

			if (!existing) {
				if (targetGranted <= 0) continue;
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
				continue;
			}

			if (existing.pooled_balance.granted === targetGranted) continue;

			const grantedDelta = new Decimal(targetGranted)
				.sub(existing.pooled_balance.granted)
				.toNumber();
			const nextBalance = Math.max(
				0,
				new Decimal(existing.balance ?? 0).plus(grantedDelta).toNumber(),
			);

			addToUpdatePoolBalances({
				pooledBalancePlan: computeContext.plan,
				pooledCustomerEntitlement: existing,
				balance: nextBalance,
				granted: targetGranted,
			});
		}
	}
};
