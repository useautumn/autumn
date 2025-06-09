// import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
// import { isFreeProduct } from "@/internal/products/productUtils.js";
// import RecaseError from "@/utils/errorUtils.js";
// import { FullCusProduct, ErrCode } from "@autumn/shared";
// import { AttachParams } from "../../cusProducts/AttachParams.js";
// import { getOptionsToUpdate } from "../../archives/handleSameProduct.js";
// import { DrizzleCli } from "@/db/initDrizzle.js";

// export const handleSameAddOnProduct = async ({
//   db,
//   curSameProduct,
//   curMainProduct,
//   attachParams,
//   res,
// }: {
//   db: DrizzleCli;
//   curSameProduct: FullCusProduct;
//   curMainProduct: FullCusProduct | null;
//   attachParams: AttachParams;
//   res: any;
// }) => {
//   const { optionsList: newOptionsList, prices, products } = attachParams;

//   if (pricesOnlyOneOff(prices) || isFreeProduct(prices)) {
//     attachParams.curCusProduct = undefined;
//     return {
//       done: false,
//       curCusProduct: null,
//     };
//   }

//   let optionsToUpdate = getOptionsToUpdate(
//     curSameProduct.options,
//     newOptionsList,
//   );

//   if (optionsToUpdate.length > 0) {
//     throw new RecaseError({
//       message: `Updating add on product with new quantities is unavailable. Please contact hey@useautumn to access this feature.`,
//       code: ErrCode.InternalError,
//       statusCode: 500,
//     });

//     let messages: string[] = [];
//     for (const option of optionsToUpdate) {
//       messages.push(
//         `Updated quantity for ${option.new.feature_id} to ${option.new.quantity}`,
//       );
//     }
//   }

//   return {
//     done: false,
//     curCusProduct: null,
//   };
// };
