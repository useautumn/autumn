import {
	AttachScenario,
	CusProductStatus,
	type CustomerProductUpdate,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { computeCustomerLicenseReleases } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseReleases";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { activateFreeSuccessorProduct } from "@/internal/customers/cusProducts/actions/activateFreeSuccessorProduct";

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
	updates: extraUpdates,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	updates?: Partial<InsertCustomerProduct>;
}): Promise<{
	updates: Partial<InsertCustomerProduct>;
	activatedCustomerProduct?: FullCusProduct;
	insertedCustomerProduct?: FullCusProduct;
}> => {
	const { org, env } = ctx;

	// 1. Expire the product
	const updates: Partial<InsertCustomerProduct> = {
		status: CusProductStatus.Expired,
		...extraUpdates,
	};

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId: fullCustomer.id || fullCustomer.internal_id,
			insertCustomerProducts: [],
			updateCustomerProducts: [
				{
					customerProduct,
					updates: updates as CustomerProductUpdate["updates"],
				},
			],
		},
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

	if (!activatedCustomerProduct && !insertedCustomerProduct) {
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: {
				customerId: fullCustomer.id || fullCustomer.internal_id,
				insertCustomerProducts: [],
				...computeCustomerLicenseReleases({
					outgoingCustomerProduct: customerProduct,
					releasedAt: Date.now(),
				}),
			},
		});
	}

	return { updates, activatedCustomerProduct, insertedCustomerProduct };
};
