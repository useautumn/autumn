import { Organization, FullProduct } from "@autumn/shared";
import Stripe from "stripe";
import { getExistingCusProducts } from "../add-product/handleExistingProduct.js";
import { AttachParams } from "../products/AttachParams.js";
import { CusProductService } from "../products/CusProductService.js";
import { cancelFutureProductSchedule } from "./scheduleUtils.js";

export const cancelScheduledProductIfExists = async ({
  req,
  org,
  stripeCli,
  attachParams,
  curFullProduct,
  logger,
}: {
  req: any;
  org: Organization;
  stripeCli: Stripe;
  attachParams: AttachParams;
  curFullProduct: FullProduct;
  logger: any;
}) => {
  let { curScheduledProduct } = await getExistingCusProducts({
    product: curFullProduct,
    cusProducts: attachParams.cusProducts!,
  });

  if (curScheduledProduct) {
    logger.info(`Change product: cancelling future scheduled product: ${curScheduledProduct.product.name}`);
     // 1. Cancel future product schedule
     await cancelFutureProductSchedule({
      sb: req.sb,
      org,
      cusProducts: attachParams.cusProducts!,
      product: curScheduledProduct.product as any,
      stripeCli,
      logger,
    });

    // 2. Delete scheduled product
    await CusProductService.delete({
      sb: req.sb,
      cusProductId: curScheduledProduct.id,
    });
  }

  attachParams.curScheduledProduct = null;
}