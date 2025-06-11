import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getFirstInterval } from "@/internal/products/prices/priceUtils/priceIntervalUtils.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import Stripe from "stripe";
import { attachParamsToProduct } from "./convertAttachParams.js";

export const getCycleWillReset = ({
  attachParams,
  stripeSubs,
}: {
  attachParams: AttachParams;
  stripeSubs: Stripe.Subscription[];
}) => {
  const product = attachParamsToProduct({ attachParams });
  const firstInterval = getFirstInterval({ prices: product.prices });
  const prevInterval = subToAutumnInterval(stripeSubs[0]);
  return prevInterval !== firstInterval;
};
