import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { pooledBalancesRepo } from "./repos/pooledBalancesRepo";

export const hydrateFullCustomerPooledBalances = async ({
	ctx,
	fullCustomer,
	internalEntityId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	/** Null selects customer-level sources; a string selects one entity. */
	internalEntityId: string | null | undefined;
}): Promise<void> => {
	const [pooledCustomerEntitlements, contributions] = await Promise.all([
		pooledBalancesRepo.listPooledCustomerEntitlements({
			db: ctx.db,
			internalCustomerId: fullCustomer.internal_id,
		}),
		pooledBalancesRepo.listScopedPooledBalanceContributions({
			db: ctx.db,
			internalCustomerId: fullCustomer.internal_id,
			internalEntityId,
		}),
	]);

	const contributionByCustomerEntitlementId = new Map(
		contributions.map((contribution) => [
			contribution.source_customer_entitlement_id,
			contribution,
		]),
	);

	for (const customerProduct of fullCustomer.customer_products) {
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			customerEntitlement.pooled_balance_contribution =
				contributionByCustomerEntitlementId.get(customerEntitlement.id);
		}
	}

	fullCustomer.pooled_customer_entitlements = pooledCustomerEntitlements;
};
