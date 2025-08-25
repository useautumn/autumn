import RecaseError from "@/utils/errorUtils.js";
import {
  AttachParams,
  AttachResultSchema,
} from "../cusProducts/AttachParams.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { pricesContainRecurring } from "@/internal/products/prices/priceUtils.js";
import { createCheckoutMetadata } from "@/internal/metadata/metadataUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import {
  getStripeSubItems,
  getStripeSubItems2,
} from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { ErrCode } from "@/errors/errCodes.js";
import { getNextStartOfMonthUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { APIVersion, AttachConfig } from "@autumn/shared";
import { SuccessCode } from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";

import Stripe from "stripe";

export const handleCreateCheckout = async ({
  req,
  res,
  attachParams,
  config,
  returnCheckout = false,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  config: AttachConfig;
  returnCheckout?: boolean;
}) => {
  const { db, logtail: logger } = req;

  const { customer, org, freeTrial, successUrl, reward } = attachParams;

  const stripeCli = createStripeCli({
    org,
    env: customer.env,
    legacyVersion: true,
  });

  const itemSets = await getStripeSubItems({
    attachParams,
    isCheckout: true,
  });

  if (itemSets.length === 0) {
    throw new RecaseError({
      code: ErrCode.ProductHasNoPrices,
      message: "Product has no prices",
    });
  }

  const { items } = itemSets[0];

  attachParams.itemSets = itemSets;

  const isRecurring = pricesContainRecurring(attachParams.prices);

  // Insert metadata
  const metaId = await createCheckoutMetadata({
    db,
    attachParams,
  });

  let billingCycleAnchorUnixSeconds = org.config.anchor_start_of_month
    ? Math.floor(
        getNextStartOfMonthUnix({
          interval: itemSets[0].interval,
          intervalCount: itemSets[0].intervalCount,
        }) / 1000
      )
    : undefined;

  if (attachParams.billingAnchor) {
    billingCycleAnchorUnixSeconds = Math.floor(
      attachParams.billingAnchor / 1000
    );
  }

  const subscriptionData:
    | Stripe.Checkout.SessionCreateParams.SubscriptionData
    | undefined = isRecurring
    ? {
        trial_end:
          freeTrial && !attachParams.disableFreeTrial
            ? freeTrialToStripeTimestamp({ freeTrial })
            : undefined,
        trial_settings:
          freeTrial && !attachParams.disableFreeTrial && freeTrial.card_required
            ? {
                end_behavior: {
                  missing_payment_method: "cancel",
                },
              }
            : undefined,
        billing_cycle_anchor: billingCycleAnchorUnixSeconds,
      }
    : undefined;

  let checkoutParams = attachParams.checkoutSessionParams || {};
  let allowPromotionCodes =
    notNullish(checkoutParams.discounts) || notNullish(reward)
      ? undefined
      : checkoutParams.allow_promotion_codes || true;

  let rewardData = {};
  if (reward) {
    rewardData = {
      discounts: [{ coupon: reward.id }],
    };
  }

  // Prepare checkout session parameters
  let checkout;

  let paymentMethodSet =
    notNullish(checkoutParams.payment_method_types) ||
    notNullish(checkoutParams.payment_method_configuration);

  const sessionParams = {
    customer: customer.processor.id,
    line_items: items,
    subscription_data: subscriptionData,
    mode: isRecurring ? "subscription" : "payment",
    currency: org.default_currency,
    success_url: successUrl || org.stripe_config!.success_url,

    allow_promotion_codes: allowPromotionCodes,
    invoice_creation: !isRecurring ? { enabled: true } : undefined,
    saved_payment_method_options: { payment_method_save: "enabled" },
    ...rewardData,
    ...(attachParams.checkoutSessionParams || {}),
    metadata: {
      ...(attachParams.metadata ? attachParams.metadata : {}),
      ...(attachParams.checkoutSessionParams?.metadata || {}),
      autumn_metadata_id: metaId,
    },
    payment_method_collection:
      freeTrial &&
      !attachParams.disableFreeTrial &&
      freeTrial.card_required === false
        ? "if_required"
        : undefined,
  } satisfies Stripe.Checkout.SessionCreateParams;

  try {
    checkout = await stripeCli.checkout.sessions.create(sessionParams);
    logger.info(
      `✅ Successfully created checkout for customer ${customer.id || customer.internal_id}`
    );
  } catch (error: any) {
    let msg = error.message;
    if (
      msg &&
      msg.includes("No valid payment method types") &&
      !paymentMethodSet
    ) {
      checkout = await stripeCli.checkout.sessions.create({
        ...sessionParams,
        payment_method_types: ["card"],
      });

      logger.info(
        `✅ Created fallback checkout session with card payment method for customer ${customer.id || customer.internal_id}`
      );
    } else {
      throw error;
    }
  }

  if (returnCheckout) {
    return checkout;
  }

  let apiVersion = attachParams.apiVersion || APIVersion.v1;
  if (apiVersion >= APIVersion.v1_1) {
    res.status(200).json(
      AttachResultSchema.parse({
        checkout_url: checkout.url,
        code: SuccessCode.CheckoutCreated,
        message: `Successfully created checkout for customer ${
          customer.id || customer.internal_id
        }, product(s) ${attachParams.products.map((p) => p.name).join(", ")}`,
        product_ids: attachParams.products.map((p) => p.id),
        customer_id: customer.id || customer.internal_id,
      })
    );
  } else {
    res.status(200).json({
      checkout_url: checkout.url,
    });
  }
  return;
};
