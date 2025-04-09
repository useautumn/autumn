import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { AppEnv, CusProductStatus, Organization } from "@autumn/shared";
import Stripe from "stripe";
import { createStripeCli } from "../utils.js";

export const handleSubscriptionUpdated = async ({
  sb,
  org,
  subscription,
  env,
  logger,
}: {
  sb: any;
  org: Organization;
  env: AppEnv;
  subscription: any;
  logger: any;
}) => {
  let subStatusMap: {
    [key: string]: CusProductStatus;
  } = {
    trialing: CusProductStatus.Active,
    active: CusProductStatus.Active,
    past_due: CusProductStatus.PastDue,
  };

  // Get cus products by stripe sub id

  const cusProducts = await CusProductService.getByStripeSubId({
    sb,
    stripeSubId: subscription.id,
    orgId: org.id,
    env,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
  });

  if (cusProducts.length === 0) {
    console.log(
      `subscription.updated: no customer products found with stripe sub id: ${subscription.id}`
    );
    return;
  }

  // 1. Fetch subscription
  const updatedCusProducts = await CusProductService.updateByStripeSubId({
    sb,
    stripeSubId: subscription.id,
    updates: {
      status: subStatusMap[subscription.status] || CusProductStatus.Unknown,
      canceled_at: subscription.canceled_at
        ? subscription.canceled_at * 1000
        : null,
      collection_method: subscription.collection_method,
    },
  });

  if (updatedCusProducts.length > 0) {
    console.log(
      `subscription.updated: updated ${updatedCusProducts.length} customer products`,
      {
        ids: updatedCusProducts.map((cp) => cp.id),
        status: updatedCusProducts[0].status,
        canceled_at: updatedCusProducts[0].canceled_at,
      }
    );
  }

  // console.log("Cancel on past due:", org.config.cancel_on_past_due);
  // throw new Error("test");

  // Cancel subscription immediately
  if (subscription.status === "past_due" && org.config.cancel_on_past_due) {
    const stripeCli = createStripeCli({
      org,
      env,
    });

    console.log("subscription.updated: past due, cancelling:", subscription.id);
    try {
      await stripeCli.subscriptions.cancel(subscription.id);
      await stripeCli.invoices.voidInvoice(subscription.latest_invoice);
    } catch (error: any) {
      logger.error(
        `subscription.updated: error cancelling / voiding: ${error.message}`,
        {
          subscriptionId: subscription.id,
          stripeSubId: subscription.id,
          error: error.message,
        }
      );
    }
  }
};

// const handleSubPastDue = async ({
//   sb,
//   org,
//   subscription,
// }: {
//   sb: any;
//   org: Organization;
//   subscription: any;
// }) => {
//   const updated = await CusProductService.updateStatusByStripeSubId({
//     sb,
//     stripeSubId: subscription.id,
//     status: CusProductStatus.PastDue,
//   });

//   if (updated) {
//     console.log("Customer product status updated to past due:", updated?.id);
//   }
// };

// const handleSubActive = async ({
//   sb,
//   org,
//   subscription,
// }: {
//   sb: any;
//   org: Organization;
//   subscription: any;
// }) => {
//   const updated = await CusProductService.updateStatusByStripeSubId({
//     sb,
//     stripeSubId: subscription.id,
//     status: CusProductStatus.Active,
//   });

//   if (updated) {
//     console.log("Customer product status updated to active:", updated?.id);
//   }
// };

// const undoStripeSubCancellation = async ({
//   sb,
//   org,
//   subscription,
// }: {
//   sb: any;
//   org: Organization;
//   subscription: any;
// }) => {
//   const { data: updated, error } = await sb
//     .from("customer_products")
//     .update({
//       canceled_at: null,
//       expires_at: null,
//     })
//     .eq("processor->>subscription_id", subscription.id)
//     .select();

//   if (!updated || updated.length === 0) {
//     return;
//   }

//   console.log("Stripe subscription cancelled undone:", subscription.id);
// };
