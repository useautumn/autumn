import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { CusProductStatus, Organization, ProcessorType } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const handleSubCreated = async ({
  sb,
  subscription,
  org,
  env,
}: {
  sb: SupabaseClient;
  subscription: Stripe.Subscription;
  org: Organization;
  env: AppEnv;
}) => {
  if (subscription.schedule) {
    const cusProds = await CusProductService.getByStripeScheduledId({
      sb,
      stripeScheduledId: subscription.schedule as string,
      orgId: org.id,
      env,
    });

    if (!cusProds || cusProds.length === 0) {
      console.log("No cus prod found for scheduled id", subscription.schedule);
      return;
    }

    let batchUpdate = [];
    for (const cusProd of cusProds) {
      let subIds = cusProd.subscription_ids
        ? [...cusProd.subscription_ids]
        : [];
      subIds.push(subscription.id);

      const updateCusProd = async () => {
        await sb
          .from("customer_products")
          .update({
            subscription_ids: subIds,
          })
          .eq("id", cusProd.id);
      };

      batchUpdate.push(updateCusProd());
    }

    await Promise.all(batchUpdate);

    console.log(
      "Handled subscription.created for scheduled cus products:",
      cusProds.length
    );
  }
};
