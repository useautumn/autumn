import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachBody } from "../models/AttachBody.js";
import { notNullish } from "@/utils/genUtils.js";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import { getExistingCusProducts } from "../../cusProducts/cusProductUtils/getExistingCusProducts.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { cusProductToPrices } from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { AttachFlags } from "../models/AttachContext.js";

/*
SCENARIOS:

1. Multi product attach: check for errors and allow attach...
2. 
*/

// export const handleCurrentCusProduct = async ({
//   req,
//   attachBody,
//   attachParams,
// }: {
//   req: ExtendedRequest;
//   attachBody: AttachBody;
//   attachParams: AttachParams;
// }) => {
//   const isMultiProduct = notNullish(attachBody.product_ids);

//   const attachFlags: AttachFlags = {
//     isMultiProduct: isMultiProduct,
//     isCustom: attachBody.is_custom,
//     hasPm: false, // TODO:
//     hasMainProduct: false, // TODO:
//     hasSameProduct: false, // TODO:
//     hasScheduledProduct: false, // TODO:
//   };

//   // 1. Handle multi product case
//   if (isMultiProduct) {
//     await checkMultiProductErrors({
//       attachParams,
//     });
//     return;
//   }

//   // 2. Get scenario?
//   let product = attachParams.products[0];

//   let { curMainProduct, curSameProduct, curScheduledProduct } =
//     getExistingCusProducts({
//       product,
//       cusProducts: attachParams.cusProducts!,
//     });
// };
