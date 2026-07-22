import {
	CusProductStatus,
	type FullCusProduct,
	hasCustomerProductEnded,
} from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";
import {
	completeCustomerProductExpiry,
	type PreparedCustomerProductExpiry,
	prepareCustomerProductExpiry,
} from "@/internal/customers/cusProducts/actions/expireAndActivateDefault.js";
import {
	trackCustomerProductInsertion,
	trackCustomerProductUpdate,
} from "../../../common/trackCustomerProductUpdate.js";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext.js";

export const prepareEndedCustomerProducts = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}): Promise<PreparedCustomerProductExpiry[]> => {
	const { logger } = ctx;
	const { customerProducts, nowMs, fullCustomer } = eventContext;
	const preparedExpirations: PreparedCustomerProductExpiry[] = [];

	for (const customerProduct of [...customerProducts]) {
		const shouldExpire = hasCustomerProductEnded(customerProduct, { nowMs });

		if (!shouldExpire) continue;

		logger.info(
			`Expiring product: ${customerProduct.product.name}${customerProduct.entity_id ? `@${customerProduct.entity_id}` : ""}`,
		);

		const carryOver = await customerProductActions.preserveOneOffPrepaid({
			ctx,
			customerProduct,
			fullCustomer,
		});
		if (carryOver.preservedCount > 0) {
			eventContext.oneOffPrepaidCarryOvers.push({
				customerProductId: customerProduct.id,
				productName: customerProduct.product.name,
				preservedCount: carryOver.preservedCount,
				preservedFeatureIds: carryOver.preservedFeatureIds,
			});
		}

		preparedExpirations.push(
			prepareCustomerProductExpiry({ customerProduct, fullCustomer }),
		);
	}

	return preparedExpirations;
};

export const completeEndedCustomerProducts = async ({
	ctx,
	eventContext,
	preparedExpirations,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
	preparedExpirations: PreparedCustomerProductExpiry[];
}): Promise<void> => {
	const expiredCustomerProducts: FullCusProduct[] = [];

	for (const preparedExpiry of preparedExpirations) {
		const { activatedCustomerProduct, insertedCustomerProduct } =
			await completeCustomerProductExpiry({
				ctx,
				customerProduct: preparedExpiry.customerProduct,
				fullCustomer: eventContext.fullCustomer,
				updates: preparedExpiry.updates,
			});

		const expiredCustomerProduct = trackCustomerProductUpdate({
			eventContext,
			customerProduct: preparedExpiry.customerProduct,
			updates: preparedExpiry.updates,
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
	}

	if (expiredCustomerProducts.length > 0) {
		await customerProductActions.expiredCache.set({
			stripeSubscriptionId: eventContext.stripeSubscription.id,
			customerProducts: expiredCustomerProducts,
		});
	}
};

/** Expires ended products, evaluates free successors, and caches usage products. */
export const expireEndedCustomerProducts = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const preparedExpirations = await prepareEndedCustomerProducts({
		ctx,
		eventContext,
	});

	for (const preparedExpiry of preparedExpirations) {
		await executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: preparedExpiry.autumnBillingPlan,
		});
	}

	await completeEndedCustomerProducts({
		ctx,
		eventContext,
		preparedExpirations,
	});
};
