import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachConfig, FullProduct, Product, products } from "@autumn/shared";

export const getMergeCusProduct = async ({
  attachParams,
  products,
  config,
}: {
  attachParams: AttachParams;
  products: FullProduct[];
  config: AttachConfig;
}) => {
  const { stripeCli, cusProducts, freeTrial } = attachParams;

  let mergeCusProduct = undefined;
  if (!config.disableMerge && !freeTrial) {
    mergeCusProduct = cusProducts?.find((cp) =>
      products.some((p) => p.group == cp.product.group),
    );
  }

  let mergeSubs = await getStripeSubs({
    stripeCli,
    subIds: mergeCusProduct?.subscription_ids,
  });

  return {
    mergeCusProduct,
    mergeSubs,
  };
};
