import {
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
import { persistDeferredCreateSchedule } from "@/internal/billing/v2/actions/createSchedule/utils/persistDeferredCreateSchedule";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { workflows } from "@/queue/workflows";

/**
 * Webhook task: handles checkout.session.completed for the
 * `enable_plan_immediately + stripe_checkout` flow.
 *
 * The cusProduct rows were already inserted at attach time and linked to the
 * pending checkout session via `stripe_checkout_session_id`. This task:
 *   1. Reconciles the Stripe subscription shape and (for createSchedule) creates
 *      the Stripe `subscription_schedule`.
 *   2. Builds an "update-only" autumn billing plan that patches `subscription_ids`
 *      / `scheduled_ids` onto the existing rows + carries the `upsertSubscription`
 *      and `upsertInvoice` from `updateBillingPlanFromCheckout`.
 *   3. Hands that plan to `executeAutumnBillingPlan`, which is the canonical path
 *      for cusProduct mutations + sub/invoice upserts + line-item workflow.
 */
export const handleCheckoutSessionEnabledImmediately = async ({
	ctx,
	checkoutContext,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
}): Promise<void> => {
	const { metadata, stripeCheckoutSession, stripeSubscription, stripeInvoice } =
		checkoutContext;

	if (metadata?.type !== MetadataType.CheckoutSessionEnabledImmediately) return;

	ctx.logger.info(
		`[checkout.completed] Handling enable_plan_immediately checkout: ${metadata.id}`,
	);

	const deferredData = metadata.data as DeferredAutumnBillingPlanData;

	// 1. Sync Autumn metadata onto subscription items created by checkout
	await syncSubscriptionItemMetadataFromCheckout({ ctx, checkoutContext });

	// 2. Build upsertSubscription / upsertInvoice from Stripe and update the
	//    in-memory billing plan.
	const updatedDeferredData = await updateBillingPlanFromCheckout({
		ctx,
		checkoutContext,
		deferredData,
	});

	// 3. Reconcile the Stripe subscription shape (e.g. add monthly prepaid
	//    quantities when checkout only created an annual base sub).
	await modifyStripeSubscriptionFromCheckout({
		ctx,
		checkoutContext,
		deferredData: updatedDeferredData,
	});

	// 4. For createSchedule contexts, create the Stripe subscription_schedule
	//    against the now-existing subscription. Returns null for attach (no
	//    schedule action on the plan).
	const stripeScheduleId = await createStripeScheduleFromCheckout({
		ctx,
		checkoutContext,
		deferredData: updatedDeferredData,
	});

	// 5. Look up the cusProduct rows linked to this checkout session so we can
	//    patch subscription_ids / scheduled_ids onto them. One DB read serves
	//    both patches below.
	const existingCusProducts =
		await CusProductService.getByStripeCheckoutSessionId({
			db: ctx.db,
			stripeCheckoutSessionId: stripeCheckoutSession.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

	// 6. Build update entries on the autumn plan instead of writing to DB
	//    directly — this is the canonical mutation path picked up by
	//    `executeAutumnBillingPlan`. Empty out `insertCustomerProducts` /
	//    `updateCustomerEntitlements` since both already ran at attach time.
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

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			...updatedAutumnPlan,
			insertCustomerProducts: [],
			updateCustomerProducts,
			insertCustomerEntitlements: undefined,
			updateCustomerEntitlements: [],
		},
		stripeInvoice,
	});

	// 7. Persist the Autumn schedule rows (createSchedule only — no-op for attach).
	await persistDeferredCreateSchedule({
		ctx,
		billingContext: updatedDeferredData.billingContext,
		billingPlan: updatedDeferredData.billingPlan,
	});

	// 8. Cleanup metadata.
	await MetadataService.delete({ db: ctx.db, id: metadata.id });

	// 9. Trigger grant-checkout-reward workflow per inserted product.
	// Note: feature quantities can't be changed on the Stripe checkout page in
	// this flow — `handleStripeCheckoutErrors` blocks `enable_plan_immediately`
	// + adjustable_quantity at attach time, so the cusProduct row inserted
	// up-front is guaranteed to match what the customer pays for.
	const customerId = ctx.fullCustomer?.id ?? "";
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
