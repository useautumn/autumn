import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode, Reward, IntervalConfig, AttachConfig } from "@autumn/shared";
import Stripe from "stripe";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { generateId } from "@/utils/genUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getAlignedIntervalUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { getEarliestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { buildInvoiceMemoFromEntitlements } from "@/internal/invoices/invoiceMemoUtils.js";

// Get payment method

export const createStripeSub2 = async ({
  db,
  stripeCli,
  // customer,
  // org,
  // freeTrial,
  // invoiceOnly = false,
  attachParams,
  config,
  // finalizeInvoice = false,
  anchorToUnix,
  itemSet,
  earliestInterval,
}: {
  db: DrizzleCli;
  stripeCli: Stripe;
  // customer: Customer;
  // freeTrial: FreeTrial | null;
  // org: Organization;
  // invoiceOnly?: boolean;
  attachParams: AttachParams;
  config: AttachConfig;
  anchorToUnix?: number;
  itemSet: {
    subItems: Stripe.SubscriptionItem[];
    invoiceItems: any[];
    usageFeatures: string[];
  };
  earliestInterval?: IntervalConfig | null;
}) => {
  const { customer, invoiceOnly, freeTrial, org, now, reward } = attachParams;

  let paymentMethod = await getCusPaymentMethod({
    stripeCli,
    stripeId: customer.processor.id,
    errorIfNone: !invoiceOnly, // throw error if no payment method and invoiceOnly is false
  });

  let paymentMethodData = {};
  if (paymentMethod) {
    paymentMethodData = {
      default_payment_method: paymentMethod.id,
    };
  }

  const billingCycleAnchorUnix =
    anchorToUnix && earliestInterval
      ? getAlignedIntervalUnix({
          alignWithUnix: anchorToUnix,
          interval: earliestInterval.interval,
          intervalCount: earliestInterval.intervalCount ?? 1,
          now,
        })
      : undefined;

  // if (config.disableTrial) {
  //   attachParams.freeTrial = null;
  // }

  // console.log(
  //   "Billing cycle anchor unix",
  //   formatUnixToDateTime(billingCycleAnchorUnix)
  // );

  // const { items, prices, usageFeatures } = itemSet;

  // let subItems = items.filter(
  //   (i: any, index: number) =>
  //     prices[index].config!.interval !== BillingInterval.OneOff
  // );

  // let invoiceItems = items.filter(
  //   (i: any, index: number) =>
  //     prices[index].config!.interval === BillingInterval.OneOff
  // );

  const { subItems, invoiceItems, usageFeatures } = itemSet;

  try {
    const subscription = await stripeCli.subscriptions.create({
      ...paymentMethodData,
      customer: customer.processor.id,
      items: subItems as any,
      // items: subItems as any,
      billing_mode: { type: "flexible" },
      trial_end: freeTrialToStripeTimestamp({ freeTrial, now }),
      payment_behavior: "error_if_incomplete",
      add_invoice_items: invoiceItems,
      collection_method: invoiceOnly ? "send_invoice" : "charge_automatically",
      days_until_due: invoiceOnly ? 30 : undefined,
      billing_cycle_anchor: billingCycleAnchorUnix
        ? Math.floor(billingCycleAnchorUnix / 1000)
        : undefined,

      // coupon: reward ? reward.id : undefined,
      discounts: reward ? [{ coupon: reward.id }] : undefined,
      expand: ["latest_invoice"],

      trial_settings:
        freeTrial && !freeTrial.card_required
          ? {
              end_behavior: {
                missing_payment_method: "cancel",
              },
            }
          : undefined,
    });

    // console.log("Latest invoice:", subscription.latest_invoice);

    // subscription.latest_invoice = await stripeCli.invoices.retrieve(
    //   subscription.latest_invoice as string
    // );

    const latestInvoice = subscription.latest_invoice as Stripe.Invoice;

    if(invoiceOnly && org.config.invoice_memos && latestInvoice && latestInvoice.status === "draft") {
      const desc = await buildInvoiceMemoFromEntitlements({
        org,
        entitlements: attachParams.entitlements,
        features: attachParams.features,
      });
      await stripeCli.invoices.update(latestInvoice.id!, {
        description: desc,
      });
    }

    if (
      invoiceOnly &&
      config.invoiceCheckout &&
      config.finalizeInvoice &&
      latestInvoice &&
      latestInvoice.status === "draft"
    ) {
      subscription.latest_invoice = await stripeCli.invoices.finalizeInvoice(
        (subscription.latest_invoice as Stripe.Invoice).id!
      );
    }

    // Store
    const earliestPeriodEnd = getEarliestPeriodEnd({ sub: subscription });

    await SubService.createSub({
      db,
      sub: {
        id: generateId("sub"),
        stripe_id: subscription.id,
        stripe_schedule_id: subscription.schedule as string,
        created_at: subscription.created * 1000,
        usage_features: usageFeatures,
        org_id: org.id,
        env: customer.env,
        current_period_start: earliestPeriodEnd,
        current_period_end: earliestPeriodEnd,
      },
    });

    return subscription;
  } catch (error: any) {
    console.log("Warning: Failed to create stripe subscription");
    console.log("Error code:", error.code);
    console.log("Message:", error.message);
    console.log("Decline code:", error.decline_code);

    throw new RecaseError({
      code: ErrCode.CreateStripeSubscriptionFailed,
      message: `Create stripe subscription failed ${
        error.code ? `(${error.code})` : ""
      }: ${error.message || ""}`,
      statusCode: 500,
    });
  }
};
