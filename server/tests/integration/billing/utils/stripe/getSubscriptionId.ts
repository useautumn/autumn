import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

export const getSubscriptionId = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: AutumnContext;
	customerId: string;
	productId: string;
}): Promise<string> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const customerProduct = fullCustomer.customer_products.find(
		(cp) => cp.product.id === productId,
	);

	if (!customerProduct?.subscription_ids?.length) {
		throw new Error(`No subscription found for product ${productId}`);
	}

	return customerProduct.subscription_ids[0];
};

export const getEntitySubscriptionId = async ({
	ctx,
	customerId,
	entityId,
	productId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	productId: string;
}): Promise<string> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const customerProduct = fullCustomer.customer_products.find(
		(cp) => cp.product.id === productId && cp.entity_id === entityId,
	);

	if (!customerProduct?.subscription_ids?.length) {
		throw new Error(
			`No subscription found for product ${productId} on entity ${entityId}`,
		);
	}

	return customerProduct.subscription_ids[0];
};
