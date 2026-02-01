// import type { DeferredAutumnBillingPlanData } from "@autumn/shared";
// import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
// import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";

// export const swapEntityConsumablePrices = async ({
// 	ctx,
// 	checkoutContext,
// 	deferredData,
// }: {
// 	ctx: StripeWebhookContext;
// 	checkoutContext: CheckoutSessionCompletedContext;
// 	deferredData: DeferredAutumnBillingPlanData;
// }) => {
//   const { stripeSubscription } = checkoutContext;
//   if (!stripeSubscription) return;

//   const { stripeCli } = ctx;

//   const stripeSubscriptionItems = await stripeCli.subscriptions.listLineItems(stripeSubscription.id);

//   for (const item of stripeSubscriptionItems.data) {
//     if (item.price.recurring?.usage_type === "metered") {
//   }
// };
