import {
  AttachParams,
  AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";
import { attachParamToCusProducts } from "../../attachUtils/convertAttachParams.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { APIVersion, SuccessCode } from "@autumn/shared";

export const handleEntsChangedFunction = async ({
  req,
  res,
  attachParams,
  carryExistingUsages = false,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  carryExistingUsages?: boolean;
}) => {
  const { curMainProduct: curCusProduct } = attachParamToCusProducts({
    attachParams,
  });

  const logger = req.logtail;
  logger.info("Only entitlements changed, no need to update prices");

  // Remove subscription from previous cus product
  await CusProductService.update({
    db: req.db,
    cusProductId: curCusProduct!.id,
    updates: {
      subscription_ids: [],
    },
  });

  await createFullCusProduct({
    db: req.db,
    attachParams: attachToInsertParams(attachParams, attachParams.products[0]),
    subscriptionIds: curCusProduct!.subscription_ids || [],
    disableFreeTrial: false,
    keepResetIntervals: true,
    carryExistingUsages,
    logger,
  });

  logger.info("✅ Successfully updated entitlements for product");

  let org = attachParams.org;

  let apiVersion = org.api_version || APIVersion.v1;
  if (apiVersion >= APIVersion.v1_1) {
    res.status(200).json(
      AttachResultSchema.parse({
        customer_id: attachParams.customer.id,
        product_ids: attachParams.products.map((p) => p.id),
        code: SuccessCode.FeaturesUpdated,
        message: `Successfully updated features for customer ${attachParams.customer.id} on product ${attachParams.products[0].name}`,
      }),
    );
  } else {
    res.status(200).json({
      success: true,
      message: `Successfully updated features for ${curCusProduct!.product.name}`,
    });
  }
};
