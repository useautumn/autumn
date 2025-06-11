// import { createStripeCli } from "@/external/stripe/utils.js";
// import { ProductService } from "@/internal/products/ProductService.js";
// import { isProductUpgrade } from "@/internal/products/productUtils.js";
// import { ErrCode, FullCusProduct } from "@autumn/shared";
// import { AttachParams } from "../cusProducts/AttachParams.js";
// import { handleUpgrade } from "./handleUpgrade.js";
// import { StatusCodes } from "http-status-codes";
// import { getPricesForCusProduct } from "./scheduleUtils.js";
// import { cancelScheduledProductIfExists } from "./changeProductUtils.js";
// import RecaseError from "@/utils/errorUtils.js";

// export const handleChangeProduct = async ({
//   req,
//   res,
//   attachParams,
//   curCusProduct,
// }: {
//   req: any;
//   res: any;
//   attachParams: AttachParams;
//   curCusProduct: FullCusProduct;
// }) => {
//   // Get subscription
//   const curProduct = curCusProduct.product;
//   const { org, customer, products } = attachParams;

//   // Can only upgrade once for now
//   if (products.length > 1) {
//     throw new RecaseError({
//       message: `Can't handle upgrade / downgrade for multiple products`,
//       code: ErrCode.UpgradeFailed,
//       statusCode: StatusCodes.NOT_IMPLEMENTED,
//     });
//   }

//   const stripeCli = createStripeCli({
//     org: attachParams.org,
//     env: attachParams.customer.env,
//   });

//   const logger = req.logtail;

//   // 0. Cancel any scheduled products
//   await cancelScheduledProductIfExists({
//     req,
//     org: attachParams.org,
//     stripeCli,
//     attachParams,
//     curFullProduct: curCusProduct.product as any,
//     logger,
//   });

//   const curFullProduct = await ProductService.getFull({
//     db: req.db,
//     idOrInternalId: curProduct.id,
//     orgId: org.id,
//     env: customer.env,
//   });

//   let curPrices = getPricesForCusProduct({
//     cusProduct: curCusProduct!,
//   });
//   let newPrices = attachParams.prices;

//   const isUpgrade =
//     attachParams.invoiceOnly ||
//     isProductUpgrade({
//       prices1: curPrices,
//       prices2: newPrices,
//     });

//   if (!isUpgrade) {
//     await handleDowngrade({
//       req,
//       res,
//       attachParams,
//       curCusProduct,
//     });
//     return;
//   } else {
//     await handleUpgrade({
//       req,
//       res,
//       attachParams,
//       curCusProduct,
//       curFullProduct,
//     });
//   }
// };
