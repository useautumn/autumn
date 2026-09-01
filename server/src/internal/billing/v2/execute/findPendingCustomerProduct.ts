import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

export const findPendingCustomerProduct = async ({
	ctx,
	customerId,
	productId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	productId?: string;
	entityId?: string;
}): Promise<FullCusProduct | undefined> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [CusProductStatus.Pending],
		withEntities: false,
		entityId,
	});

	return fullCustomer.customer_products.find(
		(customerProduct) => !productId || customerProduct.product.id === productId,
	);
};
