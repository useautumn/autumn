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
import { computeCustomerLicenseTransitions } from "@/internal/billing/v2/compute/customerLicenseTransitions/computeCustomerLicenseTransitions.js";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { findTransitionSourceCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/findTransitionSourceCustomerProduct";
import { reapplyExistingRolloversToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingRolloversToCustomerProduct";
import { reapplyExistingUsagesToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/reapplyExistingUsagesToCustomerProduct";

/** Activates a scheduled product and converges its inherited license state. */
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
	const { org, env, logger } = ctx;

	logger.info(
		`[activateScheduledCustomerProduct] Activating ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
	);
	const transitionSource =
		fromCustomerProduct ??
		findTransitionSourceCustomerProduct({ fullCustomer, customerProduct });

	await reapplyExistingUsagesToCustomerProduct({
		ctx,
		fromCustomerProduct: transitionSource,
		customerProduct,
		fullCustomer,
	});

	await reapplyExistingRolloversToCustomerProduct({
		ctx,
		fromCustomerProduct: transitionSource,
		customerProduct,
		fullCustomer,
	});

	// 1. Update status and subscription/schedule IDs
	const updates: Partial<InsertCustomerProduct> = {
		status: CusProductStatus.Active,
		subscription_ids: subscriptionIds,
		scheduled_ids: scheduledIds,
	};
	const customerLicenseTransitions = transitionSource
		? computeCustomerLicenseTransitions({
				outgoingCustomerProducts: [transitionSource],
				incomingCustomerProducts: [customerProduct],
			})
		: [];

	// Executing through the shared plan runs the license lifecycle for
	// activations that bring license-bearing parents live.
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
			customerLicenseTransitions,
		},
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
