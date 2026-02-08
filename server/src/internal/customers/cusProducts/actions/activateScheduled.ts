import {
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type InsertCustomerProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { reapplyExistingRolloversToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingRolloversToCustomerProduct";
import { reapplyExistingUsagesToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingUsagesToCustomerProduct";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Activates a scheduled customer product.
 *
 * This action:
 * 1. Sets status to Active
 * 2. Updates subscription_ids and scheduled_ids
 * 3. Sends products_updated webhook with New scenario
 *
 * @returns The updates applied to the customer product (for tracking)
 */
export const activateScheduledCustomerProduct = async ({
	ctx,
	fromCustomerProduct,
	customerProduct,
	fullCustomer,
	subscriptionIds,
	scheduledIds,
}: {
	ctx: AutumnContext;
	fromCustomerProduct?: FullCusProduct; // for cases where expiry happens before activation (eg. expireAndActivateDefault)
	customerProduct: FullCusProduct;
	fullCustomer: FullCustomer;
	subscriptionIds?: string[];
	scheduledIds?: string[];
}): Promise<{ updates: Partial<InsertCustomerProduct> }> => {
	const { db, org, env, logger } = ctx;

	logger.info(
		`[activateScheduledCustomerProduct] Activating ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
	);

	await reapplyExistingUsagesToCustomerProduct({
		ctx,
		fromCustomerProduct,
		customerProduct,
		fullCustomer,
	});

	await reapplyExistingRolloversToCustomerProduct({
		ctx,
		fromCustomerProduct,
		customerProduct,
		fullCustomer,
	});

	// 1. Update status and subscription/schedule IDs
	const updates: Partial<InsertCustomerProduct> = {
		status: CusProductStatus.Active,
		subscription_ids: subscriptionIds,
		scheduled_ids: scheduledIds,
	};

	await CusProductService.update({
		db,
		cusProductId: customerProduct.id,
		updates,
	});

	// 2. Send webhook
	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: customerProduct.internal_customer_id,
		org,
		env,
		customerId: fullCustomer.id || "",
		scenario: AttachScenario.New,
		cusProduct: customerProduct,
	});

	return { updates };
};
