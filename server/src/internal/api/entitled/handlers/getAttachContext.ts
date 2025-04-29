import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { updateStripeSubscription } from "@/external/stripe/stripeSubUtils/updateStripeSub.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getExistingCusProducts } from "@/internal/customers/add-product/handleExistingProduct.js";
import {
  handleStripeSubUpdate,
  handleUpgrade,
} from "@/internal/customers/change-product/handleUpgrade.js";
import { getPricesForCusProduct } from "@/internal/customers/change-product/scheduleUtils.js";
import { getDowngradePreview } from "@/internal/customers/previews/getDowngradePreview.js";
import { getNewProductPreview } from "@/internal/customers/previews/getNewProductPreview.js";
import { getUpgradePreview } from "@/internal/customers/previews/getUpgradePreview.js";
import { fullCusProductToProduct } from "@/internal/customers/products/cusProductUtils.js";
import {
  isFreeProduct,
  isProductUpgrade,
} from "@/internal/products/productUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import {
  AppEnv,
  Customer,
  FullCusProduct,
  FullProduct,
  Organization,
} from "@autumn/shared";

// enum AttachContextCode {
//   AlreadyAttached,
// }

export const getAttachContext = async ({
  customer,
  org,
  env,
  product,
  cusProducts,
  paymentMethod,
}: {
  customer: Customer;
  org: Organization;
  env: AppEnv;
  product: FullProduct;
  cusProducts: FullCusProduct[];
  paymentMethod: any;
}) => {
  // Handle errors
  if (!paymentMethod) {
    return null;
  }

  let { curMainProduct, curScheduledProduct }: any =
    await getExistingCusProducts({
      product,
      cusProducts: cusProducts || [],
    });

  let curPrices = getPricesForCusProduct({
    cusProduct: curMainProduct,
  });

  // Handle errors
  if (curScheduledProduct?.product.id === product.id) {
    return {
      title: "Scheduled product already exists",
      message: "You already have this product scheduled to start soon.",
      error_on_attach: true,
    };
  } else if (
    curMainProduct?.product.id === product.id &&
    !curScheduledProduct
  ) {
    return {
      title: "Product already attached",
      message: "You already have this product attached.",
      error_on_attach: true,
    };
  }

  if (isFreeProduct(curPrices)) {
    curMainProduct = null;
  }

  // Case 1: No / free main product
  if (!curMainProduct) {
    // 1a. If both are free, no context
    if (isFreeProduct(product.prices)) {
      return null;
    } else {
      return await getNewProductPreview({
        customer,
        org,
        env,
        product,
        curMainProduct,
        curScheduledProduct,
        cusProducts,
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
      html = `<p>${message}</p>`;

      let scheduledIsFree = isFreeProduct(scheduledProduct.prices);
      if (!scheduledIsFree) {
        let scheduledMessage = `Your downgrade to ${scheduledProduct.name} which was scheduled to start on ${scheduledStart} will also be reversed.`;
        message += `\n\n${scheduledMessage}`;
        html += `<br/><p>${scheduledMessage}</p><br/>`;
      }

      return {
        title: `Renew subscription to ${curMainProduct.product.name}`,
        message,
        html,
      };
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
      customer,
      org,
      env,
      product,
      curMainProduct,
      curScheduledProduct,
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
