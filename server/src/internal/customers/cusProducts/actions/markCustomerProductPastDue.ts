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
 * Marks a customer product as past due (billing issue).
 *
 * This action:
 * 1. Sets status to PastDue on the customer product
 * 2. Sends products_updated webhook with PastDue scenario
 * 3. Updates the FullCustomer in memory
 *
 * Used by RevenueCat billing issue webhooks and any external billing issue flow.
 */
export const markCustomerProductPastDue = async ({
	ctx,
	customerProduct,
	fullCustomer,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): Promise<{ updates: Partial<InsertCustomerProduct> }> => {
	const { org, env } = ctx;

	// 1. Mark as past due
	const updates: Partial<InsertCustomerProduct> = {
		status: CusProductStatus.PastDue,
	};

	await CusProductService.update({
		ctx,
		cusProductId: customerProduct.id,
		updates,
	});

	ctx.logger.debug(
		`[markCustomerProductPastDue]: marking ${customerProduct.product.name} as past due`,
	);

	// 2. Send webhook
	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.PastDue,
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
