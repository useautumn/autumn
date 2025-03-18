import { getStripeSchedules } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { cancelFutureProductSchedule } from "@/internal/customers/change-product/scheduleUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  uncancelCurrentProduct,
  cancelCusProductSubscriptions,
  expireAndActivate,
} from "@/internal/customers/products/cusProductUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { ErrCode, CusProductStatus } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const handleCusProductExpired = async (req: any, res: any) => {
  const org = await OrgService.getFullOrg({ sb: req.sb, orgId: req.orgId });
  const logger = req.logtail;

  // 2. Expire starterGroup 1 didn't work
  // 1. Expire freeGroup2 didn't work

  try {
    const customerProductId = req.params.customer_product_id;
    const { status } = req.body;

    // See if customer owns product
    const cusProduct = await CusProductService.getByIdStrict({
      sb: req.sb,
      id: customerProductId,
      orgId: req.orgId,
      env: req.env,
      withProduct: true,
    });

    const cusProducts = await CusService.getFullCusProducts({
      sb: req.sb,
      internalCustomerId: cusProduct.customer.internal_id,
      withPrices: true,
      withProduct: true,
      logger: req.logtail,
    });

    logger.info("--------------------------------");
    logger.info(`🔔 Handling CusProduct Expired`);
    logger.info(
      `Customer: ${cusProduct.customer.id} (${req.env}), Org: ${org.id}`
    );
    logger.info(
      `Product: ${cusProduct.product.name}, Status: ${cusProduct.status}`
    );

    if (status == cusProduct.status) {
      throw new RecaseError({
        message: `Product ${cusProduct.product.name} already has status: ${status}`,
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    // If current product is scheduled
    if (cusProduct.status == CusProductStatus.Scheduled) {
      const stripeCli = createStripeCli({ org: org, env: req.env });

      // 1. Cancel future product schedule
      await cancelFutureProductSchedule({
        sb: req.sb,
        org,
        cusProducts,
        product: cusProduct.product,
        stripeCli,
        logger,
      });

      // 2. Delete scheduled product
      await CusProductService.delete({
        sb: req.sb,
        cusProductId: cusProduct.id,
      });
    } else {
      if (cusProduct.product.is_add_on) {
        await cancelCusProductSubscriptions({
          sb: req.sb,
          cusProduct,
          org,
          env: req.env,
        });

        await CusProductService.update({
          sb: req.sb,
          cusProductId: cusProduct.id,
          updates: {
            status: CusProductStatus.Expired,
            ended_at: Date.now(),
          },
        });

        res.status(200).json({ success: true });
        return;
      }
      const futureProduct = await CusProductService.getFutureProduct({
        sb: req.sb,
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
        sb: req.sb,
        cusProduct,
        org,
        env: req.env,
      });

      if (!cancelled) {
        await expireAndActivate({
          sb: req.sb,
          env: req.env,
          cusProduct,
          org,
        });
      } // else will be handled by webhook
    }

    res.status(200).json({ success: true });
  } catch (error) {
    handleRequestError({
      req,
      error,
      res,
      action: "update customer product",
    });
  }
};
