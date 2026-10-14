import {
	type FullCusProduct,
	type FullCustomer,
	findMainScheduledCustomerProductByGroup,
	isCustomerProductMain,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

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

	if (!isCustomerProductMain(customerProduct)) {
		return { deletedCustomerProduct: null };
	}

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
		ctx,
		cusProductId: scheduledCustomerProduct.id,
	});

	return { deletedCustomerProduct: scheduledCustomerProduct };
};
