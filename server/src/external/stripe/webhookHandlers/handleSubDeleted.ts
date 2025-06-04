import Stripe from "stripe";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { AppEnv, Organization } from "@autumn/shared";
import { subIsPrematurelyCanceled } from "../stripeSubUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { createStripeCli } from "../utils.js";
import { handleCusProductDeleted } from "./handleSubDeleted/handleCusProductDeleted.js";

export const handleSubscriptionDeleted = async ({
  req,
  db,
  subscription,
  org,
  env,
  logger,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
  subscription: Stripe.Subscription;
  org: Organization;
  env: AppEnv;
  logger: any;
}) => {
  const activeCusProducts = await CusProductService.getByStripeSubId({
    db,
    stripeSubId: subscription.id,
    orgId: org.id,
    env,
  });

  const stripeCli = createStripeCli({
    org,
    env,
  });

  if (activeCusProducts.length === 0) {
    if (subscription.livemode) {
      logger.warn(
        `subscription.deleted: ${subscription.id} - no customer products found`,
      );
      return;
    }
  }

  if (subscription.cancellation_details?.comment === "autumn_upgrade") {
    logger.info(
      `sub.deleted: ${subscription.id} from autumn upgrade, skipping`,
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
      }),
    );
  }

  await Promise.all(batchUpdate);
};
