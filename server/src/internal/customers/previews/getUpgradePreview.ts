import { isFreeProduct } from "@/internal/products/productUtils.js";
import {
  AppEnv,
  Customer,
  FullCusProduct,
  FullProduct,
  Organization,
} from "@autumn/shared";
import { AttachParams } from "../products/AttachParams.js";
import { handleStripeSubUpdate } from "../change-product/handleUpgrade.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import Stripe from "stripe";
import { billForRemainingUsages } from "../change-product/billRemainingUsages.js";
import { logger } from "@trigger.dev/sdk/v3";
import { formatCurrency, itemsToHtml } from "./previewUtils.js";

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

  let html = `<p>By clicking confirm, you will upgrade your plan to ${product.name} and the following amount ${addString}.</p>`;

  html += `<br/><ul>${itemsToHtml({ items: baseLineItems })}${itemsToHtml({
    items: usageLineItems,
  })}</ul><br/>`;

  html += `<p><strong style="font-size: 1.1em;">Total: ${formatCurrency({
    amount: totalAmount,
    defaultCurrency: org.default_currency,
  })}</strong></p>`;

  let message = `By clicking confirm, you will upgrade your plan to ${
    product.name
  } and ${formatCurrency({
    amount: totalAmount,
    defaultCurrency: org.default_currency,
  })} ${addString}.`;

  return { html, message };
};

export const getUpgradePreview = async ({
  customer,
  org,
  env,
  product,
  curMainProduct,
  curScheduledProduct,
}: {
  customer: Customer;
  org: Organization;
  env: AppEnv;
  product: FullProduct;
  curMainProduct: FullCusProduct;
  curScheduledProduct: FullCusProduct;
}) => {
  let stripeCli = createStripeCli({ org, env });
  // 1. Get update preview
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

  let formattedMessage = formatMessage({
    baseLineItems,
    usageLineItems,
    org,
    product,
  });

  return {
    title: `Upgrade to ${product.name}`,
    message: formattedMessage.message,
    html: formattedMessage.html,
    amount_due: Number(totalAmount.toFixed(2)),
    due_when: org.config.bill_upgrade_immediately
      ? "immediately"
      : "next_billing_cycle",
  };

  // console.log(formatInvoicePreview(updatePreview.lines.data));
  // console.log("Usage line items: ", usageLineItems);
};
