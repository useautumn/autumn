import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { FullCusProduct, ErrCode } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { AttachParams } from "../../products/AttachParams.js";
import { getOptionsToUpdate } from "../handleSameProduct.js";

export const handleSameAddOnProduct = async ({
  sb,
  curSameProduct,
  curMainProduct,
  attachParams,
  res,
}: {
  sb: SupabaseClient;
  curSameProduct: FullCusProduct;
  curMainProduct: FullCusProduct | null;
  attachParams: AttachParams;
  res: any;
}) => {
  const { optionsList: newOptionsList, prices, products } = attachParams;

  if (pricesOnlyOneOff(prices) || isFreeProduct(prices)) {
    attachParams.curCusProduct = undefined;
    return {
      done: false,
      curCusProduct: null,
    };
  }

  let optionsToUpdate = getOptionsToUpdate(
    curSameProduct.options,
    newOptionsList,
  );

  if (optionsToUpdate.length > 0) {
    throw new RecaseError({
      message: `Updating add on product with new quantities is unavailable. Please contact hey@useautumn to access this feature.`,
      code: ErrCode.InternalError,
      statusCode: 500,
    });

    let messages: string[] = [];
    for (const option of optionsToUpdate) {
      messages.push(
        `Updated quantity for ${option.new.feature_id} to ${option.new.quantity}`,
      );
    }
  }

  return {
    done: false,
    curCusProduct: null,
  };

  // if (optionsToUpdate.length === 0) {
  //   throw new RecaseError({
  //     message: `Customer already has add-on product ${product.name}, can't attach again`,
  //     code: ErrCode.CustomerAlreadyHasProduct,
  //     statusCode: 400,
  //   });
  // }

  // throw new RecaseError({
  //   message:
  //     "Updating add on product quantity is feature flagged -- please contact hey@useautumn to enable it for this account!",
  //   code: ErrCode.InternalError,
  //   statusCode: 500,
  // });
};
