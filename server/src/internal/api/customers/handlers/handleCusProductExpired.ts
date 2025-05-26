import { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getExistingCusProducts } from "@/internal/customers/add-product/handleExistingProduct.js";
import { cancelFutureProductSchedule } from "@/internal/customers/change-product/scheduleUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  cancelCusProductSubscriptions,
  expireAndActivate,
  fullCusProductToProduct,
} from "@/internal/customers/products/cusProductUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import {
  ErrCode,
  CusProductStatus,
  FullCusProduct,
  Organization,
  AppEnv,
  FullCustomer,
  Customer,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes";

export const removeScheduledProduct = async ({
  db,
  sb,
  cusProduct,
  cusProducts,
  org,
  env,
  logger,
  renewCurProduct = true,
}: {
  db: DrizzleCli;
  sb: SupabaseClient;
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
    db,
    sb,
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
  db,
  sb,
  cusProduct, // cus product to expire
  cusProducts, // other cus products
  org,
  env,
  logger,
  customer,
  expireImmediately = true,
}: {
  db: DrizzleCli;
  sb: SupabaseClient;
  cusProduct: FullCusProduct;
  cusProducts: FullCusProduct[];
  org: Organization;
  env: AppEnv;
  logger: any;
  customer: Customer;
  expireImmediately: boolean;
}) => {
  logger.info("--------------------------------");
  logger.info(
    `🔔 Expiring cutomer product (${
      expireImmediately ? "immediately" : "end of cycle"
    })`,
  );
  logger.info(`Customer: ${customer.id} (${env}), Org: ${org.id}`);
  logger.info(
    `Product: ${cusProduct.product.name}, Status: ${cusProduct.status}`,
  );

  // If current product is scheduled

  if (cusProduct.status == CusProductStatus.Scheduled) {
    await removeScheduledProduct({
      db,
      sb,
      cusProduct,
      cusProducts,
      org,
      env,
      logger,
    });
    return;
  }

  // 1. If main product, can't expire if there's scheduled product
  let isMain = !cusProduct.product.is_add_on;
  if (isMain) {
    let cusProducts = await CusProductService.list({
      db,
      internalCustomerId: customer.internal_id,
    });

    let { curScheduledProduct: futureProduct } = await getExistingCusProducts({
      product: cusProduct.product,
      cusProducts,
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
      sb,
      cusProduct,
      org,
      env,
      expireImmediately,
    });

    if (isOneOff(cusProduct.customer_prices.map((p) => p.price))) {
      await CusProductService.update({
        db,
        cusProductId: cusProduct.id,
        updates: { status: CusProductStatus.Expired },
      });
    }

    return;
  }

  if (cusProduct.product.is_add_on) {
    await cancelCusProductSubscriptions({
      sb,
      cusProduct,
      org,
      env,
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

  // For regular products
  // 1. Cancel stripe subscriptions
  const cancelled = await cancelCusProductSubscriptions({
    sb,
    cusProduct,
    org,
    env,
  });

  if (!cancelled) {
    await expireAndActivate({
      db,
      sb,
      env,
      cusProduct,
      org,
    });
  } // else will be handled by webhook

  return;
};

export const handleCusProductExpired = async (req: any, res: any) => {
  try {
    const { db, sb, logtail: logger } = req;

    const org = await OrgService.getFromReq(req);
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

    const cusProducts = await CusProductService.list({
      db,
      internalCustomerId: cusProduct.customer.internal_id,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.PastDue,
        CusProductStatus.Scheduled,
      ],
    });

    await expireCusProduct({
      db,
      sb,
      cusProduct,
      cusProducts,
      org,
      env: req.env,
      logger: req.logtail,
      customer: cusProduct.customer,
      expireImmediately: true,
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
