import {
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Uncancels a customer product (reverses a previous cancellation).
 *
 * This action:
 * 1. Clears canceled/canceled_at/ended_at and sets status back to Active
 * 2. Sends products_updated webhook with Renew scenario
 * 3. Updates the FullCustomer in memory
 *
 * Used by RevenueCat uncancellation webhooks.
 */
export const uncancelCustomerProduct = async ({
	ctx,
	customerProduct,
	fullCustomer,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): Promise<{ updates: Partial<InsertCustomerProduct> }> => {
	const { org, env } = ctx;

	// 1. Uncancel the product
	const updates: Partial<InsertCustomerProduct> = {
		canceled_at: null,
		canceled: false,
		ended_at: null,
		status: CusProductStatus.Active,
	};

	await CusProductService.update({
		ctx,
		cusProductId: customerProduct.id,
		updates,
	});

	ctx.logger.debug(
		`[uncancelCustomerProduct]: uncanceling ${customerProduct.product.name}`,
	);

	// 2. Send webhook
	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.Renew,
		cusProduct: customerProduct,
	});

	// 3. Update full customer in memory
	fullCustomer.customer_products = fullCustomer.customer_products.map((cp) =>
		cp.id === customerProduct.id
			? ({ ...cp, ...updates } as FullCusProduct)
			: cp,
	);

	return { updates };
};
