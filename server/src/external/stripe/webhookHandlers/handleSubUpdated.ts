import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { AppEnv, CusProductStatus, Organization } from "@autumn/shared";
import Stripe from "stripe";
import { createStripeCli } from "../utils.js";

const handleSubPastDue = async ({
  sb,
  subscription,
}: {
  sb: any;
  subscription: any;
}) => {
  // 1. Expire cus products
  // Cancel subscription entirely
};

export const handleSubscriptionUpdated = async ({
  sb,
  org,
  subscription,
  env,
}: {
  sb: any;
  org: Organization;
  env: AppEnv;
  subscription: any;
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
    inStatuses: [CusProductStatus.Active],
  });

  if (cusProducts.length === 0) {
    console.log(
      `subscription.updated: no customer products found with stripe sub id: ${subscription.id}`
    );
    return;
  }

  // 1. Fetch subscription
  const cusProduct = await CusProductService.updateByStripeSubId({
    sb,
    stripeSubId: subscription.id,
    updates: {
      status: subStatusMap[subscription.status] || CusProductStatus.Unknown,
      canceled_at: subscription.canceled_at
        ? subscription.canceled_at * 1000
        : null,
    },
  });

  if (cusProduct) {
    console.log(
      `subscription.updated: updated customer product ${cusProduct.id}`,
      {
        id: cusProduct.id,
        status: cusProduct.status,
        canceled_at: cusProduct.canceled_at,
      }
    );
  }

  // Cancel subscription immediately
  if (subscription.status === "past_due") {
    const stripeCli = createStripeCli({
      org,
      env,
    });

    console.log("subscription.updated: past due, cancelling:", subscription.id);
    try {
      await stripeCli.subscriptions.cancel(subscription.id);
    } catch (error: any) {
      console.error("subscription.updated: error cancelling:", error.message);
    }

    // Void latest invoice
    try {
      await stripeCli.invoices.voidInvoice(subscription.latest_invoice);
    } catch (error) {
      console.error(
        "subscription.updated: error voiding latest invoice:",
        error
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
