import {
	CusProductStatus,
	cp,
	type FullCusProduct,
	type FullCustomer,
	findMainActiveCustomerProductByGroup,
	findMainScheduledCustomerProductByGroup,
	isCustomerProductFree,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { activateFreeDefaultProduct } from "@/internal/customers/cusProducts/actions/activateFreeDefaultProduct";
import { activateScheduledCustomerProduct } from "./activateScheduled";

/**
 * Activates a free successor product after a customer product is expired.
 *
 * Priority:
 * 1. Free scheduled customer product in the same group → activate it (UPDATE)
 * 2. Default product in the same group → create and activate it (INSERT)
 *
 * Guardrails (skips activation if):
 * - Customer product is an add-on
 * - Customer product is one-off
 *
 * @returns activatedCustomerProduct if a scheduled product was activated (UPDATE),
 *          or insertedCustomerProduct if a new default product was created (INSERT)
 */
export const activateFreeSuccessorProduct = async ({
	ctx,
	fromCustomerProduct,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fromCustomerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): Promise<{
	activatedCustomerProduct?: FullCusProduct;
	insertedCustomerProduct?: FullCusProduct;
}> => {
	const { logger } = ctx;

	// 1. If it's add on / one off, early return
	const { valid: isAddOnOrOneOff } = cp(fromCustomerProduct).addOn().oneOff();
	if (isAddOnOrOneOff) {
		logger.debug(
			`[activateFreeSuccessor] Skipping - product is add-on or one-off: ${fromCustomerProduct.product.name}`,
		);
		return {};
	}

	// 2. Check if there's another active customer product in the same group
	const hasActiveInGroup = findMainActiveCustomerProductByGroup({
		fullCus: fullCustomer,
		productGroup: fromCustomerProduct.product.group,
		internalEntityId: fromCustomerProduct.internal_entity_id ?? undefined,
	});

	if (hasActiveInGroup) {
		logger.debug(
			`[activateFreeSuccessor] Skipping - another active customer product in group: ${hasActiveInGroup.product.name}`,
		);
		return {};
	}

	// 3. Activate free scheduled customer product if exists
	const productGroup = fromCustomerProduct.product.group;

	// 1. Try to find a free scheduled customer product in the same group
	const scheduledCustomerProduct = findMainScheduledCustomerProductByGroup({
		fullCustomer,
		productGroup,
		internalEntityId: fromCustomerProduct.internal_entity_id ?? undefined,
	});

	if (
		scheduledCustomerProduct &&
		isCustomerProductFree(scheduledCustomerProduct)
	) {
		await activateScheduledCustomerProduct({
			ctx,
			fromCustomerProduct,
			customerProduct: scheduledCustomerProduct,
			fullCustomer,
		});

		// Update fullCustomer in memory
		fullCustomer.customer_products = fullCustomer.customer_products.map((cp) =>
			cp.id === scheduledCustomerProduct.id
				? { ...cp, status: CusProductStatus.Active }
				: cp,
		);

		return { activatedCustomerProduct: scheduledCustomerProduct };
	}

	// 2. Fall back to default product (creates a new customer product)

	const newCustomerProduct = await activateFreeDefaultProduct({
		ctx,
		customerProduct: fromCustomerProduct,
		fullCustomer,
	});

	if (newCustomerProduct) {
		fullCustomer.customer_products = [
			...fullCustomer.customer_products,
			newCustomerProduct,
		];
	}

	return { insertedCustomerProduct: newCustomerProduct };
};
