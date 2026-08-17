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
 * Marks a customer product as active (e.g. recovering from past-due).
 *
 * This action:
 * 1. Sets status to Active on the customer product
 * 2. Updates the FullCustomer in memory
 * 3. Sends products_updated + billing.updated webhooks
 *
 * Used by RevenueCat renewal webhooks (past-due → active recovery) and any
 * external active-recovery flow.
 */
export const markCustomerProductActive = async ({
	ctx,
	customerProduct,
	fullCustomer,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
}): Promise<{ updates: Partial<InsertCustomerProduct> }> => {
	const originalFullCustomer = structuredClone(fullCustomer);

	const updates: Partial<InsertCustomerProduct> = {
		status: CusProductStatus.Active,
	};

	await CusProductService.update({
		ctx,
		cusProductId: customerProduct.id,
		updates,
	});

	ctx.logger.debug(
		`[markCustomerProductActive]: marking ${customerProduct.product.name} as active`,
	);

	fullCustomer.customer_products = fullCustomer.customer_products.map((cp) =>
		cp.id === customerProduct.id
			? ({ ...cp, ...updates } as FullCusProduct)
			: cp,
	);

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
