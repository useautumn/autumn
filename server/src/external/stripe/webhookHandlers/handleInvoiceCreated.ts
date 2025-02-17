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
import { differenceInHours, format, subDays } from "date-fns";

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
      console.log(
        "Invalid number of active products for invoice.created: ",
        activeProducts.length
      );
      return;
    }

    const activeProduct = activeProducts[0];
    const customer = activeProduct.customer;

    if (
      Math.abs(
        differenceInHours(
          new Date(activeProduct.created_at),
          new Date(invoice.created * 1000)
        )
      ) < 1
    ) {
      console.log(
        "invoice.created: cus product created < an hour ago, skipping"
      );
      // Probably just created
      return;
    }

    // 1. Remove invoiceItem from stripe
    // Get cus ents
    const cusProductWithEntsAndPrices =
      await CusProductService.getEntsAndPrices({
        sb,
        cusProductId: activeProduct.id,
      });

    const cusEnts = cusProductWithEntsAndPrices.customer_entitlements;
    const cusPrices = cusProductWithEntsAndPrices.customer_prices;

    const stripeCli = createStripeCli({ org, env });
    const sub = await stripeCli.subscriptions.retrieve(
      invoice.subscription as string
    );

    for (const cusPrice of cusPrices) {
      const price = cusPrice.price;
      const config = price.config as UsagePriceConfig;

      if (getBillingType(price.config.type) !== BillingType.UsageInArrear) {
        continue;
      }

      // Calculate usage
      const relatedCusEnt = cusEnts.find(
        (ent: any) => ent.internal_feature_id === config.internal_feature_id
      );

      if (!relatedCusEnt) {
        continue;
      }

      const usage = relatedCusEnt.entitlement.allowance - relatedCusEnt.balance;

      const usageTimestamp = Math.round(
        subDays(new Date(invoice.created * 1000), 7).getTime() / 1000
      );

      await stripeCli.billing.meterEvents.create({
        event_name: price.id!,
        payload: {
          stripe_customer_id: customer.processor.id,
          value: Math.round(usage).toString(),
        },
        timestamp: usageTimestamp,
      });

      console.log(`Submitted meter event for ${customer.name}, ${customer.id}`);
      console.log(
        "Invoice created: ",
        format(new Date(invoice.created * 1000), "yyyy-MM-dd"),
        "Usage timestamp: ",
        format(new Date(usageTimestamp * 1000), "yyyy-MM-dd")
      );
      console.log(`${relatedCusEnt.entitlement.feature_id} - ${usage}`);

      // reset balance
      await CustomerEntitlementService.update({
        sb,
        id: relatedCusEnt.id,
        updates: {
          balance: relatedCusEnt.entitlement.allowance,
          adjustment: 0,
        },
      });
    }
  }
};
