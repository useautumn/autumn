import {
  checkStripeProductExists,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import {
  AppEnv,
  Customer,
  Feature,
  FullCusProduct,
  FullProduct,
  Organization,
  UsageModel,
} from "@autumn/shared";
import { AttachParams } from "../products/AttachParams.js";
import { handleStripeSubUpdate } from "../change-product/handleUpgrade.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import Stripe from "stripe";
import { billForRemainingUsages } from "../change-product/billRemainingUsages.js";
import { logger } from "@trigger.dev/sdk/v3";
import { formatCurrency, itemsToHtml } from "./previewUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import { isFeaturePriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { getOptions } from "@/internal/api/entitled/checkUtils.js";
import { isPriceItem } from "@/internal/products/product-items/getItemType.js";

export const isAddProductFlow = ({
  curCusProduct,
  attachParams,
}: {
  curCusProduct: FullCusProduct;
  attachParams: AttachParams;
}) => {
  // 1. If current product has trial and new product has trial, cancel and start new subscription
  let trialToTrial =
    curCusProduct.trial_ends_at &&
    curCusProduct.trial_ends_at > Date.now() &&
    attachParams.freeTrial;
  // !disableFreeTrial;

  // let trialToPaid =
  //   curCusProduct.trial_ends_at &&
  //   curCusProduct.trial_ends_at > Date.now() &&
  //   !attachParams.freeTrial &&
  //   !newVersion; // Only carry over trial if migrating from one version to another...

  // // 2. If upgrade is free to paid, or paid to free (migration / update)
  // let toFreeProduct = isFreeProduct(attachParams.prices);
  // let paidToFreeProduct =
  //   isFreeProduct(curCusProduct.customer_prices.map((cp) => cp.price)) &&
  //   !isFreeProduct(attachParams.prices);

  // if (trialToTrial || trialToPaid || toFreeProduct || paidToFreeProduct) {
  //   if (trialToTrial) {
  //     logger.info(
  //       `Upgrading from trial to trial, cancelling and starting new subscription`
  //     );
  //   } else if (toFreeProduct) {
  //     logger.info(
  //       `switching to free product, cancelling (if needed) and adding free product`
  //     );
  //   }
  // }
};

const formatMessage = ({
  baseLineItems,
  usageLineItems,
  org,
  product,
}: {
  baseLineItems: any;
  usageLineItems: any;
  org: Organization;
  product: FullProduct;
}) => {
  let totalAmount = baseLineItems.reduce(
    (acc: number, item: any) => acc + item.amount,
    0
  );
  totalAmount += usageLineItems.reduce(
    (acc: number, item: any) => acc + item.amount,
    0
  );

  let addString = org.config.bill_upgrade_immediately
    ? "will be charged to your card immediately"
    : "will be added to your next bill";

  // ${formatCurrency({
  //   amount: totalAmount,
  //   defaultCurrency: org.default_currency,
  // })}

  let message = `By clicking confirm, you will upgrade your plan to ${product.name} and the following amount ${addString}:\n`;

  // for (let item of baseLineItems) {
  //   message += `\n${item.description}: ${formatCurrency({
  //     amount: item.amount,
  //     defaultCurrency: org.default_currency,
  //   })}`;
  // }

  // for (let item of usageLineItems) {
  //   message += `\n${item.description}: ${formatCurrency({
  //     amount: item.amount,
  //     defaultCurrency: org.default_currency,
  //   })}`;
  // }

  return { message };
};

const createStripeProductAndPrices = async ({
  sb,
  org,
  env,
  product,
  logger,
}: {
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  product: FullProduct;
  logger: any;
}) => {
  if (!product.processor?.id) {
    await checkStripeProductExists({
      sb,
      org,
      env,
      product,
      logger,
    });
  }

  let batchPriceUpdates = [];
  for (let price of product.prices) {
    let stripeCli = createStripeCli({ org, env });
    if (!price.config?.stripe_price_id) {
      batchPriceUpdates.push(
        createStripePriceIFNotExist({
          sb,
          stripeCli,
          price,
          entitlements: product.entitlements,
          product,
          org,
          logger,
        })
      );
    }
  }

  await Promise.all(batchPriceUpdates);
};

export const getUpgradePreview = async ({
  sb,
  customer,
  org,
  env,
  product,
  curMainProduct,
  features,
  logger,
}: {
  sb: SupabaseClient;
  customer: Customer;
  org: Organization;
  env: AppEnv;
  product: FullProduct;
  curMainProduct: FullCusProduct;
  features: Feature[];
  logger: any;
}) => {
  // Create stripe product / prices if not exist
  await createStripeProductAndPrices({
    sb,
    org,
    env,
    product,
    logger,
  });

  let stripeCli = createStripeCli({ org, env });
  let stripeSubs = await getStripeSubs({
    stripeCli,
    subIds: curMainProduct.subscription_ids,
  });

  let attachParams = {
    org,
    customer,
    products: [product],
    prices: product.prices,
    entitlements: product.entitlements,
    freeTrial: product.free_trial || null,
    optionsList: [],
    entities: [],
  };

  let updatePreview = (await handleStripeSubUpdate({
    sb: null,
    stripeCli,
    curCusProduct: curMainProduct,
    attachParams,
    stripeSubs,
    logger: null,
    carryExistingUsages: false,
    shouldPreview: true,
  })) as any;

  let baseLineItems = updatePreview.lines.data.map((item: any) => {
    return {
      amount: item.amount / 100,
      description: item.description,
    };
  });

  let usageLineItems =
    (await billForRemainingUsages({
      logger: console,
      sb: null,
      attachParams,
      curCusProduct: curMainProduct,
      newSubs: stripeSubs,
      shouldPreview: true,
    })) || [];

  let totalAmount = baseLineItems.reduce(
    (acc: number, item: any) => acc + item.amount,
    0
  );

  totalAmount += usageLineItems.reduce(
    (acc: number, item: any) => acc + item.amount,
    0
  );

  let items = [...baseLineItems, ...usageLineItems].map((item) => {
    return {
      price: formatCurrency({
        amount: item.amount,
        defaultCurrency: org.default_currency,
      }),
      description: item.description,
    };
  });

  let formattedMessage = formatMessage({
    baseLineItems,
    usageLineItems,
    org,
    product,
  });

  // Get options
  let prodItems = mapToProductItems({
    prices: product.prices,
    entitlements: product.entitlements,
    features,
  });
  let options = getOptions({
    prodItems,
    features,
  });

  let proratedAmount = totalAmount;
  let regularAmount = prodItems
    .filter((i) => isPriceItem(i))
    .reduce((sum, i) => sum + i.price!, 0);

  let dueToday, dueNextCycle;
  if (org.config.bill_upgrade_immediately) {
    dueToday = Number(proratedAmount.toFixed(2));
    dueNextCycle = Number(regularAmount.toFixed(2));
  } else {
    dueToday = 0;
    dueNextCycle = Number((proratedAmount + regularAmount).toFixed(2));
  }
  return {
    title: `Upgrade to ${product.name}`,
    message: formattedMessage.message,
    items,
    // amount_due: Number(totalAmount.toFixed(2)),
    // total: totalAmount,
    options,
    due_today: {
      price: dueToday,
      currency: org.default_currency || "USD",
    },
    due_next_cycle: {
      price: dueNextCycle,
      currency: org.default_currency || "USD",
    },
  };
};
