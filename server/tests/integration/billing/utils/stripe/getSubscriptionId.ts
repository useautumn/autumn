import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

/**
 * Helper to get subscription ID for a customer product.
 */
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
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const customerProduct = fullCustomer.customer_products.find(
		(cp) => cp.product.id === productId,
	);

	if (!customerProduct?.subscription_ids?.length) {
		throw new Error(`No subscription found for product ${productId}`);
	}

	return customerProduct.subscription_ids[0];
};

/**
 * Helper to get subscription ID for an entity's customer product.
 */
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
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
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
