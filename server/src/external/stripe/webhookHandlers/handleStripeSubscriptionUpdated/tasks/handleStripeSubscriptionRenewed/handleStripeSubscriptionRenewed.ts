import {
	AttachScenario,
	cp,
	type FullCusProduct,
	findMainScheduledCustomerProductByGroup,
} from "@autumn/shared";
import { isAutumnOriginatedStripeEvent } from "@/external/stripe/common/autumnStripeIdempotency.js";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import {
	trackCustomerProductDeletion,
	trackCustomerProductUpdate,
} from "../../../common/trackCustomerProductUpdate";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";
import { isStripeSubscriptionRenewedEvent } from "./isStripeSubscriptionRenewedEvent";

export const handleStripeSubscriptionRenewed = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> => {
	const { org, env, logger } = ctx;
	const {
		stripeSubscription,
		previousAttributes,
		customerProducts,
		fullCustomer,
	} = subscriptionUpdatedContext;

	const { renewed } = isStripeSubscriptionRenewedEvent({
		stripeSubscription,
		previousAttributes,
	});

	if (!renewed) return;

	const autumnOriginated = isAutumnOriginatedStripeEvent({
		event: ctx.stripeEvent,
	});
	const hasSchedule = Boolean(stripeSubscription.schedule);

	if (autumnOriginated || hasSchedule) {
		logger.info(
			`[handleStripeSubscriptionRenewed] Skipping - ${autumnOriginated ? "autumn-originated" : "has schedule"}`,
		);
		return;
	}

	for (const customerProduct of [...customerProducts]) {
		const { valid } = cp(customerProduct)
			.recurring()
			.hasActiveStatus()
			.onStripeSubscription({ stripeSubscriptionId: stripeSubscription.id });

		if (!valid) continue;

		if (!customerProduct.canceled && !customerProduct.canceled_at) continue;

		const updates = {
			canceled_at: null,
			canceled: false,
			ended_at: null,
		};

		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates,
		});

		trackCustomerProductUpdate({
			eventContext: subscriptionUpdatedContext,
			customerProduct,
			updates,
		});

		logger.info(
			`[handleStripeSubscriptionRenewed] Cleared cancellation for ${customerProduct.product.name}`,
		);

		const { valid: isRecurringAndMain } = cp(customerProduct)
			.recurring()
			.main();

		if (!org.config.sync_status) continue;

		let deletedScheduledProduct: FullCusProduct | undefined;
		if (isRecurringAndMain) {
			const scheduledProduct = findMainScheduledCustomerProductByGroup({
				fullCustomer,
				productGroup: customerProduct.product.group,
				internalEntityId: customerProduct.internal_entity_id ?? undefined,
			});

			if (scheduledProduct) {
				await CusProductService.delete({
					ctx,
					cusProductId: scheduledProduct.id,
				});

				deletedScheduledProduct = scheduledProduct;

				logger.info(
					`[handleStripeSubscriptionRenewed] Deleted scheduled ${scheduledProduct.product.name}`,
				);

				trackCustomerProductDeletion({
					eventContext: subscriptionUpdatedContext,
					customerProduct: scheduledProduct,
				});
			}
		}

		await addProductsUpdatedWebhookTask({
			ctx,
			internalCustomerId: fullCustomer.internal_id,
			org,
			env,
			customerId: fullCustomer.id ?? null,
			scenario: AttachScenario.Renew,
			cusProduct: customerProduct,
			deletedCusProduct: deletedScheduledProduct,
		});
	}
};
