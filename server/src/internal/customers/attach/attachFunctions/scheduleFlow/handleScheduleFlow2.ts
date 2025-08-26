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
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { paramsToScheduleItems } from "../../mergeUtils/paramsToScheduleItems.js";
import { subToNewSchedule } from "../../mergeUtils/subToNewSchedule.js";
import { updateCurSchedule } from "../../mergeUtils/updateCurSchedule.js";
import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { subItemInCusProduct } from "@/external/stripe/stripeSubUtils/stripeSubItemUtils.js";
import {
  getCurrentPhaseIndex,
  logPhases,
} from "../../mergeUtils/phaseUtils/phaseUtils.js";

export const handleScheduleFunction2 = async ({
  req,
  res,
  attachParams,
  config,
  skipInsertCusProduct = false,
}: {
  req: any;
  res: any;
  attachParams: AttachParams;
  config: AttachConfig;
  skipInsertCusProduct?: boolean;
}) => {
  const logger = req.logtail;
  const product = attachParams.products[0];
  const { stripeCli, customer: fullCus, prices } = attachParams;

  const curCusProduct = attachParamsToCurCusProduct({ attachParams });
  const curSub = await paramsToCurSub({ attachParams });
  const curPrices = curCusProduct
    ? cusProductToPrices({ cusProduct: curCusProduct })
    : [];

  const subItems = curSub?.items.data.filter((item) =>
    subItemInCusProduct({ cusProduct: curCusProduct!, subItem: item })
  );

  const expectedEnd = getLatestPeriodEnd({ subItems });

  // 1. Cancel current subscription and fetch items from other cus products...?
  let schedule = await paramsToCurSubSchedule({ attachParams });

  const newProductFree = isFreeProduct(attachParams.prices);

  if (schedule) {
    console.log("CURRENT SCHEDULE ITEMS:");
    await logPhases({
      phases: schedule.phases as any,
      db: req.db,
    });

    const newItems = await paramsToScheduleItems({
      req,
      schedule: schedule!,
      attachParams,
      config,
      billingPeriodEnd: expectedEnd!,
    });

    console.log("NEW SCHEDULE ITEMS:");
    await logPhases({
      phases: newItems.phases as any,
      db: req.db,
    });

    // Should release schedule...
    const currentPhaseIndex = getCurrentPhaseIndex({
      schedule: { phases: newItems.phases } as any,
      now: attachParams.now,
    });

    if (currentPhaseIndex == newItems.phases.length - 1) {
      console.log(`NO SUBSEQUENT PHASES, RELEASING SCHEDULE`);
      await stripeCli.subscriptionSchedules.release(schedule!.id);
      await CusProductService.updateByStripeScheduledId({
        db: req.db,
        stripeScheduledId: schedule!.id,
        updates: { scheduled_ids: [] },
      });

      await CusProductService.update({
        db: req.db,
        cusProductId: curCusProduct!.id,
        updates: {
          canceled: true,
          canceled_at: Date.now(),
          ended_at: expectedEnd * 1000,
        },
      });
      schedule = undefined;
    } else {
      schedule = await updateCurSchedule({
        req,
        attachParams,
        schedule,
        newPhases: newItems.phases || [],
        sub: curSub!,
      });

      await CusProductService.update({
        db: req.db,
        cusProductId: curCusProduct!.id,
        updates: {
          scheduled_ids: [schedule!.id],
          canceled_at: Date.now(),
          canceled: true,
          ended_at: expectedEnd * 1000,
        },
      });
    }
  } else {
    schedule = await subToNewSchedule({
      req,
      sub: curSub!,
      attachParams,
      config,
      endOfBillingPeriod: expectedEnd!,
    });

    await CusProductService.update({
      db: req.db,
      cusProductId: curCusProduct!.id,
      updates: {
        canceled: true,
        canceled_at: Date.now(),
        ended_at: expectedEnd * 1000,
      },
    });
  }

  if (!schedule) {
    await stripeCli.subscriptions.update(curSub!.id, {
      cancel_at: expectedEnd!,
    });
  }

  if (!skipInsertCusProduct) {
    await createFullCusProduct({
      db: req.db,
      attachParams: attachToInsertParams(attachParams, product),
      startsAt: expectedEnd! * 1000,
      subscriptionScheduleIds: schedule ? [schedule.id] : [],
      nextResetAt: expectedEnd! * 1000,
      disableFreeTrial: true,
      isDowngrade: true,
      scenario: newProductFree
        ? AttachScenario.Cancel
        : AttachScenario.Downgrade,
      logger,
    });
  }

  let apiVersion = attachParams.apiVersion || APIVersion.v1;

  if (res) {
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
  }
};
