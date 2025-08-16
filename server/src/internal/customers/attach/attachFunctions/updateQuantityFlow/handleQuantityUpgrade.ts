import {
  Feature,
  FeatureOptions,
  FullCusProduct,
  FullCustomerPrice,
  getFeatureInvoiceDescription,
  OnIncrease,
  UsagePriceConfig,
} from "@autumn/shared";

import { Stripe } from "stripe";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";

import {
  shouldBillNow,
  shouldProrate,
} from "@/internal/products/prices/priceUtils/prorationConfigUtils.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import { constructStripeInvoiceItem } from "@/internal/invoices/invoiceItemUtils/invoiceItemUtils.js";
import { cusProductToProduct } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { createAndFinalizeInvoice } from "@/internal/invoices/invoiceUtils/createAndFinalizeInvoice.js";
import { getRelatedCusEnt } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { Decimal } from "decimal.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";

export const handleQuantityUpgrade = async ({
  req,
  attachParams,
  cusProduct,
  stripeSubs,
  oldOptions,
  newOptions,
  cusPrice,
  stripeSub,
  subItem,
}: {
  req: any;
  attachParams: AttachParams;
  cusProduct: FullCusProduct;
  stripeSubs: Stripe.Subscription[];
  oldOptions: FeatureOptions;
  newOptions: FeatureOptions;
  cusPrice: FullCustomerPrice;
  stripeSub: Stripe.Subscription;
  subItem: Stripe.SubscriptionItem;
}) => {
  // Manually calculate prorations...
  const { features, org, logger, db } = req;
  const { stripeCli, now, paymentMethod } = attachParams;

  const difference = new Decimal(newOptions.quantity)
    .minus(oldOptions.quantity)
    .toNumber();

  const onIncrease =
    cusPrice.price.proration_config?.on_increase ||
    OnIncrease.ProrateImmediately;

  const prorate = shouldProrate(onIncrease);

  if (prorate) {
    const { start, end } = subToPeriodStartEnd({ sub: stripeSub });

    const amount = priceToInvoiceAmount({
      price: cusPrice.price,
      quantity: difference,
      proration: prorate
        ? {
            start: start * 1000,
            end: end * 1000,
          }
        : undefined,
      now,
    });

    const config = cusPrice.price.config as UsagePriceConfig;
    const billingUnits = config.billing_units;
    const feature = features.find(
      (f: Feature) => f.internal_id == newOptions.internal_feature_id
    )!;

    const product = cusProductToProduct({ cusProduct });
    const invoiceItem = constructStripeInvoiceItem({
      product,
      amount: amount,
      org: org,
      price: cusPrice.price,
      description: getFeatureInvoiceDescription({
        feature: feature,
        usage: newOptions.quantity,
        billingUnits,
        prodName: product.name,
        isPrepaid: true,
        fromUnix: now,
      }),
      stripeSubId: stripeSub.id,
      stripeCustomerId: stripeSub.customer as string,
      periodStart: Math.floor((now || Date.now()) / 1000),
      periodEnd: Math.floor(end * 1000),
    });

    logger.info(
      `🔥 Creating prepaid invoice item: ${invoiceItem.description} - ${amount}`
    );

    await stripeCli.invoiceItems.create(invoiceItem);

    if (shouldBillNow(onIncrease)) {
      const { invoice: finalInvoice } = await createAndFinalizeInvoice({
        stripeCli,
        stripeCusId: stripeSub.customer as string,
        stripeSubId: stripeSub.id,
        paymentMethod: paymentMethod || null,
        logger,
      });
    }
  }

  await stripeCli.subscriptionItems.update(subItem.id, {
    quantity: newOptions.quantity,
    proration_behavior: "none",
  });

  // Update cus ent
  const config = cusPrice.price.config as UsagePriceConfig;
  const billingUnits = config.billing_units || 1;
  let cusEnt = getRelatedCusEnt({
    cusPrice,
    cusEnts: cusProduct.customer_entitlements,
  });

  if (cusEnt) {
    const incrementBy = new Decimal(difference).mul(billingUnits).toNumber();
    logger.info(
      `🔥 Incrementing feature ${cusEnt.entitlement.feature.id} balance by ${incrementBy}`
    );
    await CusEntService.increment({
      db,
      id: cusEnt.id,
      amount: incrementBy,
    });
  }
};
