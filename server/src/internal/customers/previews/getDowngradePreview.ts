import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";
import {
  AppEnv,
  AttachScenario,
  FullCusProduct,
  FullProduct,
  Organization,
} from "@autumn/shared";

import { Customer } from "@autumn/shared";

export const getDowngradePreview = async ({
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
  // 1. Get latest period end:
  const curSubscriptions = await getStripeSubs({
    stripeCli,
    subIds: curMainProduct.subscription_ids!,
  });
  curSubscriptions.sort((a, b) => b.current_period_end - a.current_period_end);
  const latestPeriodEnd = curSubscriptions[0].current_period_end;

  let endDate = formatUnixToDate(latestPeriodEnd * 1000);
  let newProductFree = isFreeProduct(product.prices);

  let message = `By clicking confirm, your current subscription to ${
    curMainProduct.product.name
  } will end on ${endDate}${
    !newProductFree
      ? ` and a new subscription to ${product.name} will begin.`
      : "."
  }`;

  return {
    title: isFreeProduct(product.prices)
      ? `Cancel subscription to ${curMainProduct.product.name}`
      : `Downgrade to ${product.name}`,
    message,

    scenario: isFreeProduct(product.prices)
      ? AttachScenario.Cancel
      : AttachScenario.Downgrade,
    product_id: product.id,
    product_name: product.name,

    recurring: !isOneOff(product.prices),
    next_cycle_at: latestPeriodEnd * 1000,
    current_product_name: curMainProduct.product.name,

    error_on_attach: false,
  };
};
