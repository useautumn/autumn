import {
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	findMainActiveCustomerProductByGroup,
	type InsertCustomerProduct,
	isCustomerProductAddOn,
	isCustomerProductEntityScoped,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { activateDefaultProduct } from "@/internal/customers/cusProducts/cusProductUtils";

/**
 * Expires a customer product and activates the default product if needed.
 *
 * This action:
 * 1. Sets status to Expired
 * 2. Sends products_updated webhook with Expired scenario
 * 3. Activates default product if no other active product in group (skips for add-ons)
 *
 * @returns The updates applied to the customer product (for tracking)
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
	activatedDefault?: boolean;
}> => {
	const { db, org, env, logger } = ctx;

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

	ctx.logger.info(
		`IS ENTITY SCOPED: ${isCustomerProductEntityScoped(customerProduct)}`,
	);
	ctx.logger.info(`IS ADD ON: ${isCustomerProductAddOn(customerProduct)}`);

	// 3. Skip default activation for add-ons
	if (isCustomerProductAddOn(customerProduct)) return { updates };
	if (isCustomerProductEntityScoped(customerProduct)) return { updates };

	// 4. Check if there's another active product in the same group
	const hasActiveInGroup = findMainActiveCustomerProductByGroup({
		fullCus: fullCustomer,
		productGroup: customerProduct.product.group,
		internalEntityId: customerProduct.internal_entity_id ?? undefined,
	});

	let activatedDefault = false;
	if (!hasActiveInGroup) {
		logger.info(
			`No active product in group "${customerProduct.product.group}", activating default`,
		);

		activatedDefault = await activateDefaultProduct({
			ctx,
			productGroup: customerProduct.product.group,
			fullCus: fullCustomer,
			curCusProduct: customerProduct,
		});
	}

	return { updates, activatedDefault };
};
