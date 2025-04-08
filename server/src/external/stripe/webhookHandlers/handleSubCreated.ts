import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { CusProductStatus, Organization, ProcessorType } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createStripeCli } from "../utils.js";
import { InvoiceService } from "@/internal/customers/invoices/InvoiceService.js";
import { getStripeExpandedInvoice } from "../stripeInvoiceUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { generateId } from "@/utils/genUtils.js";

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

    // Update autumn sub
    let autumnSub = await SubService.getFromScheduleId({
      sb,
      scheduleId: subscription.schedule as string,
    });

    if (autumnSub) {
      await SubService.updateFromScheduleId({
        sb,
        scheduleId: subscription.schedule as string,
        updates: {
          stripe_id: subscription.id,
        },
      });
    } else {
      let subUsageFeatures = [];
      try {
        subUsageFeatures = JSON.parse(subscription.metadata?.usage_features);
        subUsageFeatures = subUsageFeatures.map(
          (feature: any) => feature.internal_id
        );
      } catch (error) {
        console.log("Error parsing usage features", error);
      }

      await SubService.createSub({
        sb,
        sub: {
          id: generateId("sub"),
          created_at: Date.now(),
          stripe_id: subscription.id,
          stripe_schedule_id: subscription.schedule as string,
          usage_features: subUsageFeatures,
        },
      });
    }

    console.log(
      "Handling subscription.created for scheduled cus products:",
      cusProds.length
    );

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
            // status: CusProductStatus.Active,
          })
          .eq("id", cusProd.id);

        // Fetch latest invoice?
        const stripeCli = createStripeCli({ org, env });
        const invoice = await getStripeExpandedInvoice({
          stripeCli,
          stripeInvoiceId: subscription.latest_invoice as string,
        });

        await InvoiceService.createInvoiceFromStripe({
          sb,
          stripeInvoice: invoice,
          internalCustomerId: cusProd.internal_customer_id,
          productIds: [cusProd.product_id],
          internalProductIds: [cusProd.internal_product_id],
          org,
        });
      };

      batchUpdate.push(updateCusProd());
    }

    await Promise.all(batchUpdate);
  }
};
