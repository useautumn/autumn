import Stripe from "stripe";
import {
  getFullStripeSub,
  subIsPrematurelyCanceled,
} from "../stripeSubUtils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { handleCusProductDeleted } from "./handleSubDeleted/handleCusProductDeleted.js";

export const handleSubDeleted = async ({
  req,
  stripeCli,
  data,
  logger,
}: {
  req: ExtendedRequest;
  stripeCli: Stripe;
  data: Stripe.Subscription;
  logger: any;
}) => {
  const { db, org, env } = req;

  const subscription = await getFullStripeSub({
    stripeCli,
    stripeId: data.id,
  });

  const activeCusProducts = await CusProductService.getByStripeSubId({
    db,
    stripeSubId: subscription.id,
    orgId: org.id,
    env,
  });

  if (activeCusProducts.length === 0) {
    if (subscription.livemode) {
      logger.warn(
        `subscription.deleted: ${subscription.id} - no customer products found`
      );
      return;
    }
  }

  if (subscription.cancellation_details?.comment === "autumn_upgrade") {
    logger.info(
      `sub.deleted: ${subscription.id} from autumn upgrade, skipping`
    );
    return;
  }

  if (subscription.cancellation_details?.comment?.includes("trial_canceled")) {
    logger.info(
      `sub.deleted: ${subscription.id} from trial canceled, skipping`
    );
    return;
  }

  // Prematurely canceled if cancel_at_period_end is false or cancel_at is more than 20 seconds apart from current_period_end
  let prematurelyCanceled = subIsPrematurelyCanceled(subscription);

  const batchUpdate = [];
  for (const cusProduct of activeCusProducts) {
    batchUpdate.push(
      handleCusProductDeleted({
        req,
        db,
        stripeCli,
        cusProduct,
        subscription,
        logger,
        prematurelyCanceled,
      })
    );
  }

  await Promise.all(batchUpdate);
};
