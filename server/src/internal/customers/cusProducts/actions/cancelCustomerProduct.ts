import {
	AttachScenario,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Cancels a customer product (marks it as canceled with a future end date).
 *
 * This action:
 * 1. Sets canceled=true, canceled_at, and ended_at on the customer product
 * 2. Sends products_updated webhook with Cancel scenario
 * 3. Updates the FullCustomer in memory
 *
 * Used by RevenueCat cancellation webhooks and any external cancellation flow.
 */
export const cancelCustomerProduct = async ({
	ctx,
	customerProduct,
	fullCustomer,
	endedAt,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	endedAt?: number | null;
}): Promise<{ updates: Partial<InsertCustomerProduct> }> => {
	const { org, env } = ctx;

	// 1. Cancel the product
	const updates: Partial<InsertCustomerProduct> = {
		canceled_at: Date.now(),
		canceled: true,
		ended_at: endedAt ?? undefined,
	};

	await CusProductService.update({
		ctx,
		cusProductId: customerProduct.id,
		updates,
	});

	ctx.logger.debug(
		`[cancelCustomerProduct]: canceling ${customerProduct.product.name}`,
	);

	// 2. Send webhook
	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.Cancel,
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
