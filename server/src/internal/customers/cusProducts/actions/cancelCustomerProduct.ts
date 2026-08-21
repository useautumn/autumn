import {
	AttachScenario,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { dispatchCustomerProductUpdatedWebhooks } from "@/internal/customers/cusProducts/actions/dispatchCustomerProductUpdatedWebhooks";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Cancels a customer product (marks it as canceled with a future end date).
 *
 * This action:
 * 1. Sets canceled=true, canceled_at, and ended_at on the customer product
 * 2. Updates the FullCustomer in memory
 * 3. Sends products_updated + billing.updated webhooks
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
	const originalFullCustomer = structuredClone(fullCustomer);

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

	// 2. Update full customer in memory
	fullCustomer.customer_products = fullCustomer.customer_products.map((cp) =>
		cp.id === customerProduct.id
			? ({ ...cp, ...updates } as FullCusProduct)
			: cp,
	);

	// 3. Send webhooks
	await dispatchCustomerProductUpdatedWebhooks({
		ctx,
		customerProduct,
		fullCustomer,
		originalFullCustomer,
		scenario: AttachScenario.Cancel,
		updates,
	});

	return { updates };
};
