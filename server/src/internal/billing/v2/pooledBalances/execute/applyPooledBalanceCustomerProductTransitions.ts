import {
	type FullCusProduct,
	type FullCustomer,
	findCustomerProductById,
	PooledBalanceResetMode,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { computePooledBalanceTransitionPlan } from "../compute/computePooledBalanceTransitionPlan";
import { executePooledBalancePlan } from "./executePooledBalancePlan";
import { resetPooledBalances } from "./resetPooledBalances";

export const applyPooledBalanceCustomerProductTransitions = async ({
	ctx,
	fullCustomer,
	outgoingCustomerProducts,
	incomingCustomerProducts,
	now,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	outgoingCustomerProducts: FullCusProduct[];
	incomingCustomerProducts: FullCusProduct[];
	now: number;
}): Promise<void> => {
	const customerId = fullCustomer.id || fullCustomer.internal_id;
	const refreshedBeforeReset = await refreshFullCustomer({
		ctx,
		customerId,
		source: "pooled-balance-lifecycle-before-reset",
	});
	const duePooledCustomerEntitlements = (
		refreshedBeforeReset.pooled_customer_entitlements ?? []
	).filter(
		(customerEntitlement) =>
			customerEntitlement.pooled_balance?.reset_mode ===
				PooledBalanceResetMode.Subscription &&
			customerEntitlement.next_reset_at !== null &&
			customerEntitlement.next_reset_at <= now,
	);
	await resetPooledBalances({
		ctx,
		fullCustomer: refreshedBeforeReset,
		pooledCustomerEntitlements: duePooledCustomerEntitlements,
		source: "pooled-balance-lifecycle-reset",
	});
	const refreshedFullCustomer = await refreshFullCustomer({
		ctx,
		customerId,
		source: "pooled-balance-lifecycle-after-reset",
	});
	const refreshedOutgoingCustomerProducts = refreshCustomerProducts({
		fullCustomer: refreshedFullCustomer,
		customerProducts: outgoingCustomerProducts,
	});
	const refreshedIncomingCustomerProducts = refreshCustomerProducts({
		fullCustomer: refreshedFullCustomer,
		customerProducts: incomingCustomerProducts,
	});
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer: refreshedFullCustomer,
		outgoingCustomerProducts: refreshedOutgoingCustomerProducts,
		incomingCustomerProducts: refreshedIncomingCustomerProducts,
		now,
	});
	if (!pooledBalancePlan) return;

	await executePooledBalancePlan({ ctx, pooledBalancePlan });
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "pooled-balance-lifecycle-transition",
	});
};

const refreshFullCustomer = async ({
	ctx,
	customerId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	source: string;
}) => {
	await deleteCachedFullCustomer({ ctx, customerId, source });
	return CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
		withSubs: true,
		skipReset: true,
	});
};

const refreshCustomerProducts = ({
	fullCustomer,
	customerProducts,
}: {
	fullCustomer: FullCustomer;
	customerProducts: FullCusProduct[];
}) =>
	customerProducts.map(
		(customerProduct) =>
			findCustomerProductById({
				fullCustomer,
				customerProductId: customerProduct.id,
			}) ?? customerProduct,
	);
