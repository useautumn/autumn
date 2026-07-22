import {
	customerProductEligibleForDefaultProduct,
	enrichFullCustomerWithEntity,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { computeAttachPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/computeAttachPooledBalanceOps.js";
import { initFullCustomerProductFromProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromProduct";
import { productActions } from "@/internal/products/actions";

export const activateFreeDefaultProduct = async ({
	ctx,
	customerProduct,
	fullCustomer,
	defaultProduct,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	defaultProduct?: FullProduct;
}): Promise<FullCusProduct | undefined> => {
	const { logger } = ctx;

	// customerProduct eligible for default product
	const eligibleForDefaultProduct = customerProductEligibleForDefaultProduct({
		ctx,
		customerProduct,
	});

	if (!eligibleForDefaultProduct) {
		logger.debug(
			`[activateFreeDefaultProduct] Skipping - product is not main recurring customer scoped: ${customerProduct.product.name}`,
		);
		return undefined;
	}

	// 1. Get free default product for group
	const freeDefaultProduct =
		defaultProduct ??
		(await productActions.getFreeDefaultByGroup({
			ctx,
			productGroup: customerProduct.product.group,
		}));

	if (!freeDefaultProduct) return;

	// 2. Initialise customer product
	const currentEpochMs = Date.now();
	const fullCustomerForEntity = enrichFullCustomerWithEntity({
		fullCustomer,
		internalEntityId: customerProduct.internal_entity_id ?? null,
	});
	const newCustomerProduct = initFullCustomerProductFromProduct({
		ctx,
		initContext: {
			fullCustomer: fullCustomerForEntity,
			fullProduct: freeDefaultProduct,
			currentEpochMs,
			featureQuantities: [],

			existingUsagesConfig: {
				fromCustomerProduct: customerProduct,
			},

			existingRolloversConfig: {
				fromCustomerProduct: customerProduct,
			},
		},
	});
	const prepared = computeAttachPooledBalanceOps({
		customerProduct: newCustomerProduct,
		attachBillingContext: {
			billingStartsAt: currentEpochMs,
			currentEpochMs,
			fullCustomer: fullCustomerForEntity,
			planTiming: "immediate",
			requestedBillingCycleAnchor: undefined,
			skipBillingChanges: true,
		},
		removeCurrentSource: false,
	});

	// 3. Execute autumn billing plan
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId: fullCustomer.id ?? fullCustomer.internal_id,
			insertCustomerProducts: [prepared.customerProduct],
			pooledBalanceOps: prepared.pooledBalanceOps,
		},
	});

	return prepared.customerProduct;
};
