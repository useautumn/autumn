import { expect } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

export const expectNoExpiredCustomerProducts = async ({
	ctx,
	customerId,
	productId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	productId?: string;
	entityId?: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});

	const customerProducts = fullCustomer.customer_products.filter(
		(customerProduct) =>
			(productId ? customerProduct.product_id === productId : true) &&
			(entityId ? customerProduct.entity_id === entityId : true),
	);
	const expiredCustomerProducts = customerProducts.filter(
		(customerProduct) => customerProduct.status === CusProductStatus.Expired,
	);

	expect(
		expiredCustomerProducts.map((customerProduct) => ({
			id: customerProduct.id,
			product_id: customerProduct.product_id,
			entity_id: customerProduct.entity_id,
			status: customerProduct.status,
		})),
	).toEqual([]);
};
