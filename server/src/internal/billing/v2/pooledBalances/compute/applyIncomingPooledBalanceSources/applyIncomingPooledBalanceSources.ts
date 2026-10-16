import {
	customerProductHasActiveStatus,
	type FullCusProduct,
	type FullCustomerEntitlement,
	isPooledBalanceSourceCustomerEntitlement,
	pooledBalanceToPooledBalanceIdentity,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerEntitlementCompetes } from "../competing/customerEntitlementCompetes";
import type { PooledBalanceComputeContext } from "../types/pooledBalanceComputeTypes";
import { addToInsertPoolContributions } from "../utils/pooledBalancePlanUtils";
import {
	addPaidCustomerProductToPool,
	isPaidSubscriptionPoolHost,
} from "../utils/subscriptionPoolHost";
import {
	addLimitedSourceToPool,
	findUnlimitedShareHost,
	isLimitedAdditiveSource,
} from "../utils/unlimitedPoolShare";
import { computePooledBalanceContributionAmounts } from "./computePooledBalanceContributionAmounts";
import { computePooledBalanceLifecycle } from "./computePooledBalanceLifecycle";
import { initCustomerEntitlementPooledIdentity } from "./initCustomerEntitlementPooledIdentity";
import { initPooledBalanceContribution } from "./initPooledBalanceContribution";
import { upsertPooledBalance } from "./upsertPooledBalance";

/** Pooled items, plus the grants a max / min feature pools so they can compete. */
const customerProductToPoolSources = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}) =>
	customerProduct.customer_entitlements.flatMap((customerEntitlement) => {
		const competes = customerEntitlementCompetes({
			customerEntitlement,
			customerProduct,
		});
		const pooled =
			competes ||
			isPooledBalanceSourceCustomerEntitlement({ customerEntitlement });
		return pooled ? [{ customerEntitlement, competes }] : [];
	});

/** The pool a source opens or joins on its own terms: its interval, reset mode and subscription. */
const sourcePooledBalanceIdentity = ({
	computeContext,
	customerEntitlement,
	customerProduct,
	stripeSubscriptionId,
	customerCreatedAt,
	competes,
	now,
}: {
	computeContext: PooledBalanceComputeContext;
	customerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
	stripeSubscriptionId?: string;
	customerCreatedAt: number;
	competes: boolean;
	now: number;
}) => {
	const lifecycle = computePooledBalanceLifecycle({
		computeContext,
		customerEntitlement,
		customerProduct,
		stripeSubscriptionId,
		customerCreatedAt,
		competes,
		now,
	});
	return {
		identity: initCustomerEntitlementPooledIdentity({
			customerEntitlement,
			lifecycle,
			competes,
		}),
		nextResetAt: lifecycle.nextResetAt,
	};
};

export const applyIncomingPooledBalanceSources = ({
	ctx,
	computeContext,
	customerProduct,
	stripeSubscriptionId,
	customerCreatedAt,
	now,
}: {
	ctx: AutumnContext;
	computeContext: PooledBalanceComputeContext;
	customerProduct: FullCusProduct;
	stripeSubscriptionId?: string;
	customerCreatedAt: number;
	now: number;
}) => {
	if (!customerProductHasActiveStatus(customerProduct)) {
		return;
	}

	for (const {
		customerEntitlement: contributionCustomerEntitlement,
		competes,
	} of customerProductToPoolSources({ customerProduct })) {
		// An unlimited additive grant rides a limited pool on that pool's identity and cycle.
		const unlimitedShareHost = competes
			? undefined
			: findUnlimitedShareHost({
					computeContext,
					customerEntitlement: contributionCustomerEntitlement,
					customerProduct,
					stripeSubscriptionId,
				});
		const { identity, nextResetAt } = unlimitedShareHost
			? {
					identity: pooledBalanceToPooledBalanceIdentity({
						pooledBalance: unlimitedShareHost.pooled_balance,
					}),
					nextResetAt: unlimitedShareHost.next_reset_at ?? null,
				}
			: sourcePooledBalanceIdentity({
					computeContext,
					customerEntitlement: contributionCustomerEntitlement,
					customerProduct,
					stripeSubscriptionId,
					customerCreatedAt,
					competes,
					now,
				});

		const contributionAmounts = computePooledBalanceContributionAmounts({
			contributionCustomerEntitlement,
			customerProduct,
		});

		const pooledCustomerEntitlement = upsertPooledBalance({
			ctx,
			computeContext,
			contributionCustomerEntitlement,
			customerProduct,
			identity,
			contributionAmounts,
			nextResetAt,
			competes,
			unlimitedShareHost,
			now,
		});
		if (isPaidSubscriptionPoolHost({ customerProduct })) {
			addPaidCustomerProductToPool({
				paidCustomerProductIdsByPoolId:
					computeContext.paidCustomerProductIdsByPoolId,
				poolId: pooledCustomerEntitlement.pooled_balance.id,
				customerProductId: customerProduct.id,
			});
		}
		if (
			isLimitedAdditiveSource({
				customerEntitlement: contributionCustomerEntitlement,
				competes,
			})
		) {
			addLimitedSourceToPool({
				computeContext,
				poolId: pooledCustomerEntitlement.pooled_balance.id,
				customerEntitlementId: contributionCustomerEntitlement.id,
			});
		}

		const contribution = initPooledBalanceContribution({
			pooledCustomerEntitlement,
			contributionCustomerEntitlement,
			customerProduct,
			contributionAmounts,
			competes,
			unlimitedShare: unlimitedShareHost !== undefined,
			now,
		});

		addToInsertPoolContributions({
			pooledBalancePlan: computeContext.plan,
			contribution,
		});
	}
};
