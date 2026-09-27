import {
	type CustomerLicenseTransition,
	EntInterval,
	entToPooledBalanceIdentity,
	findCustomerLicenseByLinkId,
	InternalError,
	isLicenseAssignableParentCustomerProduct,
	PooledBalanceResetMode,
	pooledBalanceIdentityToKey,
	pooledBalanceToPooledBalanceIdentity,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BatchTransitionContext } from "../types/types";

export const assertBatchTransitionTargets = ({
	ctx,
	transition,
	batchTransitionContext,
}: {
	ctx: AutumnContext;
	transition: CustomerLicenseTransition;
	batchTransitionContext: BatchTransitionContext;
}) => {
	const { fullCustomer, parentCustomerProduct, currentEpochMs } =
		batchTransitionContext;
	const { incomingCustomerLicense, updates } = transition;
	const currentCustomerLicense = findCustomerLicenseByLinkId({
		customerLicenses: parentCustomerProduct.customer_licenses ?? [],
		customerLicenseLinkId: updates.linkId,
	});
	const isCurrentDefinition =
		currentCustomerLicense !== undefined &&
		currentCustomerLicense?.id === incomingCustomerLicense.id &&
		currentCustomerLicense?.plan_license_id ===
			incomingCustomerLicense.plan_license_id;
	if (
		!isCurrentDefinition ||
		!isLicenseAssignableParentCustomerProduct({
			customerProduct: parentCustomerProduct,
		})
	) {
		throw new InternalError({
			message:
				"License batch transition no longer targets the current definition",
		});
	}

	const pooledCustomerEntitlementsByPoolId = new Map(
		(fullCustomer.pooled_customer_entitlements ?? []).map(
			(customerEntitlement) => [
				customerEntitlement.pooled_balance_id,
				customerEntitlement,
			],
		),
	);
	for (const entitlement of incomingCustomerLicense.planLicense?.product
		.entitlements ?? []) {
		if (!entitlement.pooled) continue;
		const pooledBalanceId = transition.pooledBalanceIds?.[entitlement.id];
		const customerEntitlement = pooledBalanceId
			? pooledCustomerEntitlementsByPoolId.get(pooledBalanceId)
			: undefined;
		const pooledBalance = customerEntitlement?.pooled_balance;
		if (
			!pooledBalance ||
			pooledBalance.internal_customer_id !== fullCustomer.internal_id ||
			pooledBalance.org_id !== ctx.org.id ||
			pooledBalance.env !== ctx.env ||
			(pooledBalance.expires_at !== null &&
				pooledBalance.expires_at <= currentEpochMs)
		) {
			throw new InternalError({
				message: "License batch transition requires a live prepared pool",
			});
		}
		const entitlementIdentity = entToPooledBalanceIdentity({ entitlement });
		const expectedIdentity = pooledBalanceIdentityToKey({
			identity: {
				...entitlementIdentity,
				resetCycleAnchor: pooledBalance.reset_cycle_anchor,
				resetMode:
					entitlementIdentity.interval === EntInterval.Lifetime
						? PooledBalanceResetMode.Lifetime
						: PooledBalanceResetMode.Lazy,
				stripeSubscriptionId: null,
				customerLicenseLinkId: updates.linkId,
			},
		});
		const actualIdentity = pooledBalanceIdentityToKey({
			identity: pooledBalanceToPooledBalanceIdentity({ pooledBalance }),
		});
		if (actualIdentity !== expectedIdentity) {
			throw new InternalError({
				message:
					"License batch transition pool does not match its target entitlement",
			});
		}
	}
};
