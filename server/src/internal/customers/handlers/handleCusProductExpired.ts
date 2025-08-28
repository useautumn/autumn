import { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import {
  ACTIVE_STATUSES,
  CusProductService,
} from "@/internal/customers/cusProducts/CusProductService.js";
import {
  cancelCusProductSubscriptions,
  expireAndActivate,
  fullCusProductToProduct,
} from "@/internal/customers/cusProducts/cusProductUtils.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  ErrCode,
  CusProductStatus,
  FullCusProduct,
  Organization,
  AppEnv,
  FullCustomer,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { CusService } from "../CusService.js";
import { cusProductToPrices } from "../cusProducts/cusProductUtils/convertCusProduct.js";

export const expireCusProduct = async ({
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

  // if (cusProduct.status == CusProductStatus.Scheduled) {
  //   await CusProductService.delete({
  //     db,
  //     cusProductId: cusProduct.id,
  //   });
  //   return;
  // }

  // 1. If main product, can't expire if there's scheduled product
  let isMain = !cusProduct.product.is_add_on;
  let { curScheduledProduct: futureProduct } = getExistingCusProducts({
    product: cusProduct.product,
    cusProducts: fullCus.customer_products,
    internalEntityId: cusProduct.internal_entity_id,
  });

  if (isMain) {
    if (
      cusProduct.canceled_at &&
      ACTIVE_STATUSES.includes(cusProduct.status) &&
      !expireImmediately
    ) {
      throw new RecaseError({
        message: `Product ${cusProduct.product.name} is already about to cancel at the end of cycle.`,
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (
      futureProduct &&
      !isFreeProduct(cusProductToPrices({ cusProduct: futureProduct }))
    ) {
      throw new RecaseError({
        message: `Please delete scheduled product ${futureProduct.product.name} first`,
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }
  }

  // 2. If expire at cycle end, just cancel subscriptions
  if (!expireImmediately) {
    // 1. Check if already canceled
    await cancelCusProductSubscriptions({
      cusProduct,
      org,
      env,
      expireImmediately,
      logger,
    });

    if (isOneOff(cusProduct.customer_prices.map((p) => p.price))) {
      await CusProductService.update({
        db,
        cusProductId: cusProduct.id,
        updates: { status: CusProductStatus.Expired },
      });
    } else {
      await CusProductService.update({
        db,
        cusProductId: cusProduct.id,
        updates: { canceled_at: Date.now() },
      });
    }

    return;
  }

  if (cusProduct.product.is_add_on) {
    await cancelCusProductSubscriptions({
      cusProduct,
      org,
      env,
      logger,
    });

    await CusProductService.update({
      db,
      cusProductId: cusProduct.id,
      updates: {
        status: CusProductStatus.Expired,
        ended_at: Date.now(),
      },
    });

    return;
  }

  // Remove scheduled products first...
  if (futureProduct) {
    await CusProductService.delete({
      db,
      cusProductId: futureProduct.id,
    });
  }

  logger.info(`Expiring current product: ${cusProduct.product.name}`);
  await expireAndActivate({
    req,
    cusProduct,
    fullCus,
  });

  logger.info(`Cancelling stripe subscriptions`);
  await cancelCusProductSubscriptions({
    cusProduct,
    org,
    env,
    logger,
    prorate,
  });

  return;
};

export const handleCusProductExpired = async (req: any, res: any) => {
  try {
    const { db } = req;

    const customerProductId = req.params.customer_product_id;
    let cusProduct = await CusProductService.get({
      db,
      id: customerProductId,
      orgId: req.orgId,
      env: req.env,
      withCustomer: true,
    });

    if (!cusProduct) {
      throw new RecaseError({
        message: `Cus product not found: ${customerProductId}`,
        code: ErrCode.CusProductNotFound,
        statusCode: 404,
      });
    }

    const fullCus = await CusService.getFull({
      db,
      idOrInternalId:
        cusProduct.customer!.id || cusProduct.customer!.internal_id,
      orgId: req.orgId,
      env: req.env,
    });

    await expireCusProduct({
      req,
      cusProduct,
      fullCus,
      expireImmediately: true,
      prorate: true,
    });

    res.status(200).json({ message: "Product expired" });
  } catch (error) {
    handleRequestError({
      req,
      error,
      res,
      action: "update customer product",
    });
  }
};
