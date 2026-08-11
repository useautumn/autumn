import {
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import {
	emitCustomerProductBillingUpdated,
	snapshotFullCustomer,
} from "@/internal/customers/cusProducts/actions/emitCustomerProductBillingUpdated";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Marks a customer product as active (e.g. recovering from past-due).
 *
 * This action:
 * 1. Sets status to Active on the customer product
 * 2. Sends billing.updated; products_updated is gated by sendWebhook (off by default)
 * 3. Updates the FullCustomer in memory
 *
 * Used by RevenueCat renewal webhooks (past-due → active recovery) and any
 * external active-recovery flow.
 */
export const markCustomerProductActive = async ({
	ctx,
	customerProduct,
	fullCustomer,
	sendWebhook = false,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	sendWebhook?: boolean;
}): Promise<{ updates: Partial<InsertCustomerProduct> }> => {
	const { org, env } = ctx;

	const originalFullCustomer = snapshotFullCustomer(fullCustomer);

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

	if (sendWebhook) {
		await addProductsUpdatedWebhookTask({
			ctx,
			internalCustomerId: customerProduct.internal_customer_id,
			org,
			env,
			customerId: fullCustomer.id || "",
			scenario: AttachScenario.Renew,
			cusProduct: customerProduct,
		});
	}

	fullCustomer.customer_products = fullCustomer.customer_products.map((cp) =>
		cp.id === customerProduct.id
			? ({ ...cp, ...updates } as FullCusProduct)
			: cp,
	);

	emitCustomerProductBillingUpdated({
		ctx,
		originalFullCustomer,
		updateCustomerProducts: [{ customerProduct, updates }],
	});

	return { updates };
};
