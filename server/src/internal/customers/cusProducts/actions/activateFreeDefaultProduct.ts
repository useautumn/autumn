import {
	customerProductEligibleForDefaultProduct,
	enrichFullCustomerWithEntity,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
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

	// 3. Execute autumn billing plan
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId: fullCustomer?.id ?? "",
			insertCustomerProducts: [newCustomerProduct],
		},
	});

	return newCustomerProduct;
};
