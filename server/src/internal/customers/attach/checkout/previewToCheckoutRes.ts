import {
  AttachPreview,
  CheckoutLine,
  CheckoutResponseSchema,
  ProductItemResponse,
} from "@autumn/shared";
import {} from "./CheckoutResponse.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { getAttachScenario } from "@/internal/api/entitled/handlers/attachToCheckPreview/getAttachScenario.js";
import {
  attachParamsToCurCusProduct,
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
import { notNullish } from "@/utils/genUtils.js";

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
  const scenario = await getAttachScenario({ preview, product });

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

  return CheckoutResponseSchema.parse({
    customer_id: attachParams.customer.id,
    scenario,
    lines,
    product: newProduct,
    current_product: curProduct,
    total,
    currency: org.default_currency || "usd",
    // next_cycle: nextCycle,
    next_cycle_at: notNullish(preview.due_next_cycle)
      ? preview.due_next_cycle.due_at
      : null,
  });
};
