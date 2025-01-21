import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { CusProductStatus, Organization } from "@autumn/shared";

const handleSubPastDue = async ({
  sb,
  org,
  subscription,
}: {
  sb: any;
  org: Organization;
  subscription: any;
}) => {
  const updated = await CusProductService.updateStatusByStripeSubId({
    sb,
    stripeSubId: subscription.id,
    status: CusProductStatus.PastDue,
  });

  if (updated) {
    console.log("Customer product status updated to past due:", updated?.id);
  }
};

const handleSubActive = async ({
  sb,
  org,
  subscription,
}: {
  sb: any;
  org: Organization;
  subscription: any;
}) => {
  const updated = await CusProductService.updateStatusByStripeSubId({
    sb,
    stripeSubId: subscription.id,
    status: CusProductStatus.Active,
  });

  if (updated) {
    console.log("Customer product status updated to active:", updated?.id);
  }
};

const handleSubCanceled = async ({
  sb,
  org,
  subscription,
}: {
  sb: any;
  org: Organization;
  subscription: any;
}) => {
  // 1. Get cus product
  const cusProduct = await CusProductService.getActiveByStripeSubId({
    sb,
    stripeSubId: subscription.id,
  });

  if (!cusProduct) {
    return;
  }

  await sb
    .from("customer_products")
    .update({
      canceled_at: subscription.canceled_at * 1000,
      // expires_at: subscription.cancel_at * 1000,
    })
    .eq("id", cusProduct.id);

  console.log("Stripe subscription cancelled:", subscription.id);
};

const undoStripeSubCancellation = async ({
  sb,
  org,
  subscription,
}: {
  sb: any;
  org: Organization;
  subscription: any;
}) => {
  const { data: updated, error } = await sb
    .from("customer_products")
    .update({
      canceled_at: null,
      expires_at: null,
    })
    .eq("processor->>subscription_id", subscription.id)
    .select();

  if (!updated || updated.length === 0) {
    return;
  }

  console.log("Stripe subscription cancelled undone:", subscription.id);
};

export const handleSubscriptionUpdated = async ({
  sb,
  org,
  subscription,
}: {
  sb: any;
  org: Organization;
  subscription: any;
}) => {
  console.log("Subscription updated:", {
    id: subscription.id,
    status: subscription.status,
    customer: subscription.customer,
    canceled_at: subscription.canceled_at,
    schedule_id: subscription.subscription_schedule,
  });

  // 1. Undo stripe sub cancellation if it was cancelled
  if (subscription.canceled_at !== null) {
    await handleSubCanceled({ sb, org, subscription });
  } else {
    await undoStripeSubCancellation({ sb, org, subscription });
  }

  // 2. Handle subscription past due
  if (subscription.status === "past_due") {
    await handleSubPastDue({ sb, org, subscription });
  }

  // 3. Finally, handle subscription active
  if (subscription.status === "active") {
    await handleSubActive({ sb, org, subscription });
  }
};
