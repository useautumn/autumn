import {
	type FullCusProduct,
	type FullCustomer,
	findMainScheduledCustomerProductByGroup,
	isCustomerProductMain,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Deletes any scheduled main customer product in the same group.
 *
 * When a main product is expired/deleted, any scheduled main product in the same group
 * should also be deleted since it was scheduled to replace the now-gone product.
 *
 * @returns The deleted customer product, or null if none was deleted
 */
export const deleteScheduledCustomerProduct = async ({
	ctx,
	customerProduct,
	fullCustomer,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): Promise<{ deletedCustomerProduct: FullCusProduct | null }> => {
	const { db, logger } = ctx;

	// Only applies to main products
	if (!isCustomerProductMain(customerProduct)) {
		return { deletedCustomerProduct: null };
	}

	// Find scheduled main product in the same group
	const scheduledCustomerProduct = findMainScheduledCustomerProductByGroup({
		fullCustomer,
		productGroup: customerProduct.product.group,
		internalEntityId: customerProduct.internal_entity_id ?? undefined,
	});

	if (!scheduledCustomerProduct) {
		return { deletedCustomerProduct: null };
	}

	logger.info(
		`Deleting scheduled product: ${scheduledCustomerProduct.product.name}${scheduledCustomerProduct.entity_id ? `@${scheduledCustomerProduct.entity_id}` : ""}`,
	);

	await CusProductService.delete({
		db,
		cusProductId: scheduledCustomerProduct.id,
	});

	return { deletedCustomerProduct: scheduledCustomerProduct };
};
