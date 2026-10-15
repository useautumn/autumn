import {
	customerProductHasActiveStatus,
	type FullCusProduct,
	isPooledBalanceSourceCustomerEntitlement,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerEntitlementCompetes } from "../competing/customerEntitlementCompetes";
import type { PooledBalanceComputeContext } from "../types/pooledBalanceComputeTypes";
import { addToInsertPoolContributions } from "../utils/pooledBalancePlanUtils";
import {
	addPaidCustomerProductToPool,
	isPaidSubscriptionPoolHost,
} from "../utils/subscriptionPoolHost";
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
		const lifecycle = computePooledBalanceLifecycle({
			computeContext,
			customerEntitlement: contributionCustomerEntitlement,
			customerProduct,
			stripeSubscriptionId,
			customerCreatedAt,
			competes,
			now,
		});

		const identity = initCustomerEntitlementPooledIdentity({
			customerEntitlement: contributionCustomerEntitlement,
			lifecycle,
			competes,
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
			nextResetAt: lifecycle.nextResetAt,
			competes,
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

		const contribution = initPooledBalanceContribution({
			pooledCustomerEntitlement,
			contributionCustomerEntitlement,
			customerProduct,
			contributionAmounts,
			competes,
			now,
		});

		addToInsertPoolContributions({
			pooledBalancePlan: computeContext.plan,
			contribution,
		});
	}
};
