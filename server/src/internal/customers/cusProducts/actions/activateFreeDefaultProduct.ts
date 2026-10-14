import {
	customerProductEligibleForDefaultProduct,
	enrichFullCustomerWithEntity,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { initFullCustomerProductFromProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromProduct";
import { productActions } from "@/internal/products/actions";

export const activateFreeDefaultProduct = async ({
	ctx,
	customerProduct,
	fullCustomer,
	defaultProduct,
	emitsBillingUpdated = false,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	defaultProduct?: FullProduct;
	emitsBillingUpdated?: boolean;
}): Promise<{
	insertedCustomerProduct?: FullCusProduct;
	allocationsAdjusted: boolean;
}> => {
	const { logger } = ctx;

	const eligibleForDefaultProduct = customerProductEligibleForDefaultProduct({
		ctx,
		customerProduct,
	});

	if (!eligibleForDefaultProduct) {
		logger.debug(
			`[activateFreeDefaultProduct] Skipping - product is not main recurring customer scoped: ${customerProduct.product.name}`,
		);
		return { allocationsAdjusted: false };
	}

	const freeDefaultProduct =
		defaultProduct ??
		(await productActions.getFreeDefaultByGroup({
			ctx,
			productGroup: customerProduct.product.group,
		}));

	if (!freeDefaultProduct) return { allocationsAdjusted: false };

	const newCustomerProduct = initFullCustomerProductFromProduct({
		ctx,
		initContext: {
			fullCustomer: enrichFullCustomerWithEntity({
				fullCustomer,
				internalEntityId: customerProduct.internal_entity_id ?? null,
			}),
			fullProduct: freeDefaultProduct,
			currentEpochMs: Date.now(),
			featureQuantities: [],

			existingUsagesConfig: {
				fromCustomerProduct: customerProduct,
			},

			existingRolloversConfig: {
				fromCustomerProduct: customerProduct,
			},
		},
	});

	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer,
		outgoingCustomerProducts: [customerProduct],
		incomingCustomerProducts: [newCustomerProduct],
		now: Date.now(),
	});

	const { allocationsAdjusted = false } = await executeAutumnBillingPlan({
		ctx,
		emitsBillingUpdated,
		autumnBillingPlan: {
			customerId: fullCustomer?.id ?? "",
			insertCustomerProducts: [newCustomerProduct],
			pooledBalancePlan,
		},
	});

	return { insertedCustomerProduct: newCustomerProduct, allocationsAdjusted };
};
