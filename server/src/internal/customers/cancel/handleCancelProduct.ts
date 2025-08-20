import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  CusProductStatus,
  ErrCode,
  FullCusProduct,
  FullCustomer,
  APIVersion,
} from "@autumn/shared";
import { getExistingCusProducts } from "../cusProducts/cusProductUtils/getExistingCusProducts.js";
import {
  cusProductToPrices,
  cusProductToProduct,
} from "../cusProducts/cusProductUtils/convertCusProduct.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { cancelEndOfCycle } from "./cancelEndOfCycle.js";
import { cancelImmediately } from "./cancelImmediately.js";
import { cancelScheduledProduct } from "./cancelScheduledProduct.js";
import { handleRenewProduct } from "../attach/attachFunctions/handleRenewProduct.js";
import { getDefaultAttachConfig } from "../attach/attachUtils/getAttachConfig.js";
import { handleScheduleFunction2 } from "../attach/attachFunctions/scheduleFlow/handleScheduleFlow2.js";

export const handleCancelProduct = async ({
  req,
  cusProduct, // cus product to expire
  fullCus,
  expireImmediately = true,
  prorate,
}: {
  req: ExtendedRequest;
  cusProduct: FullCusProduct;
  fullCus: FullCustomer;
  expireImmediately: boolean;
  prorate: boolean;
}) => {
  const { db, org, env, logger } = req;
  logger.info("--------------------------------");
  logger.info(
    `🔔 Expiring cutomer product (${
      expireImmediately ? "immediately" : "end of cycle"
    })`
  );
  logger.info(
    `Customer: ${fullCus.id || fullCus.internal_id} (${env}), Org: ${org.id}`
  );
  logger.info(
    `Product: ${cusProduct.product.name}, Status: ${cusProduct.status}`
  );

  const { curMainProduct, curSameProduct, curScheduledProduct } =
    getExistingCusProducts({
      product: cusProductToProduct({ cusProduct }),
      cusProducts: fullCus.customer_products,
      internalEntityId: cusProduct.internal_entity_id,
    });

  const stripeCli = createStripeCli({ org, env });

  // 1. Build attach params
  if (cusProduct.status == CusProductStatus.Scheduled) {
    // Equivalent to renewing product
    // await cancelScheduledProduct({
    //   req,
    //   curScheduledProduct,
    //   fullCus,
    //   curMainProduct,
    // });
    const { curMainProduct } = getExistingCusProducts({
      product: cusProduct.product,
      cusProducts: fullCus.customer_products,
      internalEntityId: cusProduct.internal_entity_id,
    });
    const product = cusProductToProduct({ cusProduct: curMainProduct! });

    await handleRenewProduct({
      req,
      res: null,
      attachParams: {
        stripeCli,
        customer: fullCus,
        org,
        cusProducts: fullCus.customer_products,
        products: [product],
        internalEntityId: cusProduct.internal_entity_id || undefined,
        paymentMethod: null,
        prices: product.prices,
        entitlements: product.entitlements,
        freeTrial: product.free_trial || null,
        optionsList: curMainProduct?.options || [],
        replaceables: [],
        entities: fullCus.entities,
        features: req.features,
      },
      config: getDefaultAttachConfig(),
    });
    return;
  }

  // 2. If there's a scheduled product, throw error?
  const isMain = !cusProduct.product.is_add_on;

  if (isMain) {
    if (cusProduct.canceled && !expireImmediately) {
      throw new RecaseError({
        message: `Product ${cusProduct.product.name} is already about to cancel at the end of cycle.`,
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (
      curScheduledProduct &&
      !isFreeProduct(cusProductToPrices({ cusProduct: curScheduledProduct }))
    ) {
      throw new RecaseError({
        message: `Please delete scheduled product ${curScheduledProduct.product.name} first`,
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }
  }

  // 2. If expire at cycle end, just cancel subscriptions
  if (!expireImmediately) {
    // const { curMainProduct } = getExistingCusProducts({
    //   product: cusProduct.product,
    //   cusProducts: fullCus.customer_products,
    //   internalEntityId: cusProduct.internal_entity_id,
    // });

    const product = cusProductToProduct({ cusProduct });
    await handleScheduleFunction2({
      req,
      res: null,
      attachParams: {
        stripeCli,
        customer: fullCus,
        org,
        cusProducts: fullCus.customer_products,
        products: [product],
        internalEntityId: cusProduct.internal_entity_id || undefined,
        paymentMethod: null,
        prices: [],
        entitlements: [],
        freeTrial: null,
        optionsList: [],
        replaceables: [],
        entities: fullCus.entities,
        features: req.features,
      },
      config: getDefaultAttachConfig(),
      skipInsertCusProduct: true,
    });
    return;

    // await cancelEndOfCycle({
    //   req,
    //   cusProduct,
    //   fullCus,
    // });
    // return;
  }

  // Expire product immediately
  await cancelImmediately({
    req,
    cusProduct,
    fullCus,
    prorate,
  });
};

// if (isOneOff(cusProduct.customer_prices.map((p) => p.price))) {
//   await CusProductService.update({
//     db,
//     cusProductId: cusProduct.id,
//     updates: { status: CusProductStatus.Expired },
//   });
// } else {
//   await CusProductService.update({
//     db,
//     cusProductId: cusProduct.id,
//     updates: { canceled_at: Date.now() },
//   });
// }

// return;
