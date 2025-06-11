import {
  AttachParams,
  AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";
import { attachParamToCusProducts } from "../../attachUtils/convertAttachParams.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import { APIVersion, AttachConfig, CusProductStatus } from "@autumn/shared";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { updateSubsByInt } from "./updateSubsSameInt.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";

export const handleUpgradeSameInterval = async ({
  req,
  res,
  attachParams,
  config,
}: {
  req: ExtendedRequest;
  res?: any;
  attachParams: AttachParams;
  config: AttachConfig;
}) => {
  const { curMainProduct: curCusProduct } = attachParamToCusProducts({
    attachParams,
  });

  const stripeSubs = await getStripeSubs({
    stripeCli: attachParams.stripeCli,
    subIds: curCusProduct!.subscription_ids || [],
    expand: ["items.data.price.tiers"],
  });

  const logger = req.logtail;

  if (curCusProduct?.api_version) {
    attachParams.apiVersion = curCusProduct.api_version;
  }

  logger.info(`1. Updating subs by interval`);
  const { replaceables } = await updateSubsByInt({
    req,
    curCusProduct: curCusProduct!,
    attachParams,
    config,
    stripeSubs,
  });

  logger.info(`2. Expiring previous cus product`);
  await CusProductService.update({
    db: req.db,
    cusProductId: curCusProduct!.id,
    updates: {
      subscription_ids: [],
      status: CusProductStatus.Expired,
    },
  });

  logger.info(`3. Creating new cus product`);

  await createFullCusProduct({
    db: req.db,
    attachParams: attachToInsertParams(attachParams, attachParams.products[0]),
    subscriptionIds: curCusProduct!.subscription_ids || [],
    disableFreeTrial: config.disableTrial,
    carryExistingUsages: config.carryUsage,
    carryOverTrial: config.carryTrial,
    anchorToUnix: stripeSubs[0].current_period_end * 1000,
    logger,
  });

  if (res) {
    let apiVersion = attachParams.org.api_version || APIVersion.v1;
    if (apiVersion >= APIVersion.v1_1) {
      res.status(200).json(
        AttachResultSchema.parse({
          customer_id: attachParams.customer.id,
          product_ids: attachParams.products.map((p) => p.id),
          code: "updated_product_successfully",
          message: `Successfully updated product`,
        }),
      );
    } else {
      res.status(200).json({
        success: true,
        message: `Successfully updated product`,
      });
    }
  }
};

// const { newItems } = productsAreSame({
//   newProductV1: newProduct,
//   curProductV1: curProduct,
//   features,
// });

// const priceIdsChanged = hasPriceIdsChanged({
//   oldPrices: curCusProduct!.customer_prices.map((p) => p.price),
//   newPrices: attachParams.prices,
// });

// const newItemsContainPrice = newItems.some((item) => isPriceItem(item));

// if (priceIdsChanged || newItemsContainPrice) {
//   logger.info(`Price IDs changed or new items contain price, updating subs`);
//   await updateSubWithNewItems({
//     req,
//     curCusProduct: curCusProduct!,
//     attachParams,
//     newItems,
//     config,
//   });
// }
