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

  const activeCusProducts = await CusProductService.getByStripeSubId({
    db,
    stripeSubId: data.id,
    orgId: org.id,
    env,
  });

  if (activeCusProducts.length === 0) {
    if (data.livemode) {
      logger.warn(
        `subscription.deleted: ${data.id} - no customer products found`
      );
      return;
    }
  }

  const subscription = await getFullStripeSub({
    stripeCli,
    stripeId: data.id,
  });

  const cancellationComment = subscription.cancellation_details?.comment;
  if (
    cancellationComment === "autumn_upgrade" ||
    cancellationComment === "autumn_cancel"
  ) {
    logger.info(
      `sub.deleted: ${subscription.id} from ${cancellationComment}, skipping`
    );
    return;
  }

  if (cancellationComment?.includes("trial_canceled")) {
    logger.info(
      `sub.deleted: ${subscription.id} from trial canceled, skipping`
    );
    return;
  }

  // Prematurely canceled if cancel_at_period_end is false or cancel_at is more than 20 seconds apart from current_period_end
  let prematurelyCanceled = subIsPrematurelyCanceled(subscription);

  // const batchUpdate = [];
  for (const cusProduct of activeCusProducts) {
    await handleCusProductDeleted({
      req,
      db,
      stripeCli,
      cusProduct,
      subscription,
      logger,
      prematurelyCanceled,
    });
  }
};
