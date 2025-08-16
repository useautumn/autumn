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
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { createSubSchedule } from "./createSubSchedule.js";
import { cancelEndOfCycle } from "@/internal/customers/cancel/cancelEndOfCycle.js";

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
  const latestPeriodEnd = getLatestPeriodEnd({ sub: curSub! });

  // 1. Cancel current subscription and fetch items from other cus products...?
  let { schedule, prices } = await paramsToCurSubSchedule({ attachParams });
  const itemSet = await getStripeSubItems2({
    attachParams,
    config,
  });

  // await stripeCli.subscriptions.update(curSub!.id!, {
  //   cancel_at: latestPeriodEnd!,
  // });
  await cancelEndOfCycle({
    req,
    cusProduct: curCusProduct!,
    fullCus,
  });

  const newProductFree = isFreeProduct(attachParams.prices);

  if (!newProductFree) {
    if (schedule) {
      // Update current schedule
    } else {
      // Create new schedule
      schedule = await createSubSchedule({
        db: req.db,
        attachParams,
        itemSet,
        endOfBillingPeriod: latestPeriodEnd!,
      });

      // Update current cus products with new schedule id
      await CusProductService.updateByStripeSubId({
        db: req.db,
        stripeSubId: curSub!.id!,
        updates: {
          scheduled_ids: [schedule!.id],
        },
      });

      await CusProductService.update({
        db: req.db,
        cusProductId: curCusProduct!.id,
        updates: {
          canceled_at: latestPeriodEnd! * 1000,
          scheduled_ids: [],
        },
      });
    }
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
