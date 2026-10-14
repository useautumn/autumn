import {
	CusProductStatus,
	type FullCusProduct,
	findMainScheduledCustomerProductByGroup,
	isCustomerProductOnStripeSubscription,
	isCustomerProductPaid,
	isCustomerProductScheduled,
} from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { refreshAllocationScaleAfterWrite } from "@/internal/balances/allocate/actions/refreshAllocationScale";
import { ALLOCATIONS_ADJUSTED_TAG } from "@/internal/balances/allocate/allocationsAdjustedTag";
import { applyPooledBalanceCustomerProductTransitions } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCustomerProductTransitions";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import { deleteScheduledCustomerProduct } from "@/internal/customers/cusProducts/actions/deleteScheduledCustomerProduct";
import {
	addBillingChangeTag,
	expireAndActivateWithTracking,
	trackCustomerProductDeletion,
} from "../../common";
import type { StripeSubscriptionDeletedContext } from "../setupStripeSubscriptionDeletedContext";

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

	const outgoingCustomerProducts: FullCusProduct[] = [];
	const incomingCustomerProducts: FullCusProduct[] = [];
	const liveCustomerProducts = customerProducts.filter(
		(customerProduct) => !isCustomerProductScheduled(customerProduct),
	);
	await customerProductActions.expiredCache.set({
		ctx,
		stripeSubscriptionId: stripeSubscription.id,
		customerProducts: liveCustomerProducts.map((customerProduct) => ({
			...customerProduct,
			status: CusProductStatus.Expired,
		})),
	});
	for (const customerProduct of liveCustomerProducts) {
		const onStripeSubscription = isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: stripeSubscription.id,
		});

		if (!onStripeSubscription) continue;

		const { activation, insertedCustomerProduct } =
			await expireAndActivateWithTracking({
				ctx,
				eventContext,
				customerProduct,
			});

		outgoingCustomerProducts.push(customerProduct);
		if (activation) {
			incomingCustomerProducts.push(activation.after);
		}
		if (insertedCustomerProduct) {
			incomingCustomerProducts.push(insertedCustomerProduct);
		}

		const scheduledCustomerProduct = findMainScheduledCustomerProductByGroup({
			fullCustomer,
			productGroup: customerProduct.product.group,
			internalEntityId: customerProduct.internal_entity_id ?? undefined,
		});

		if (
			scheduledCustomerProduct &&
			isCustomerProductPaid(scheduledCustomerProduct)
		) {
			await deleteScheduledCustomerProduct({
				ctx,
				customerProduct: scheduledCustomerProduct,
				fullCustomer,
			});

			trackCustomerProductDeletion({
				eventContext,
				customerProduct: scheduledCustomerProduct,
			});
		}
	}

	await applyPooledBalanceCustomerProductTransitions({
		ctx,
		fullCustomer,
		outgoingCustomerProducts,
		incomingCustomerProducts,
		now: eventContext.nowMs,
	});

	const { adjusted } = await refreshAllocationScaleAfterWrite({
		ctx,
		customerId: fullCustomer.id || fullCustomer.internal_id,
		notify: false,
		now: eventContext.nowMs,
	});
	if (adjusted) addBillingChangeTag(eventContext, ALLOCATIONS_ADJUSTED_TAG);
};
