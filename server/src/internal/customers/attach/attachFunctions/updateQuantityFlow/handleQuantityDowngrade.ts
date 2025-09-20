import {
  calculateProrationAmount,
  Feature,
  FeatureOptions,
  FullCusProduct,
  getFeatureInvoiceDescription,
  OnDecrease,
  priceToInvoiceAmount,
  UsagePriceConfig,
} from "@autumn/shared";

import { Stripe } from "stripe";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { featureToCusPrice } from "@/internal/customers/cusProducts/cusPrices/convertCusPriceUtils.js";
import {
  shouldBillNow,
  shouldProrate,
} from "@/internal/products/prices/priceUtils/prorationConfigUtils.js";

import { Decimal } from "decimal.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { getRelatedCusEnt } from "@/internal/customers/cusProducts/cusPrices/cusPriceUtils.js";
import { getInvoiceItems } from "@/internal/invoices/invoiceUtils.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { constructStripeInvoiceItem } from "@/internal/invoices/invoiceItemUtils/invoiceItemUtils.js";
import { cusProductToProduct } from "@autumn/shared";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { createAndFinalizeInvoice } from "@/internal/invoices/invoiceUtils/createAndFinalizeInvoice.js";
import { notNullish } from "@/utils/genUtils.js";

const onDecreaseToStripeProration: Record<OnDecrease, string> = {
  [OnDecrease.ProrateImmediately]: "always_invoice",
  [OnDecrease.ProrateNextCycle]: "create_prorations",
  [OnDecrease.Prorate]: "create_prorations",
  [OnDecrease.None]: "none",
  [OnDecrease.NoProrations]: "none",
};

export const handleQuantityDowngrade = async ({
  req,
  attachParams,
  cusProduct,
  stripeSub,
  oldOptions,
  newOptions,
  subItem,
}: {
  req: any;
  attachParams: AttachParams;
  cusProduct: FullCusProduct;
  stripeSub: Stripe.Subscription;
  oldOptions: FeatureOptions;
  newOptions: FeatureOptions;
  subItem: Stripe.SubscriptionItem;
}) => {
  const { db, logger, org, features } = req;
  const { stripeCli, paymentMethod } = attachParams;

  const cusPrice = featureToCusPrice({
    internalFeatureId: newOptions.internal_feature_id!,
    cusPrices: cusProduct.customer_prices,
  })!;

  const onDecrease =
    cusPrice.price.proration_config?.on_decrease ||
    OnDecrease.ProrateImmediately;

  const difference = new Decimal(newOptions.quantity)
    .minus(oldOptions.quantity)
    .toNumber();

  const subItemDifference = new Decimal(newOptions.quantity)
    .minus(
      notNullish(oldOptions.upcoming_quantity)
        ? oldOptions.upcoming_quantity!
        : oldOptions.quantity
    )
    .toNumber();

  const billingUnits =
    (cusPrice.price.config as UsagePriceConfig).billing_units || 1;

  // const diffWithBillingUnits = new Decimal(difference)
  //   .mul((cusPrice.price.config as UsagePriceConfig).billing_units || 1)
  //   .toNumber();

  const newSubItemQuantity = new Decimal(subItem.quantity || 0)
    .plus(subItemDifference)
    .toNumber();

  const stripeProration = onDecreaseToStripeProration[
    onDecrease
  ] as Stripe.SubscriptionItemUpdateParams.ProrationBehavior;

  const createDowngradeInvoice = async () => {
    const { start, end } = subToPeriodStartEnd({ sub: stripeSub });

    const prevAmount = priceToInvoiceAmount({
      price: cusPrice.price,
      quantity: new Decimal(oldOptions.quantity).mul(billingUnits!).toNumber(),
    });

    const newAmount = priceToInvoiceAmount({
      price: cusPrice.price,
      quantity: new Decimal(newOptions.quantity).mul(billingUnits!).toNumber(),
    });

    let amount = new Decimal(newAmount).minus(prevAmount).toNumber();

    amount = calculateProrationAmount({
      periodEnd: end * 1000,
      periodStart: start * 1000,
      now: attachParams.now || Date.now(),
      amount,
      allowNegative: true,
    });

    const product = cusProductToProduct({ cusProduct });
    const feature = req.features.find(
      (f: Feature) => f.internal_id == newOptions.internal_feature_id
    )!;
    const invoiceItem = constructStripeInvoiceItem({
      product,
      amount: amount,
      org: req.org,
      price: cusPrice.price,
      description: getFeatureInvoiceDescription({
        feature: feature,
        usage: newOptions.quantity,
        billingUnits: (cusPrice.price.config as UsagePriceConfig).billing_units,
        prodName: product.name,
        isPrepaid: true,
        fromUnix: attachParams.now,
      }),
      stripeSubId: stripeSub.id,
      stripeCustomerId: stripeSub.customer as string,
      periodStart: Math.floor(
        attachParams.now ? attachParams.now / 1000 : Date.now()
      ),
      periodEnd: Math.floor(end * 1000),
    });

    logger.info(
      `🔥 Creating downgrade prepaid invoice item: ${invoiceItem.description} - ${amount}`
    );

    await stripeCli.invoiceItems.create(invoiceItem);

    if (shouldBillNow(onDecrease)) {
      const { invoice: finalInvoice } = await createAndFinalizeInvoice({
        stripeCli,
        stripeCusId: stripeSub.customer as string,
        stripeSubId: stripeSub.id,
        paymentMethod: paymentMethod || null,
        logger,
      });

      try {
        const invoiceItems = await getInvoiceItems({
          stripeInvoice: finalInvoice,
          prices: [cusPrice.price],
          logger,
        });

        await InvoiceService.createInvoiceFromStripe({
          db,
          stripeInvoice: finalInvoice,
          internalCustomerId: cusProduct.internal_customer_id!,
          internalEntityId: cusProduct.internal_entity_id,
          productIds: [cusProduct.product_id],
          internalProductIds: [cusProduct.internal_product_id],
          org,
          sendRevenueEvent: true,
          items: invoiceItems,
        });
      } catch (error) {
        logger.error(`Failed to create invoice from stripe: ${error}`);
      }
    }
  };

  await stripeCli.subscriptionItems.update(subItem.id, {
    quantity: Math.max(newSubItemQuantity, 0),
    // proration_behavior: stripeProration,
    proration_behavior: "none",
  });

  if (!shouldProrate(onDecrease)) {
    newOptions.upcoming_quantity = newOptions.quantity;
    newOptions.quantity = oldOptions.quantity;
    return;
  }

  await createDowngradeInvoice();

  const cusEnt = getRelatedCusEnt({
    cusPrice,
    cusEnts: cusProduct.customer_entitlements,
  });

  if (cusEnt) {
    const config = cusPrice.price.config as UsagePriceConfig;
    let decrementBy = new Decimal(oldOptions.quantity)
      .minus(new Decimal(newOptions.quantity))
      .mul(billingUnits)
      .toNumber();

    await CusEntService.decrement({
      db,
      id: cusEnt.id,
      amount: decrementBy,
    });
  }
};
