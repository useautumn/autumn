import Stripe from "stripe";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";

import {
  AttachParams,
  AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";
import {
  APIVersion,
  AttachConfig,
  AttachScenario,
  SuccessCode,
} from "@autumn/shared";

import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
  attachToInsertParams,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import {
  attachParamsToCurCusProduct,
  paramsToCurSub,
  paramsToCurSubSchedule,
} from "../../attachUtils/convertAttachParams.js";
import {
  getEarliestPeriodEnd,
  getLatestPeriodEnd,
} from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { cancelEndOfCycle } from "@/internal/customers/cancel/cancelEndOfCycle.js";
import { paramsToScheduleItems } from "../../mergeUtils/paramsToScheduleItems.js";
import { subToNewSchedule } from "../../mergeUtils/subToNewSchedule.js";
import { updateCurSchedule } from "../../mergeUtils/updateCurSchedule.js";

export const handleScheduleFunction2 = async ({
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
  const product = attachParams.products[0];
  const { stripeCli, customer: fullCus } = attachParams;

  const curCusProduct = attachParamsToCurCusProduct({ attachParams });
  const curSub = await paramsToCurSub({ attachParams });
  // const latestPeriodEnd = getLatestPeriodEnd({ sub: curSub! });
  const latestPeriodEnd = getEarliestPeriodEnd({ sub: curSub! });

  // 1. Cancel current subscription and fetch items from other cus products...?
  let schedule = await paramsToCurSubSchedule({ attachParams });

  const itemSet = await getStripeSubItems2({
    attachParams,
    config,
  });

  const newProductFree = isFreeProduct(attachParams.prices);

  // await cancelEndOfCycle({
  //   req,
  //   cusProduct: curCusProduct!,
  //   fullCus,
  // });

  if (schedule) {
    const newItems = await paramsToScheduleItems({
      req,
      schedule: schedule!,
      attachParams,
      config,
    });

    if (newItems.items.length > 0) {
      await updateCurSchedule({
        req,
        attachParams,
        schedule,
        newItems: newItems.items,
      });
      // await stripeCli.subscriptionSchedules.update(schedule.id, {
      //   phases: [
      //     {
      //       items: newItems.items,
      //       start_date: schedule.phases[0].start_date,
      //     },
      //   ],
      // });

      await CusProductService.update({
        db: req.db,
        cusProductId: curCusProduct!.id,
        updates: {
          scheduled_ids: [schedule!.id],
          canceled: true,
        },
      });
    } else {
      await stripeCli.subscriptionSchedules.cancel(schedule.id);
      // Release schedule...?

      await CusProductService.update({
        db: req.db,
        cusProductId: curCusProduct!.id,
        updates: {
          scheduled_ids: [],
          canceled: true,
        },
      });
    }
  } else {
    schedule = await subToNewSchedule({
      req,
      sub: curSub!,
      attachParams,
      config,
      endOfBillingPeriod: latestPeriodEnd!,
    });

    await CusProductService.update({
      db: req.db,
      cusProductId: curCusProduct!.id,
      updates: {
        canceled: true,
        canceled_at: latestPeriodEnd! * 1000,
      },
    });
  }

  await createFullCusProduct({
    db: req.db,
    attachParams: attachToInsertParams(attachParams, product),
    startsAt: latestPeriodEnd! * 1000,
    subscriptionScheduleIds: schedule ? [schedule.id] : [],
    nextResetAt: latestPeriodEnd! * 1000,
    disableFreeTrial: true,
    isDowngrade: true,
    scenario: newProductFree ? AttachScenario.Cancel : AttachScenario.Downgrade,
    logger,
  });

  let apiVersion = attachParams.apiVersion || APIVersion.v1;
  if (apiVersion >= APIVersion.v1_1) {
    res.status(200).json(
      AttachResultSchema.parse({
        code: SuccessCode.DowngradeScheduled,
        message: `Successfully downgraded from ${curCusProduct!.product.name} to ${product.name}`,
        product_ids: [product.id],
        customer_id:
          attachParams.customer.id || attachParams.customer.internal_id,
      })
    );
  } else {
    res.status(200).json({
      success: true,
    });
  }
};
