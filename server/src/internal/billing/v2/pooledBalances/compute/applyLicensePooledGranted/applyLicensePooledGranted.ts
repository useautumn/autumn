import {
	type CustomerLicenseTransition,
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
import { shouldCarryOverUsage } from "@/internal/billing/v2/utils/handleCarryOvers/shouldCarryOverUsage";
import { addInsertedPooledBalanceToComputeContext } from "../context/pooledBalanceComputeContextUtils";
import type { PooledBalanceComputeContext } from "../types/pooledBalanceComputeTypes";
import { addToUpdatePoolBalances } from "../utils/pooledBalancePlanUtils";
import { expireRemovedLicensePools } from "./expireRemovedLicensePools";
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
		resetMode === PooledBalanceResetMode.Lifetime ||
		isBooleanEntitlement({ entitlement }) ||
		isUnlimitedEntitlement({ entitlement })
			? null
			: (existingResetCycleAnchor ?? now);
	const nextResetAt =
		resetCycleAnchor === null
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
	outgoingCustomerLicenses = [],
	customerLicenseTransitions = [],
	now,
}: {
	ctx: AutumnContext;
	computeContext: PooledBalanceComputeContext;
	customerLicenses: FullCustomerLicense[];
	outgoingCustomerLicenses?: FullCustomerLicense[];
	customerLicenseTransitions?: CustomerLicenseTransition[];
	now: number;
}): Record<string, Record<string, string>> => {
	const customerLicenseLinkIds = new Set(
		outgoingCustomerLicenses.map((customerLicense) => customerLicense.link_id),
	);
	const retainedPoolIds = new Set<string>();
	const pooledBalanceIds: Record<string, Record<string, string>> = {};
	const transitionsByLinkId = new Map(
		customerLicenseTransitions.map((transition) => [
			transition.updates.linkId,
			transition,
		]),
	);

	for (const customerLicense of customerLicenses) {
		if (!customerLicense.planLicense) continue;
		customerLicenseLinkIds.add(customerLicense.link_id);
		const licensePoolIds: Record<string, string> = {};
		pooledBalanceIds[customerLicense.link_id] = licensePoolIds;
		const transition = transitionsByLinkId.get(customerLicense.link_id);
		const changesLicenseDefinition =
			transition !== undefined &&
			(transition.outgoingCustomerLicense.id !==
				transition.incomingCustomerLicense.id ||
				transition.outgoingCustomerLicense.plan_license_id !==
					transition.incomingCustomerLicense.plan_license_id);

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
				if (customerLicense.granted <= 0 && !transition) continue;
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
				licensePoolIds[entitlement.id] = inserted.pooled_balance.id;
				continue;
			}

			retainedPoolIds.add(existing.pooled_balance.id);
			licensePoolIds[entitlement.id] = existing.pooled_balance.id;

			const grantedDelta = new Decimal(targetGranted)
				.sub(existing.pooled_balance.granted)
				.toNumber();
			const resetsUsage =
				changesLicenseDefinition &&
				!shouldCarryOverUsage({
					toEntitlement: entitlement,
					carryOverUsages: transition?.carryOverUsages,
				});
			const nextBalance = resetsUsage
				? targetGranted
				: Math.max(
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

	expireRemovedLicensePools({
		computeContext,
		customerLicenseLinkIds,
		retainedPoolIds,
		now,
	});
	return pooledBalanceIds;
};
