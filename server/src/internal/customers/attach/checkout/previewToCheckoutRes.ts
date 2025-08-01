import {
  AttachPreview,
  CheckoutLine,
  CheckoutResponseSchema,
  UsageModel,
} from "@autumn/shared";

import { AttachParams } from "../../cusProducts/AttachParams.js";
import {
  attachParamsToProduct,
  attachParamToCusProducts,
} from "../attachUtils/convertAttachParams.js";
import {
  cusProductToEnts,
  cusProductToPrices,
  cusProductToProduct,
} from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  getProductItemResponse,
  getProductResponse,
} from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { toProductItem } from "@/internal/products/product-items/mapToItem.js";
import { getPriceEntitlement } from "@/internal/products/prices/priceUtils.js";
import { formatUnixToDateTime, notNullish } from "@/utils/genUtils.js";
import { isPriceItem } from "@/internal/products/product-items/productItemUtils/getItemType.js";
import { Decimal } from "decimal.js";

export const previewToCheckoutRes = async ({
  req,
  attachParams,
  preview,
}: {
  req: ExtendedRequest;
  attachParams: AttachParams;
  preview: AttachPreview;
}) => {
  const { logger, features, org } = req;
  const product = attachParamsToProduct({ attachParams });

  const { curCusProduct } = attachParamToCusProducts({ attachParams });
  let curPrices = curCusProduct
    ? cusProductToPrices({ cusProduct: curCusProduct })
    : [];
  let curEnts = curCusProduct
    ? cusProductToEnts({ cusProduct: curCusProduct })
    : [];

  let newPrices = attachParams.prices;
  let newEnts = attachParams.entitlements;
  let allPrices = [...curPrices, ...newPrices];
  let allEnts = [...curEnts, ...newEnts];
  let lines: CheckoutLine[] = [];

  if (preview.due_today && preview.due_today.line_items.length > 0) {
    lines = preview.due_today.line_items
      .map((li: any) => {
        let price = allPrices.find((p) => p.id == li.price_id);

        if (!price) {
          return null;
        }

        let ent = getPriceEntitlement(price, allEnts);

        return {
          description: li.description || "",
          amount: li.amount || 0,
          item: getProductItemResponse({
            item: toProductItem({ ent, price }),
            features,
            currency: org.default_currency,
            withDisplay: true,
            options: attachParams.optionsList,
          }),
        };
      })
      .filter(notNullish) as CheckoutLine[];
  }

  const newProduct = await getProductResponse({
    product,
    features,
    currency: org.default_currency,
    options: attachParams.optionsList,
    fullCus: attachParams.customer,
  });

  let curProduct = curCusProduct
    ? await getProductResponse({
        product: cusProductToProduct({ cusProduct: curCusProduct }),
        features,
        currency: org.default_currency,
        options: curCusProduct?.options,
      })
    : null;

  const total = lines.reduce((acc, line) => acc + line.amount, 0);

  let nextCycle = undefined;

  if (notNullish(preview.due_next_cycle)) {
    nextCycle = {
      starts_at: preview.due_next_cycle.due_at,
      total: newProduct.items
        .reduce((acc, item) => {
          if (item.usage_model == UsageModel.PayPerUse) {
            return acc;
          }

          // if (item.interval !== newProduct.properties?.interval_group) {
          //   return acc;
          // }

          if (isPriceItem(item)) {
            return acc.plus(item.price || 0);
          }

          let prepaidQuantity =
            attachParams.optionsList.find(
              (o) => o.feature_id == item.feature_id
            )?.quantity || 0;

          return acc.plus(prepaidQuantity * (item.price || 0));
        }, new Decimal(0))
        .toNumber(),
    };
  }

  return CheckoutResponseSchema.parse({
    customer_id: attachParams.customer.id,
    lines,
    product: newProduct,
    current_product: curProduct,
    total,
    currency: org.default_currency || "usd",
    next_cycle_at: notNullish(preview.due_next_cycle)
      ? preview.due_next_cycle.due_at
      : null,
    next_cycle: nextCycle,
  });
};
