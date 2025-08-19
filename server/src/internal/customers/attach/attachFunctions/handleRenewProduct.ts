import {
  AttachParams,
  AttachResultSchema,
} from "@/internal/customers/cusProducts/AttachParams.js";

import {
  attachParamsToCurCusProduct,
  attachParamToCusProducts,
} from "../attachUtils/convertAttachParams.js";

import {
  paramsToScheduleItems,
  removeCusProductFromScheduleItems,
} from "../mergeUtils/paramsToScheduleItems.js";
import { AttachConfig, SuccessCode } from "@autumn/shared";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getStripeSubItems2 } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import {
  cusProductToSchedule,
  cusProductToSub,
} from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { mergeNewScheduleItems } from "../mergeUtils/mergeNewSubItems.js";
import { subToNewSchedule } from "../mergeUtils/subToNewSchedule.js";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { updateCurSchedule } from "../mergeUtils/updateCurSchedule.js";

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

  if (!otherCanceled) {
    if (schedule) {
      console.log("CANCELING SCHEDULE:", schedule.id);
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
      console.log("ADDING CUR CUS PRODUCT BACK TO SCHEDULE");
      const newItems = await paramsToScheduleItems({
        req,
        attachParams,
        config,
        schedule,
        removeCusProducts: [scheduledProduct!],
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
            canceled: false,
          },
        });
      }
    }
    // Case 2: Create new schedule for current cus product
    else {
      console.log("CREATING NEW SCHEDULE");
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
// else {
//   console.log("NO NEW SCHEDULE ITEMS, CANCELING SCHEDULE");
//   await stripeCli.subscriptionSchedules.cancel(schedule.id);
//   const curSub = curCusProduct?.subscription_ids?.[0];

//   if (curSub) {
//     await stripeCli.subscriptions.update(curSub, {
//       cancel_at: null,
//     });
//   }

//   await CusProductService.updateByStripeScheduledId({
//     db: req.db,
//     stripeScheduledId: schedule.id,
//     updates: {
//       scheduled_ids: [],
//     },
//   });

//   await CusProductService.update({
//     db: req.db,
//     cusProductId: curCusProduct!.id,
//     updates: {
//       canceled: false,
//     },
//   });
// }
