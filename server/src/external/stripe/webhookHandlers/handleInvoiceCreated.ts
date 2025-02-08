import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import { getBillingType } from "@/internal/prices/priceUtils.js";
import {
  AppEnv,
  BillingType,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createStripeCli } from "../utils.js";

export const handleInvoiceCreated = async ({
  sb,
  org,
  invoice,
  env,
  event,
}: {
  sb: SupabaseClient;
  org: Organization;
  invoice: Stripe.Invoice;
  env: AppEnv;
  event: Stripe.Event;
}) => {
  console.log("Invoice created: ", invoice.id);
  // Get stripe subscriptions
  if (invoice.subscription) {
    const activeProducts = await CusProductService.getActiveByStripeSubId({
      sb,
      stripeSubId: invoice.subscription as string,
      orgId: org.id,
      env,
    });

    if (activeProducts.length != 1) {
      console.log("Invalid number of active products: ", activeProducts.length);
      return;
    }

    const activeProduct = activeProducts[0];

    // 1. Remove invoiceItem from stripe
    // Get cus ents
    const cusProductWithEntsAndPrices =
      await CusProductService.getEntsAndPrices({
        sb,
        cusProductId: activeProduct.id,
      });

    const cusEnts = cusProductWithEntsAndPrices.customer_entitlements;
    const cusPrices = cusProductWithEntsAndPrices.customer_prices;

    const cusUsagePrice = cusPrices.find(
      (cusPrice: any) =>
        getBillingType(cusPrice.price.config.type) === BillingType.UsageInArrear
    );

    if (cusUsagePrice) {
      const config = cusUsagePrice.price.config as UsagePriceConfig;
      console.log("Cus usage price config:", config);
      // Remove price from stripe
      // console.log("Cus usage price:", cusUsagePrice);
      // Get invoice items
      const stripeCli = createStripeCli({ org, env });
      // console.log("Invoice items:", invoice.lines.data);
      for (const item of invoice.lines.data) {
        if (item.price?.id == config.stripe_price_id) {
          // console.log("Removing invoice item:", item.id, item.price?.id);
        }

        // await stripeCli.invoiceItems.del(item.id);
        await stripeCli.invoiceItems.update(item.id, {
          // amount: 1000,
          description: "Test update",
        });
      }

      // // Add invoice item
      // await stripeCli.invoiceItems.create({
      //   invoice: invoice.id,
      //   amount: 100,
      //   currency: org.default_currency,
      //   customer: invoice.customer as string,
      //   description: `Usage for ${config.stripe_price_id}`,
      // });
    }
  }
};
