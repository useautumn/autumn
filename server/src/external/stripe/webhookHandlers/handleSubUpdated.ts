import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { CusProductStatus, Organization } from "@autumn/shared";

export const handleSubscriptionUpdated = async ({
  sb,
  org,
  subscription,
}: {
  sb: any;
  org: Organization;
  subscription: any;
}) => {
  let subStatusMap: {
    [key: string]: CusProductStatus;
  } = {
    trialing: CusProductStatus.Active,
    active: CusProductStatus.Active,
    past_due: CusProductStatus.PastDue,
  };

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
