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

import { handleCustomerRaceCondition } from "@/external/redis/redisUtils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
  attachToInsertParams,
  isFreeProduct,
} from "@/internal/products/productUtils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import {
  attachParamsToCurCusProduct,
  attachParamToCusProducts,
  paramsToCurSub,
  paramsToCurSubSchedule,
} from "../attachUtils/convertAttachParams.js";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";

import { cancelEndOfCycle } from "@/internal/customers/cancel/cancelEndOfCycle.js";
import { paramsToSubItems } from "../mergeUtils/paramsToSubItems.js";
import { updateScheduledSubWithNewItems } from "@/internal/customers/change-product/scheduleUtils/updateScheduleWithNewItems.js";
import {
  paramsToScheduleItems,
  removeCusProductFromScheduleItems,
} from "../mergeUtils/paramsToScheduleItems.js";
import { createSubSchedule } from "./scheduleFlow/createSubSchedule.js";
import { cusProductToSchedule } from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import RecaseError from "@/utils/errorUtils.js";
import { mergeNewScheduleItems } from "../mergeUtils/mergeNewSubItems.js";

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

  // Add race condition lock for renew operations
  await handleCustomerRaceCondition({
    action: "renew",
    customerId: fullCus.id || fullCus.internal_id || fullCus.email,
    orgId: req.orgId,
    env: req.env,
    res,
    logger,
  });

  const curCusProduct = attachParamsToCurCusProduct({ attachParams });
  const { curScheduledProduct } = attachParamToCusProducts({ attachParams });
  const product = attachParams.products[0];

  const schedule = await cusProductToSchedule({
    cusProduct: curCusProduct!,
    stripeCli,
  });

  if (!schedule) {
    throw new Error("No schedule found...");
  }

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

  console.log("IN HANDLE RENEW PRODUCT");

  const scheduledProduct = curScheduledProduct;

  const itemSet = await getStripeSubItems2({
    attachParams,
    config,
  });

  const curScheduleItems = structuredClone(schedule.phases[0].items);

  let newScheduleItems: any = mergeNewScheduleItems({
    itemSet,
    curScheduleItems,
  });

  newScheduleItems = removeCusProductFromScheduleItems({
    curScheduleItems,
    updateScheduleItems: newScheduleItems,
    allCusProducts: attachParams.customer.customer_products,
    cusProduct: scheduledProduct!,
  });

  if (newScheduleItems.length > 0) {
    await stripeCli.subscriptionSchedules.update(schedule.id, {
      phases: [
        {
          items: newScheduleItems,
          start_date: schedule.phases[0].start_date,
        },
      ],
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
    await stripeCli.subscriptionSchedules.cancel(schedule.id);
    // Renew current sub
    const curSub = curCusProduct?.subscription_ids?.[0];

    if (curSub) {
      await stripeCli.subscriptions.update(curSub, {
        cancel_at: null,
      });
    }

    await CusProductService.updateByStripeScheduledId({
      db: req.db,
      stripeScheduledId: schedule.id,
      updates: {
        scheduled_ids: [],
      },
    });

    console.log(
      `UPDATING CURRENT CUS PRODUCT ${curCusProduct!.product.id} TO CANCELED FALSE`
    );
    await CusProductService.update({
      db: req.db,
      cusProductId: curCusProduct!.id,
      updates: {
        canceled: false,
      },
    });
  }

  await CusProductService.delete({
    db: req.db,
    cusProductId: scheduledProduct!.id,
  });

  if (res) {
    res.status(200).json(
      AttachResultSchema.parse({
        code: SuccessCode.RenewedProduct,
        message: `Successfully renewed product ${product.name}`,
        product_ids: [product.id],
        // invoice: attachParams.invoiceOnly
        //   ? attachToInvoiceResponse({ invoice: invoices?.[0] || undefined })
        //   : undefined,
        customer_id:
          attachParams.customer.id || attachParams.customer.internal_id,
      })
    );
  }

  // // newScheduleItems = newScheduleItems.map((si: any) => ({
  // //   price: si.price?.id,
  // //   quantity: si.quantity,
  // // }));

  // throw new Error("Stop");

  // If add on

  // const curSub = await paramsToCurSub({ attachParams });
  // const latestPeriodEnd = getLatestPeriodEnd({ sub: curSub! });

  // // 1. Cancel current subscription and fetch items from other cus products...?
  // let schedule = await paramsToCurSubSchedule({ attachParams });

  // const itemSet = await getStripeSubItems2({
  //   attachParams,
  //   config,
  // });

  // await cancelEndOfCycle({
  //   req,
  //   cusProduct: curCusProduct!,
  //   fullCus,
  // });

  // const newProductFree = isFreeProduct(attachParams.prices);

  // if (!newProductFree) {
  //   if (schedule) {
  //     // 1. Update current schedule
  //     // console.log("Schedule items", schedule.phases[0].items);
  //     const newItems = await paramsToScheduleItems({
  //       req,
  //       schedule: schedule!,
  //       attachParams,
  //       config,
  //     });

  //     await stripeCli.subscriptionSchedules.update(schedule.id, {
  //       phases: [
  //         {
  //           items: newItems.items,
  //           start_date: schedule.phases[0].start_date,
  //         },
  //       ],
  //     });

  //     await CusProductService.update({
  //       db: req.db,
  //       cusProductId: curCusProduct!.id,
  //       updates: {
  //         scheduled_ids: [schedule!.id],
  //         canceled: true,
  //       },
  //     });

  //     // 2. Update current sub
  //   } else {
  //     const newItems = await paramsToSubItems({
  //       req,
  //       sub: curSub!,
  //       attachParams,
  //       config,
  //       onlyPriceItems: true,
  //     });

  //     itemSet.subItems = newItems.subItems;

  //     // Create new schedule
  //     schedule = await createSubSchedule({
  //       db: req.db,
  //       attachParams,
  //       itemSet,
  //       endOfBillingPeriod: latestPeriodEnd!,
  //     });

  //     // Update current cus products with new schedule id
  //     await CusProductService.updateByStripeSubId({
  //       db: req.db,
  //       stripeSubId: curSub!.id!,
  //       updates: {
  //         scheduled_ids: [schedule!.id],
  //       },
  //     });

  //     await CusProductService.update({
  //       db: req.db,
  //       cusProductId: curCusProduct!.id,
  //       updates: {
  //         canceled: true,
  //         canceled_at: latestPeriodEnd! * 1000,
  //         scheduled_ids: [],
  //       },
  //     });
  //   }
  // }

  // // throw new Error("Stop");

  // await createFullCusProduct({
  //   db: req.db,
  //   attachParams: attachToInsertParams(attachParams, product),
  //   startsAt: latestPeriodEnd! * 1000,
  //   subscriptionScheduleIds: schedule ? [schedule.id] : [],
  //   nextResetAt: latestPeriodEnd! * 1000,
  //   disableFreeTrial: true,
  //   isDowngrade: true,
  //   scenario: newProductFree ? AttachScenario.Cancel : AttachScenario.Downgrade,
  //   logger,
  // });

  // let apiVersion = attachParams.apiVersion || APIVersion.v1;
  // if (apiVersion >= APIVersion.v1_1) {
  //   res.status(200).json(
  //     AttachResultSchema.parse({
  //       code: SuccessCode.DowngradeScheduled,
  //       message: `Successfully downgraded from ${curCusProduct!.product.name} to ${product.name}`,
  //       product_ids: [product.id],
  //       customer_id:
  //         attachParams.customer.id || attachParams.customer.internal_id,
  //     })
  //   );
  // } else {
  //   res.status(200).json({
  //     success: true,
  //   });
  // }
};