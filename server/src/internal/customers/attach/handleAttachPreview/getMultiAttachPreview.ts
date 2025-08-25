import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachBody, PreviewLineItem } from "@autumn/shared";
import { getCustomerSub } from "../attachUtils/convertAttachParams.js";
import { isArrearPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import {
  cusProductsToPrices,
  cusProductToPrices,
} from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { priceToUnusedPreviewItem } from "../attachPreviewUtils/priceToUnusedPreviewItem.js";
import { handleMultiAttachErrors } from "../attachUtils/handleAttachErrors/handleMultiAttachErrors.js";

export const getMultiAttachPreview = async ({
  req,
  attachBody,
  attachParams,
  logger,
  config,
}: {
  req: ExtendedRequest;
  attachBody: AttachBody;
  attachParams: AttachParams;
  logger: any;
  config: any;
}) => {
  await handleMultiAttachErrors({ attachParams, attachBody });

  const { customer } = attachParams;
  const cusProducts = customer.customer_products;
  const { sub } = await getCustomerSub({ attachParams });

  let items: PreviewLineItem[] = [];
  const subItems = sub?.items.data || [];
  const prices = cusProductsToPrices({ cusProducts });

  for (const price of prices) {
    const previewLineItem = priceToUnusedPreviewItem({
      price,
      stripeItems: subItems,
      cusProduct: cusProducts[0],
    });
  }

  // for (const cusProduct of cusProducts) {
  //   const prices = cusProductToPrices({ cusProduct });

  //   for (const price of prices) {
  //     const previewLineItem = priceToUnusedPreviewItem({
  //       price,
  //       stripeItems: subItems,
  //       cusProduct,
  //     });

  //     if (!previewLineItem) continue;

  //     items.push(previewLineItem);
  //   }
  // }

  console.log("items: ", items);
};
