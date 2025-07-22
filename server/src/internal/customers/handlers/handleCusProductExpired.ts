import { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { cancelFutureProductSchedule } from "@/internal/customers/change-product/scheduleUtils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
  cancelCusProductSubscriptions,
  expireAndActivate,
  fullCusProductToProduct,
} from "@/internal/customers/cusProducts/cusProductUtils.js";
import { isOneOff } from "@/internal/products/productUtils.js";
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

export const removeScheduledProduct = async ({
  req,
  db,
  cusProduct,
  cusProducts,
  org,
  env,
  logger,
  renewCurProduct = true,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
  cusProduct: FullCusProduct;
  cusProducts: FullCusProduct[];
  org: Organization;
  env: AppEnv;
  logger: any;
  renewCurProduct?: boolean;
}) => {
  const stripeCli = createStripeCli({ org: org, env: env });

  // Get full product from cus product
  let fullProduct = fullCusProductToProduct(cusProduct);

  // 1. Cancel future product schedule
  await cancelFutureProductSchedule({
    req,
    db,
    org,
    cusProducts,
    product: fullProduct,
    stripeCli,
    logger,
    env,
    internalEntityId: cusProduct.internal_entity_id || undefined,
    renewCurProduct,
  });

  // 2. Delete scheduled product
  await CusProductService.delete({
    db,
    cusProductId: cusProduct.id,
  });
  return;
};

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

  // If current product is scheduled

  if (cusProduct.status == CusProductStatus.Scheduled) {
    await removeScheduledProduct({
      req,
      db,
      cusProduct,
      cusProducts: fullCus.customer_products,
      org,
      env,
      logger,
    });
    return;
  }

  // 1. If main product, can't expire if there's scheduled product
  let isMain = !cusProduct.product.is_add_on;
  if (isMain) {
    let { curScheduledProduct: futureProduct } = getExistingCusProducts({
      product: cusProduct.product,
      cusProducts: fullCus.customer_products,
      internalEntityId: cusProduct.internal_entity_id,
    });

    if (futureProduct) {
      throw new RecaseError({
        message: `Please delete scheduled product ${futureProduct.product.name} first`,
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }
  }

  // 2. If expire at cycle end, just cancel subscriptions
  if (!expireImmediately) {
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
