import {
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	findMainActiveCustomerProductByGroup,
	isCustomerProductCanceling,
} from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { activateDefaultProduct } from "@/internal/customers/cusProducts/cusProductUtils";
import { nullish } from "@/utils/genUtils";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";
import { trackCustomerProductUpdate } from "../../utils/trackCustomerProductUpdate";
import { PHASE_TOLERANCE_MS } from "./schedulePhaseConstants";

/**
 * Checks if a customer product should be expired.
 * Uses tolerance to handle timing differences between Stripe and webhook arrival.
 */
const shouldExpireProduct = ({
	customerProduct,
	nowMs,
}: {
	customerProduct: FullCusProduct;
	nowMs: number;
}): boolean => {
	if (!isCustomerProductCanceling(customerProduct)) return false;
	if (nullish(customerProduct.ended_at)) return false;
	// Expire if ended_at is within tolerance of now
	return customerProduct.ended_at <= nowMs + PHASE_TOLERANCE_MS;
};

/**
 * Expires customer products that have ended.
 * Also activates default product if no other active product exists in the same group.
 * Tracks updates via subscriptionUpdatedContext.
 */
export const expireEndedCustomerProducts = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { db, org, env, logger } = ctx;
	const { customerProducts, fullCustomer, nowMs } = subscriptionUpdatedContext;

	for (const customerProduct of customerProducts) {
		// console.log("customerProduct", customerProduct.product.name);
		// console.log(
		// 	"shouldExpireProduct",
		// 	shouldExpireProduct({ customerProduct, nowMs }),
		// );
		if (!shouldExpireProduct({ customerProduct, nowMs })) continue;

		logger.info(
			`[handleSchedulePhaseChanges] ❌ expiring: ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
		);

		const updates = { status: CusProductStatus.Expired };

		await CusProductService.update({
			db,
			cusProductId: customerProduct.id,
			updates,
		});

		await addProductsUpdatedWebhookTask({
			ctx,
			internalCustomerId: customerProduct.internal_customer_id,
			org,
			env,
			customerId: fullCustomer.id || "",
			scenario: AttachScenario.Expired,
			cusProduct: customerProduct,
		});

		trackCustomerProductUpdate({
			subscriptionUpdatedContext,
			customerProduct,
			updates,
		});

		// Skip default product activation for add-ons
		if (customerProduct.product.is_add_on) continue;

		// Check if there's another active product in the same group
		const hasActiveInGroup = findMainActiveCustomerProductByGroup({
			fullCus: fullCustomer,
			productGroup: customerProduct.product.group,
			internalEntityId: customerProduct.internal_entity_id ?? undefined,
		});

		if (!hasActiveInGroup) {
			logger.info(
				`[handleSchedulePhaseChanges] No active product in group "${customerProduct.product.group}", activating default`,
			);

			await activateDefaultProduct({
				ctx,
				productGroup: customerProduct.product.group,
				fullCus: fullCustomer,
				curCusProduct: customerProduct,
			});
		}
	}
};
