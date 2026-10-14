import {
	AttachScenario,
	cp,
	type DeferredAutumnBillingPlanData,
	MetadataType,
} from "@autumn/shared";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
import { createStripeScheduleFromCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionEnabledImmediately/createStripeScheduleFromCheckout";
import { modifyStripeSubscriptionFromCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/modifyStripeSubscriptionFromCheckout";
import { syncSubscriptionItemMetadataFromCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/syncSubscriptionItemMetadataFromCheckout";
import { updateBillingPlanFromCheckout } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/updateBillingPlanFromCheckout";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { persistDeferredSetPlansSchedule } from "@/internal/billing/v2/actions/setPlans/utils/persistDeferredSetPlansSchedule";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { executeStripeReplacedSubscriptionAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeReplacedSubscriptionAction";
import { withoutCustomCatalogRows } from "@/internal/billing/v2/utils/billingPlan/withoutCustomCatalogRows";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { workflows } from "@/queue/workflows";

export const handleCheckoutSessionEnabledImmediately = async ({
	ctx,
	checkoutContext,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
}): Promise<void> => {
	const { metadata, stripeCheckoutSession, stripeSubscription, stripeInvoice } =
		checkoutContext;

	if (
		metadata?.type !== MetadataType.CheckoutSessionEnabledImmediately &&
		metadata?.type !== MetadataType.LongLivedCheckoutEnabledImmediately
	) {
		return;
	}

	ctx.logger.info(
		`[checkout.completed] Handling enable_plan_immediately checkout: ${metadata.id}`,
	);

	const deferredData = metadata.data as DeferredAutumnBillingPlanData;

	await syncSubscriptionItemMetadataFromCheckout({ ctx, checkoutContext });

	const updatedDeferredData = await updateBillingPlanFromCheckout({
		ctx,
		checkoutContext,
		deferredData,
	});

	await modifyStripeSubscriptionFromCheckout({
		ctx,
		checkoutContext,
		deferredData: updatedDeferredData,
	});

	const stripeScheduleId = await createStripeScheduleFromCheckout({
		ctx,
		checkoutContext,
		deferredData: updatedDeferredData,
	});

	await executeStripeReplacedSubscriptionAction({
		ctx,
		fullCustomer: updatedDeferredData.billingContext.fullCustomer,
		replacedSubscriptionAction:
			updatedDeferredData.billingPlan.stripe.replacedSubscriptionAction,
	});

	const existingCusProducts =
		await CusProductService.getByStripeCheckoutSessionId({
			db: ctx.db,
			stripeCheckoutSessionId: stripeCheckoutSession.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

	const updatedAutumnPlan = updatedDeferredData.billingPlan.autumn;
	const updateCustomerProducts = existingCusProducts.map((customerProduct) => {
		const { valid: isPaidRecurring } = cp(customerProduct).paid().recurring();

		const subscriptionIds = stripeSubscription
			? Array.from(
					new Set([
						...(customerProduct.subscription_ids ?? []),
						stripeSubscription.id,
					]),
				)
			: (customerProduct.subscription_ids ?? undefined);

		return {
			customerProduct,
			updates: {
				...(subscriptionIds !== undefined
					? { subscription_ids: subscriptionIds }
					: {}),
				...(isPaidRecurring && stripeScheduleId
					? { scheduled_ids: [stripeScheduleId] }
					: {}),
			},
		};
	});

	const completionAutumnPlan = {
		...withoutCustomCatalogRows(updatedAutumnPlan),
		insertCustomerProducts: [],
		updateCustomerProducts,
		insertCustomerEntitlements: undefined,
		updateCustomerEntitlements: [],
		oneOffPurchaseRebalance: undefined,
	};

	const { allocationsAdjusted } = await executeAutumnBillingPlan({
		emitsBillingUpdated: true,
		ctx,
		autumnBillingPlan: completionAutumnPlan,
		stripeInvoice,
	});

	await persistDeferredSetPlansSchedule({
		ctx,
		billingContext: updatedDeferredData.billingContext,
		billingPlan: updatedDeferredData.billingPlan,
	});

	await billingPlanToSendProductsUpdated({
		ctx,
		autumnBillingPlan: completionAutumnPlan,
		billingContext: updatedDeferredData.billingContext,
		fallbackUpdateScenario: AttachScenario.Active,
	});

	void sendBillingUpdatedWebhook({
		allocationsAdjusted,
		ctx,
		autumnBillingPlan: completionAutumnPlan,
		originalFullCustomer: updatedDeferredData.billingContext.fullCustomer,
	});

	await MetadataService.delete({ db: ctx.db, id: metadata.id });

	const customerId =
		updatedDeferredData.billingContext.fullCustomer.id ??
		updatedDeferredData.billingContext.fullCustomer.internal_id;
	for (const product of updatedAutumnPlan.insertCustomerProducts) {
		await workflows.triggerGrantCheckoutReward({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			productId: product.product.id,
			stripeSubscriptionId: stripeSubscription?.id,
		});
	}
};
