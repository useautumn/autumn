import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";

import { getExistingCusProducts } from "@/internal/customers/add-product/handleExistingProduct.js";

import { getPricesForCusProduct } from "@/internal/customers/change-product/scheduleUtils.js";
import { getDowngradePreview } from "@/internal/customers/previews/getDowngradePreview.js";
import { getNewProductPreview } from "@/internal/customers/previews/getNewProductPreview.js";
import { getUpgradePreview } from "@/internal/customers/previews/getUpgradePreview.js";
import { fullCusProductToProduct } from "@/internal/customers/products/cusProductUtils.js";
import {
  isFreeProduct,
  isOneOff,
  isProductUpgrade,
} from "@/internal/products/productUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import {
  AppEnv,
  Customer,
  Feature,
  FullCusProduct,
  FullCustomer,
  FullProduct,
  Organization,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

import {
  AttachPreviewType,
  CheckProductFormattedPreview,
} from "@autumn/shared";

export const getAttachPreview = async ({
  sb,
  customer,
  org,
  env,
  product,
  cusProducts,
  features,
  logger,
  shouldFormat = true,
}: {
  sb: SupabaseClient;
  customer: FullCustomer;
  org: Organization;
  env: AppEnv;
  product: FullProduct;
  cusProducts: FullCusProduct[];
  features: Feature[];
  logger: any;
  shouldFormat?: boolean;
}) => {
  let paymentMethod: any;
  try {
    paymentMethod = await getCusPaymentMethod({
      org,
      env: customer.env,
      stripeId: customer.processor?.id,
      errorIfNone: false,
    });

    if (!paymentMethod) {
      return null;
    }
  } catch (error) {
    return null;
  }

  let { curMainProduct, curScheduledProduct, curSameProduct }: any =
    await getExistingCusProducts({
      product,
      cusProducts: cusProducts || [],
      internalEntityId: customer.entity?.internal_id,
    });

  let curPrices = getPricesForCusProduct({
    cusProduct: curMainProduct,
  });

  if (curScheduledProduct?.product.id === product.id) {
    // title: "Scheduled product already exists",
    // message: "You already have this product scheduled to start soon.",
    let result: CheckProductFormattedPreview = {
      title: "Scheduled product already exists",
      message: "You already have this product scheduled to start soon.",
      scenario: AttachPreviewType.Scheduled,
      recurring: !isOneOff(product.prices),
      error_on_attach: true,
      product_id: product.id,
      product_name: product.name,
    };

    return result;
  } else if (curSameProduct) {
    if (!product.is_add_on && !curScheduledProduct && !isOneOff(curPrices)) {
      // title: "Product already attached",
      // message: "You already have this product attached.",
      let result: CheckProductFormattedPreview = {
        title: "Product already attached",
        message: "You already have this product attached.",
        scenario: AttachPreviewType.Active,
        recurring: !isOneOff(product.prices),
        error_on_attach: true,
        product_id: product.id,
        product_name: product.name,
      };

      return result;
    }
  }

  if (isFreeProduct(curPrices)) {
    curMainProduct = null;
  }

  // Case 1: No / free main product
  if (!curMainProduct || product.is_add_on) {
    // 1a. If both are free, no context
    if (isFreeProduct(product.prices)) {
      return null;
    } else {
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

      let result: CheckProductFormattedPreview = {
        title: `Renew subscription to ${curMainProduct.product.name}`,
        message,
        scenario: AttachPreviewType.Renew,
        product_id: product.id,
        product_name: product.name,
        recurring: !isOneOff(product.prices),
      };

      return result;
      // title: `Renew subscription to ${curMainProduct.product.name}`,
      // message,
      // html,
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
    return await getUpgradePreview({
      sb,
      customer,
      org,
      env,
      product,
      curMainProduct,
      logger,
      features,
    });
  } else {
    return await getDowngradePreview({
      customer,
      org,
      env,
      product,
      curMainProduct,
      curScheduledProduct,
    });
  }
};
