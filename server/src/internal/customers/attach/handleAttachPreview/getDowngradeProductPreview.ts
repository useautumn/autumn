import { mapToProductItems } from "@/internal/products/productV2Utils.js";
import { getItemsForNewProduct } from "@/internal/invoices/previewItemUtils/getItemsForNewProduct.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import {
  attachParamsToProduct,
  attachParamToCusProducts,
} from "../attachUtils/convertAttachParams.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { getOptions } from "@/internal/api/entitled/checkUtils.js";
import { UsageModel } from "@autumn/shared";

export const getDowngradeProductPreview = async ({
  attachParams,
  now,
  logger,
}: {
  attachParams: AttachParams;
  now: number;
  logger: any;
}) => {
  const newProduct = attachParamsToProduct({ attachParams });

  const { curMainProduct } = attachParamToCusProducts({ attachParams });
  const stripeSubs = await getStripeSubs({
    stripeCli: attachParams.stripeCli,
    subIds: curMainProduct?.subscription_ids || [],
  });

  const anchorToUnix = stripeSubs[0].current_period_end * 1000;

  let items = await getItemsForNewProduct({
    newProduct,
    attachParams,
    now,
    logger,
  });

  items = items.filter((item) => item.usage_model !== UsageModel.Prepaid);

  let options = getOptions({
    prodItems: mapToProductItems({
      prices: newProduct.prices,
      entitlements: newProduct.entitlements,
      features: attachParams.features,
    }),
    features: attachParams.features,
    // anchorToUnix,
  });

  return {
    currency: attachParams.org.default_currency,
    due_next_cycle: {
      line_items: items,
      due_at: anchorToUnix,
    },

    options,
  };
};
