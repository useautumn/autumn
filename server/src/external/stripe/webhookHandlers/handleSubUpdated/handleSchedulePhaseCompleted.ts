import { DrizzleCli } from "@/db/initDrizzle.js";
import { AppEnv, CusProductStatus, Organization } from "@autumn/shared";
import Stripe from "stripe";
import { createStripeCli } from "../../utils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

import { cusProductInPhase } from "@/internal/customers/attach/mergeUtils/phaseUtils/phaseUtils.js";
import { formatUnixToDateTime, notNullish } from "@/utils/genUtils.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { activateFutureProduct } from "@/internal/customers/cusProducts/cusProductUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { cusProductToProduct } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";

export const handleSchedulePhaseCompleted = async ({
  req,
  subObject,
  prevAttributes,
}: {
  req: ExtendedRequest;
  subObject: Stripe.Subscription;
  prevAttributes: any;
}) => {
  const { db, org, env, logger } = req;
  const phasePossiblyChanged =
    notNullish(prevAttributes?.items) && notNullish(subObject.schedule);

  if (!phasePossiblyChanged) return;

  const stripeCli = createStripeCli({ org, env });
  const schedule = await stripeCli.subscriptionSchedules.retrieve(
    subObject.schedule as string,
    {
      expand: ["customer"],
    }
  );

  const cusProducts = await CusProductService.getByScheduleId({
    db,
    scheduleId: schedule.id,
    orgId: org.id,
    env,
  });

  const now = await getStripeNow({
    stripeCli,
    stripeCus: schedule.customer as Stripe.Customer,
  });

  for (const cusProduct of cusProducts) {
    const shouldExpire =
      cusProduct.canceled && cusProduct.ended_at && now >= cusProduct.ended_at;

    if (shouldExpire) {
      logger.info(
        `Expiring cus product: ${cusProduct.product.name} (entity ID: ${cusProduct.entity_id})`
      );
      await CusProductService.update({
        db: req.db,
        cusProductId: cusProduct.id,
        updates: { status: CusProductStatus.Expired },
      });

      // ACTIVATING FUTURE PRODUCT
      const futureCusProduct = await activateFutureProduct({
        req,
        cusProduct,
      });

      if (futureCusProduct) {
        const fullFutureProduct = cusProductToProduct({
          cusProduct: futureCusProduct,
        });

        if (
          !isFreeProduct(fullFutureProduct.prices) &&
          !isOneOff(fullFutureProduct.prices)
        ) {
          await CusProductService.update({
            db: req.db,
            cusProductId: futureCusProduct.id,
            updates: {
              subscription_ids: [subObject.id],
              scheduled_ids: [schedule.id],
            },
          });
        }
      }
    }

    // const isScheduled = cusProduct.status === CusProductStatus.Scheduled;
    // const isInPhase = cusProductInPhase({
    //   phaseStart: currentPhase?.start_date,
    //   cusProduct,
    // });

    // else if (isScheduled && isInPhase) {
    //   console.log(
    //     `Transitioning scheduled product to active: ${cusProduct.product.name} (entity ID: ${cusProduct.entity_id})`
    //   );
    //   await CusProductService.update({
    //     db,
    //     cusProductId: cusProduct.id,
    //     updates: { status: CusProductStatus.Active },
    //   });
    // }
  }

  const currentPhase = schedule.phases.findIndex(
    (phase) =>
      phase.start_date <= Math.floor(now / 1000) &&
      (phase.end_date ? phase.end_date > Math.floor(now / 1000) : true)
  );

  if (currentPhase === schedule.phases.length - 1) {
    // Last phase, cancel schedule
    await stripeCli.subscriptionSchedules.release(schedule.id);
    await CusProductService.updateByStripeScheduledId({
      db: req.db,
      stripeScheduledId: schedule.id,
      updates: {
        scheduled_ids: [],
      },
    });
  }
  // const currentPhase = schedule.phases.find(
  //   (phase) =>
  //     phase.start_date <= Math.floor(now / 1000) &&
  //     phase.end_date > Math.floor(now / 1000)
  // );
};
