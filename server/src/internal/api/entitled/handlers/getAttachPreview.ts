import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";

import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";

import { getPricesForCusProduct } from "@/internal/customers/change-product/scheduleUtils.js";
import { getDowngradePreview } from "@/internal/customers/previews/getDowngradePreview.js";
import { getNewProductPreview } from "@/internal/customers/previews/getNewProductPreview.js";
import { getUpgradePreview } from "@/internal/customers/previews/getUpgradePreview.js";
import { fullCusProductToProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";
import {
  isFreeProduct,
  isOneOff,
  isProductUpgrade,
} from "@/internal/products/productUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import {
  AppEnv,
  BillingType,
  Customer,
  Feature,
  FullCusProduct,
  FullCustomer,
  FullProduct,
  Organization,
} from "@autumn/shared";

import { AttachScenario, CheckProductPreview } from "@autumn/shared";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";

export const getAttachPreview = async ({
  db,
  customer,
  org,
  env,
  product,
  cusProducts,
  features,
  logger,
  shouldFormat = true,
}: {
  db: DrizzleCli;
  customer: FullCustomer;
  org: Organization;
  env: AppEnv;
  product: FullProduct;
  cusProducts: FullCusProduct[];
  features: Feature[];
  logger: any;
  shouldFormat?: boolean;
}) => {
  const stripeCli = createStripeCli({ org, env });

  let paymentMethod: any = null;
  if (customer.processor?.id) {
    paymentMethod = await getCusPaymentMethod({
      stripeCli,
      stripeId: customer.processor?.id,
      errorIfNone: false,
    });
  }

  let { curMainProduct, curScheduledProduct, curSameProduct }: any =
    getExistingCusProducts({
      product,
      cusProducts: cusProducts || [],
      internalEntityId: customer.entity?.internal_id,
    });

  let curPrices = getPricesForCusProduct({
    cusProduct: curMainProduct,
  });

  if (curScheduledProduct?.product.id === product.id) {
    let result: CheckProductPreview = {
      title: "Scheduled product already exists",
      message: "You already have this product scheduled to start soon.",
      scenario: AttachScenario.Scheduled,
      recurring: !isOneOff(product.prices),
      error_on_attach: true,
      product_id: product.id,
      product_name: product.name,
      current_product_name: curMainProduct?.product?.name,
      next_cycle_at: curScheduledProduct.starts_at,
      payment_method: paymentMethod,
    };

    return result;
  } else if (curSameProduct) {
    if (!product.is_add_on && !curScheduledProduct && !isOneOff(curPrices)) {
      let result: CheckProductPreview = {
        title: "Product already attached",
        message: "You already have this product attached.",
        scenario: AttachScenario.Active,
        recurring: !isOneOff(product.prices),
        error_on_attach: true,
        product_id: product.id,
        product_name: product.name,
        payment_method: paymentMethod,
      };

      return result;
    }
  }

  if (isFreeProduct(curPrices)) {
    curMainProduct = null;
  }

  // Case 1: No / free main product
  let prodContainsPrepaid = product.prices.some(
    (p) => getBillingType(p.config) == BillingType.UsageInAdvance,
  );

  if (!curMainProduct || product.is_add_on) {
    // 1a. If both are free, no context
    if (isFreeProduct(product.prices)) {
      return null;
    } else {
      if (!prodContainsPrepaid && !paymentMethod) {
        return null;
      }

      return await getNewProductPreview({
        org,
        product,
        features,
      });
    }
  }

  // Case 2: current and new are same products
  if (curMainProduct?.product.id === product.id) {
    // 2a. If there's a scheduled product

    if (curScheduledProduct) {
      let scheduledProduct = fullCusProductToProduct(curScheduledProduct);
      let scheduledStart = formatUnixToDate(curScheduledProduct?.starts_at);
      let canceledAt = formatUnixToDate(curMainProduct?.canceled_at);

      let message, html;
      message = `Clicking 'confirm' will renew your subscription to ${curMainProduct.product.name}, and you will be continue to be charged on ${scheduledStart}.`;

      let scheduledIsFree = isFreeProduct(scheduledProduct.prices);
      if (!scheduledIsFree) {
        let scheduledMessage = `Your downgrade to ${scheduledProduct.name} which was scheduled to start on ${scheduledStart} will also be reversed.`;
        message += `\n\n${scheduledMessage}`;
      }

      // Get

      let result: CheckProductPreview = {
        title: `Renew subscription to ${curMainProduct.product.name}`,
        message,
        scenario: AttachScenario.Renew,
        product_id: product.id,
        product_name: product.name,
        recurring: !isOneOff(product.prices),
        payment_method: paymentMethod,
      };

      return result;
    }
    // 2b. Can't attach same product
    else return null;
  }

  // Case 3: Current and new products are different
  let isUpgrade = isProductUpgrade({
    prices1: curPrices,
    prices2: product.prices,
  });

  if (isUpgrade) {
    let result = await getUpgradePreview({
      db,
      customer,
      paymentMethod,
      org,
      env,
      product,
      curMainProduct,
      logger,
      features,
    });

    return {
      ...result,
      payment_method: paymentMethod,
    };
  } else {
    let result = await getDowngradePreview({
      customer,
      org,
      env,
      product,
      curMainProduct,
      curScheduledProduct,
    });

    return {
      ...result,
      payment_method: paymentMethod,
    };
  }
};
