import { createStripeCli } from "@/external/stripe/utils.js";
import { cancelFutureProductSchedule } from "@/internal/customers/change-product/scheduleUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  cancelCusProductSubscriptions,
  expireAndActivate,
  fullCusProductToProduct,
} from "@/internal/customers/products/cusProductUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import {
  ErrCode,
  CusProductStatus,
  FullCusProduct,
  Organization,
  AppEnv,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { StatusCodes } from "http-status-codes";

export const expireCusProduct = async ({
  sb,
  cusProduct, // cus product to expire
  cusProducts, // other cus products
  org,
  env,
  logger,
}: {
  sb: SupabaseClient;
  cusProduct: FullCusProduct;
  cusProducts: FullCusProduct[];
  org: Organization;
  env: AppEnv;
  logger: any;
}) => {
  logger.info("--------------------------------");
  logger.info(`🔔 Handling CusProduct Expired`);
  logger.info(`Customer: ${cusProduct.customer.id} (${env}), Org: ${org.id}`);
  logger.info(
    `Product: ${cusProduct.product.name}, Status: ${cusProduct.status}`
  );

  // If current product is default, can't expire it
  if (
    cusProduct.product.is_default &&
    cusProduct.status == CusProductStatus.Active
  ) {
    throw new RecaseError({
      message: `Product ${cusProduct.product.name} is default and active and can't be expired`,
      code: ErrCode.InvalidRequest,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  // If current product is scheduled

  if (cusProduct.status == CusProductStatus.Scheduled) {
    const stripeCli = createStripeCli({ org: org, env: env });

    // Get full product from cus product
    let fullProduct = fullCusProductToProduct(cusProduct);

    // 1. Cancel future product schedule
    await cancelFutureProductSchedule({
      sb,
      org,
      cusProducts,
      product: fullProduct,
      stripeCli,
      logger,
      env,
    });

    // 2. Delete scheduled product
    await CusProductService.delete({
      sb,
      cusProductId: cusProduct.id,
    });
  } else {
    if (cusProduct.product.is_add_on) {
      await cancelCusProductSubscriptions({
        sb,
        cusProduct,
        org,
        env,
      });

      await CusProductService.update({
        sb,
        cusProductId: cusProduct.id,
        updates: {
          status: CusProductStatus.Expired,
          ended_at: Date.now(),
        },
      });

      return;
    }
    const futureProduct = await CusProductService.getFutureProduct({
      sb,
      internalCustomerId: cusProduct.customer.internal_id,
      productGroup: cusProduct.product.group,
    });

    if (futureProduct) {
      throw new RecaseError({
        message: `Please delete scheduled product ${futureProduct.product.name} first`,
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
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
        sb,
        env,
        cusProduct,
        org,
      });
    } // else will be handled by webhook
  }

  return;
};

export const handleCusProductExpired = async (req: any, res: any) => {
  const org = await OrgService.getFullOrg({ sb: req.sb, orgId: req.orgId });
  const logger = req.logtail;

  // 2. Expire starterGroup 1 didn't work
  // 1. Expire freeGroup2 didn't work

  try {
    const customerProductId = req.params.customer_product_id;
    const { status } = req.body;

    // See if customer owns product
    let cusProduct = await CusProductService.getByIdStrict({
      sb: req.sb,
      id: customerProductId,
      orgId: req.orgId,
      env: req.env,
      withProduct: true,
      withPrices: true,
    });

    const cusProducts = await CusService.getFullCusProducts({
      sb: req.sb,
      internalCustomerId: cusProduct.customer.internal_id,
      withPrices: true,
      withProduct: true,
      logger: req.logtail,
    });

    await expireCusProduct({
      sb: req.sb,
      cusProduct,
      cusProducts,
      org,
      env: req.env,
      logger: req.logtail,
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
