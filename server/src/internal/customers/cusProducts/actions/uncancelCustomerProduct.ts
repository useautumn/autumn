import {
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { dispatchCustomerProductUpdatedWebhooks } from "@/internal/customers/cusProducts/actions/dispatchCustomerProductUpdatedWebhooks";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Uncancels a customer product (reverses a previous cancellation).
 *
 * This action:
 * 1. Clears canceled/canceled_at/ended_at and sets status back to Active
 * 2. Updates the FullCustomer in memory
 * 3. Sends products_updated + billing.updated webhooks
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
	const originalFullCustomer = structuredClone(fullCustomer);

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
		scenario: AttachScenario.Renew,
		updates,
	});

	return { updates };
};
