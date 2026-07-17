import {
	type AutumnBillingPlan,
	CusProductStatus,
	type FullCusProduct,
	findMainScheduledCustomerProductByGroup,
	isCustomerProductOnStripeSubscription,
	isCustomerProductPaid,
} from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { mergeAutumnBillingPlans } from "@/internal/billing/v2/utils/billingPlan/mergeAutumnBillingPlans.js";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import {
	completeCustomerProductExpiry,
	type PreparedCustomerProductExpiry,
	prepareCustomerProductExpiry,
} from "@/internal/customers/cusProducts/actions/expireAndActivateDefault.js";
import {
	trackCustomerProductDeletion,
	trackCustomerProductInsertion,
	trackCustomerProductUpdate,
} from "../../common";
import type { StripeSubscriptionDeletedContext } from "../setupStripeSubscriptionDeletedContext";

/**
 * Handles customer product state changes when a subscription is deleted.
 *
 * For each customer product on the deleted subscription:
 * 1. Expire the customer product and activate default if needed
 * 2. Delete any scheduled main customer product in the same group
 * 3. Cache expired products so invoice.created can access them
 */
export const expireAndActivateCustomerProducts = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionDeletedContext;
}): Promise<void> => {
	const { logger } = ctx;
	const { customerProducts, fullCustomer, stripeSubscription } = eventContext;

	logger.info(
		`[sub.deleted] Processing ${customerProducts.length} customer products for subscription ${stripeSubscription.id}`,
	);

	const preparedExpirations: PreparedCustomerProductExpiry[] = [];
	const scheduledCustomerProductsById = new Map<string, FullCusProduct>();
	const scheduledCustomerProductByExpiredProductId = new Map<
		string,
		FullCusProduct
	>();

	// Prepare from a stable snapshot. Completion and tracking mutate both the
	// event-context product list and FullCustomer, but only after the merged
	// lifecycle plan has committed successfully.
	for (const customerProduct of [...customerProducts]) {
		const onStripeSubscription = isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: stripeSubscription.id,
		});

		if (!onStripeSubscription) continue;

		preparedExpirations.push(
			prepareCustomerProductExpiry({
				customerProduct,
				fullCustomer,
			}),
		);

		const scheduledCustomerProduct = findMainScheduledCustomerProductByGroup({
			fullCustomer,
			productGroup: customerProduct.product.group,
			internalEntityId: customerProduct.internal_entity_id ?? undefined,
		});
		if (
			!scheduledCustomerProduct ||
			!isCustomerProductPaid(scheduledCustomerProduct) ||
			scheduledCustomerProductsById.has(scheduledCustomerProduct.id)
		) {
			continue;
		}

		scheduledCustomerProductsById.set(
			scheduledCustomerProduct.id,
			scheduledCustomerProduct,
		);
		scheduledCustomerProductByExpiredProductId.set(
			customerProduct.id,
			scheduledCustomerProduct,
		);
	}

	if (preparedExpirations.length > 0) {
		let mergedPlan: AutumnBillingPlan = {
			customerId: fullCustomer.id || fullCustomer.internal_id,
			insertCustomerProducts: [],
			deleteCustomerProducts: [...scheduledCustomerProductsById.values()],
		};
		for (const preparedExpiration of preparedExpirations) {
			mergedPlan = mergeAutumnBillingPlans({
				base: mergedPlan,
				incoming: preparedExpiration.autumnBillingPlan,
			});
		}

		for (const scheduledCustomerProduct of scheduledCustomerProductsById.values()) {
			logger.info(
				`Deleting scheduled product: ${scheduledCustomerProduct.product.name}${scheduledCustomerProduct.entity_id ? `@${scheduledCustomerProduct.entity_id}` : ""}`,
			);
		}

		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: mergedPlan,
		});
	}

	const expiredCustomerProducts: FullCusProduct[] = [];
	for (const preparedExpiration of preparedExpirations) {
		const { customerProduct, updates } = preparedExpiration;
		const { activatedCustomerProduct, insertedCustomerProduct } =
			await completeCustomerProductExpiry({
				ctx,
				customerProduct,
				fullCustomer,
				updates,
			});

		const expiredCustomerProduct = trackCustomerProductUpdate({
			eventContext,
			customerProduct,
			updates,
		});
		expiredCustomerProducts.push(expiredCustomerProduct);

		if (activatedCustomerProduct) {
			trackCustomerProductUpdate({
				eventContext,
				customerProduct: activatedCustomerProduct,
				updates: { status: CusProductStatus.Active },
			});
		}

		if (insertedCustomerProduct) {
			trackCustomerProductInsertion({
				eventContext,
				customerProduct: insertedCustomerProduct,
			});
		}

		const scheduledCustomerProduct =
			scheduledCustomerProductByExpiredProductId.get(customerProduct.id);
		if (scheduledCustomerProduct) {
			trackCustomerProductDeletion({
				eventContext,
				customerProduct: scheduledCustomerProduct,
			});
		}
	}

	/**
	 * Need to cache expired customer products to invoice.created can access them
	 * invoice.created creates a final invoice for usage-based prices
	 */
	await customerProductActions.expiredCache.set({
		stripeSubscriptionId: stripeSubscription.id,
		customerProducts: expiredCustomerProducts,
	});
};
