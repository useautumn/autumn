import {
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { activateFreeSuccessorProduct } from "@/internal/customers/cusProducts/actions/activateFreeSuccessorProduct";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Expires a customer product and activates the default product if needed.
 *
 * This action:
 * 1. Sets status to Expired
 * 2. Sends products_updated webhook with Expired scenario
 * 3. Activates free successor (scheduled or default) if no other active product in group
 *
 * @returns updates - The updates applied to the expired customer product
 * @returns activatedCustomerProduct - If a scheduled product was activated (UPDATE)
 * @returns insertedCustomerProduct - If a new default product was created (INSERT)
 */
export const expireCustomerProductAndActivateDefault = async ({
	ctx,
	customerProduct,
	fullCustomer,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): Promise<{
	updates: Partial<InsertCustomerProduct>;
	activatedCustomerProduct?: FullCusProduct;
	insertedCustomerProduct?: FullCusProduct;
}> => {
	const { db, org, env } = ctx;

	// 1. Expire the product
	const updates: Partial<InsertCustomerProduct> = {
		status: CusProductStatus.Expired,
	};

	await CusProductService.update({
		db,
		cusProductId: customerProduct.id,
		updates,
	});

	ctx.logger.debug(
		`[expireCustomerProduct]: expiring ${customerProduct.product.name}`,
	);

	// 2. Send webhook
	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.Expired,
		cusProduct: customerProduct,
	});

	// Update full customer
	fullCustomer.customer_products = fullCustomer.customer_products.map((cp) =>
		cp.id === customerProduct.id
			? ({ ...cp, ...updates } as FullCusProduct)
			: cp,
	);

	// 3. Activate free successor (scheduled or default)
	const { activatedCustomerProduct, insertedCustomerProduct } =
		await activateFreeSuccessorProduct({
			ctx,
			fromCustomerProduct: customerProduct,
			fullCustomer,
		});

	return { updates, activatedCustomerProduct, insertedCustomerProduct };
};
