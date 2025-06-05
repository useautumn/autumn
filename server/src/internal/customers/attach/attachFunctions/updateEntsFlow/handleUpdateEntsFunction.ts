import {
  AttachParams,
  AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";
import {
  attachParamsToProduct,
  attachParamToCusProducts,
} from "../../attachUtils/convertAttachParams.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { attachToInsertParams } from "@/internal/products/productUtils.js";
import {
  APIVersion,
  AttachConfig,
  FullCusProduct,
  ProductItem,
  SuccessCode,
} from "@autumn/shared";
import { productsAreSame } from "@/internal/products/compareProductUtils.js";
import { cusProductToProduct } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import {
  isFeaturePriceItem,
  isPriceItem,
} from "@/internal/products/product-items/getItemType.js";
import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { subToAutumnInterval } from "@/external/stripe/utils.js";
import { addSubItemsToRemove } from "../attachFuncUtils.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { updateStripeSubscription } from "@/external/stripe/stripeSubUtils/updateStripeSub.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { hasPriceIdsChanged } from "./comparePriceEntIds.js";

export const updateSubWithNewItems = async ({
  req,
  curCusProduct,
  attachParams,
  newItems,
  config,
}: {
  req: ExtendedRequest;
  curCusProduct: FullCusProduct;
  attachParams: AttachParams;
  newItems: ProductItem[];
  config: AttachConfig;
}) => {
  const { stripeCli } = attachParams;
  const { logtail: logger } = req;

  const stripeSubs = await getStripeSubs({
    stripeCli,
    subIds: curCusProduct.subscription_ids || [],
  });

  const itemSets = await getStripeSubItems({ attachParams });

  for (const sub of stripeSubs) {
    let interval = subToAutumnInterval(sub);

    let itemSet = itemSets.find((itemSet) => itemSet.interval === interval)!;
    await addSubItemsToRemove({
      sub,
      cusProduct: curCusProduct,
      itemSet,
    });

    await updateStripeSubscription({
      db: req.db,
      attachParams,
      config,
      stripeSubs: [sub],
      itemSet,
      logger,
    });

    logger.info(`Updated sub ${sub.id}, interval ${interval}`);
  }
};

export const handleEntsChangedFunction = async ({
  req,
  res,
  attachParams,
  config,
}: {
  req: ExtendedRequest;
  res: any;
  attachParams: AttachParams;
  config: AttachConfig;
}) => {
  const { curMainProduct: curCusProduct } = attachParamToCusProducts({
    attachParams,
  });

  const logger = req.logtail;
  logger.info("Only entitlements changed, no need to update prices");

  const curProduct = cusProductToProduct({ cusProduct: curCusProduct! });
  const newProduct = attachParamsToProduct({ attachParams });
  const features = attachParams.features;

  if (curCusProduct?.api_version) {
    attachParams.apiVersion = curCusProduct.api_version;
  }

  const { newItems, removedItems } = productsAreSame({
    newProductV1: newProduct,
    curProductV1: curProduct,
    features,
  });

  const priceIdsChanged = hasPriceIdsChanged({
    oldPrices: curCusProduct!.customer_prices.map((p) => p.price),
    newPrices: attachParams.prices,
  });

  const newItemsContainPrice = newItems.some((item) => isPriceItem(item));

  if (priceIdsChanged || newItemsContainPrice) {
    logger.info(`Price IDs changed or new items contain price, updating subs`);
    await updateSubWithNewItems({
      req,
      curCusProduct: curCusProduct!,
      attachParams,
      newItems,
      config,
    });
  }

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
    disableFreeTrial: config.disableTrial,
    keepResetIntervals: true,
    carryExistingUsages: config.carryUsage,
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
