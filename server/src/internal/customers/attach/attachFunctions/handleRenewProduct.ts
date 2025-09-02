import {
  AttachParams,
  AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";
import {
  attachParamsToCurCusProduct,
  attachParamToCusProducts,
  getSubForAttach,
  paramsToCurSub,
} from "../attachUtils/convertAttachParams.js";
import { paramsToScheduleItems } from "../mergeUtils/paramsToScheduleItems.js";
import { AttachConfig, SuccessCode } from "@autumn/shared";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
  cusProductToSchedule,
  cusProductToSub,
} from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { subToNewSchedule } from "../mergeUtils/subToNewSchedule.js";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { updateCurSchedule } from "../mergeUtils/updateCurSchedule.js";
import { subItemInCusProduct } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";

export const handleRenewProduct = async ({
  req,
  res,
  attachParams,
  config,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  config: AttachConfig;
}) => {
  const logger = req.logtail;
  const { stripeCli, customer: fullCus } = attachParams;

  const curCusProduct = attachParamsToCurCusProduct({ attachParams });
  const { curScheduledProduct } = attachParamToCusProducts({ attachParams });
  const product = attachParams.products[0];
  const cusProducts = attachParams.customer.customer_products;

  const schedule = await cusProductToSchedule({
    cusProduct: curCusProduct!,
    stripeCli,
  });

  // If not add on
  if (product.is_add_on) {
    res.status(200).json(
      AttachResultSchema.parse({
        code: SuccessCode.RenewedProduct,
        message: `Successfully renewed product ${product.name}`,
        product_ids: [product.id],
      })
    );
    return;
  }

  const curSubId = curCusProduct?.subscription_ids?.[0];
  const otherCanceled = cusProducts.some(
    (cp) =>
      cp.subscription_ids?.includes(curSubId!) &&
      cp.canceled &&
      cp.id !== curCusProduct?.id
  );

  let expectedEnd = undefined;
  if (curSubId) {
    const curSub = await getSubForAttach({
      stripeCli,
      subId: curSubId,
    });
    const subItems = curSub?.items.data.filter((item) =>
      subItemInCusProduct({ cusProduct: curCusProduct!, subItem: item })
    );
    expectedEnd = getLatestPeriodEnd({ subItems });
  }

  if (!otherCanceled) {
    if (schedule) {
      logger.info(`RENEW FLOW: releasing schedule ${schedule.id}`);
      await stripeCli.subscriptionSchedules.release(schedule.id);

      await CusProductService.updateByStripeScheduledId({
        db: req.db,
        stripeScheduledId: schedule.id,
        updates: {
          scheduled_ids: [],
        },
      });
    }

    if (curSubId) {
      await stripeCli.subscriptions.update(curSubId, {
        cancel_at: null,
      });
    }

    await CusProductService.update({
      db: req.db,
      cusProductId: curCusProduct!.id,
      updates: {
        canceled: false,
      },
    });
  } else {
    const scheduledProduct = curScheduledProduct;

    // Case 1: Add current cus product back to schedule and remove scheduled product from schedule
    if (schedule) {
      logger.info(
        `RENEW FLOW: adding cur cus product back to schedule ${schedule.id}`
      );
      const newItems = await paramsToScheduleItems({
        req,
        attachParams,
        config,
        schedule,
        removeCusProducts: scheduledProduct ? [scheduledProduct] : [],
        billingPeriodEnd: expectedEnd,
      });

      if (newItems.phases.length > 1) {
        const curSub = await paramsToCurSub({ attachParams });
        await updateCurSchedule({
          req,
          attachParams,
          schedule,
          newPhases: newItems.phases,
          sub: curSub!,
        });

        await CusProductService.update({
          db: req.db,
          cusProductId: curCusProduct!.id,
          updates: {
            scheduled_ids: [schedule!.id],
            canceled: false,
          },
        });
      } else {
        logger.info(
          `RENEW FLOW: no new schedule items, releasing schedule ${schedule.id}`
        );
        await stripeCli.subscriptionSchedules.release(schedule.id);

        await CusProductService.updateByStripeScheduledId({
          db: req.db,
          stripeScheduledId: schedule.id,
          updates: {
            scheduled_ids: [],
          },
        });

        await CusProductService.update({
          db: req.db,
          cusProductId: curCusProduct!.id,
          updates: {
            canceled: false,
          },
        });
      }
    }
    // Case 2: Create new schedule for current cus product
    // Example scenario: Premium 1, Premium 2, Free 1, Free 2, Premium 1
    else {
      logger.info(`RENEW FLOW: creating new schedule`);
      const curSub = await cusProductToSub({
        cusProduct: curCusProduct!,
        stripeCli,
      });

      const periodEnd = getLatestPeriodEnd({ sub: curSub! });
      await subToNewSchedule({
        req,
        sub: curSub!,
        attachParams,
        config,
        endOfBillingPeriod: periodEnd,
      });

      await CusProductService.update({
        db: req.db,
        cusProductId: curCusProduct!.id,
        updates: {
          canceled: false,
        },
      });
    }
  }

  if (curScheduledProduct) {
    await CusProductService.delete({
      db: req.db,
      cusProductId: curScheduledProduct!.id,
    });
  }

  if (res) {
    res.status(200).json(
      AttachResultSchema.parse({
        code: SuccessCode.RenewedProduct,
        message: `Successfully renewed product ${product.name}`,
        product_ids: [product.id],
        customer_id:
          attachParams.customer.id || attachParams.customer.internal_id,
      })
    );
  }
};
