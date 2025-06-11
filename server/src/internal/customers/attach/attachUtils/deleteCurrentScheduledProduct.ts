import { Organization } from "@autumn/shared";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { CusProductService } from "../../cusProducts/CusProductService.js";
import { cancelFutureProductSchedule } from "../../change-product/scheduleUtils.js";
import { attachParamToCusProducts } from "./convertAttachParams.js";

export const deleteCurrentScheduledProduct = async ({
  req,
  org,
  attachParams,
  logger,
}: {
  req: any;
  org: Organization;
  attachParams: AttachParams;
  logger: any;
}) => {
  const stripeCli = attachParams.stripeCli;

  const { curScheduledProduct } = attachParamToCusProducts({
    attachParams,
  });

  if (curScheduledProduct) {
    logger.info(
      `deleteCurrentScheduledProduct: cancelling scheduled - ${curScheduledProduct.product.name}`,
    );

    // 2. Delete scheduled product
    await CusProductService.delete({
      db: req.db,
      cusProductId: curScheduledProduct.id,
    });

    await cancelFutureProductSchedule({
      req,
      db: req.db,
      org,
      cusProducts: attachParams.cusProducts!,
      product: attachParams.products[0],
      stripeCli,
      logger,
      env: attachParams.customer.env,
      internalEntityId: attachParams.internalEntityId || undefined,
    });
  }
};
