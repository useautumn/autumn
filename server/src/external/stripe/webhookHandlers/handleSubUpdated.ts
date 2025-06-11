import {
  AppEnv,
  CollectionMethod,
  CusProductStatus,
  ErrCode,
  Organization,
} from "@autumn/shared";

import { createStripeCli } from "../utils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";

import {
  getWebhookLock,
  releaseWebhookLock,
} from "@/external/redis/stripeWebhookLocks.js";
import RecaseError from "@/utils/errorUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

import { ExtendedRequest } from "@/utils/models/Request.js";
import { handleSubCanceled } from "./handleSubUpdated/handleSubCanceled.js";
import { handleSubRenewed } from "./handleSubUpdated/handleSubRenewed.js";

export const handleSubscriptionUpdated = async ({
  req,
  db,
  org,
  subscription,
  previousAttributes,
  env,
  logger,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  subscription: any;
  previousAttributes: any;
  logger: any;
}) => {
  const lockKey = `sub_updated_${subscription.id}`;

  // Handle syncing status
  let stripeCli = createStripeCli({
    org,
    env,
  });
  let fullSub = await stripeCli.subscriptions.retrieve(subscription.id);

  let subStatusMap: {
    [key: string]: CusProductStatus;
  } = {
    trialing: CusProductStatus.Active,
    active: CusProductStatus.Active,
    past_due: CusProductStatus.PastDue,
  };

  // Get cus products by stripe sub id
  const cusProducts = await CusProductService.getByStripeSubId({
    db,
    stripeSubId: subscription.id,
    orgId: org.id,
    env,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
  });

  if (cusProducts.length === 0) {
    console.log(
      `subscription.updated: no customer products found with stripe sub id: ${subscription.id}`,
    );
    return;
  }

  // Create a lock to prevent race conditions
  let lockAcquired = false;
  try {
    let attempts = 0;

    while (!lockAcquired && attempts < 3) {
      lockAcquired = await getWebhookLock({ lockKey, logger });
      if (!lockAcquired) {
        attempts++;
        console.log(
          `sub.updated: failed to acquire lock for ${subscription.id}, attempt ${attempts}`,
        );
        if (attempts < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } else {
        break;
      }
    }
  } catch (error) {
    logger.error("lock error, setting lockAcquired to true");
    lockAcquired = true;
  }

  if (!lockAcquired) {
    throw new RecaseError({
      message: `Failed to acquire lock for stripe webhook, sub.updated.`,
      code: ErrCode.InvalidRequest,
      statusCode: 400,
    });
  }

  // 1. Fetch subscription
  const updatedCusProducts = await CusProductService.updateByStripeSubId({
    db,
    stripeSubId: subscription.id,
    updates: {
      status: subStatusMap[subscription.status] || CusProductStatus.Unknown,
      canceled_at: subscription.canceled_at
        ? subscription.canceled_at * 1000
        : null,
      collection_method: fullSub.collection_method as CollectionMethod,
    },
  });

  if (updatedCusProducts.length > 0) {
    console.log(
      `subscription.updated: updated ${updatedCusProducts.length} customer products`,
      {
        ids: updatedCusProducts.map((cp) => cp.id),
        status: updatedCusProducts[0].status,
        canceled_at: updatedCusProducts[0].canceled_at,
      },
    );
  }

  if (org.config.sync_status) {
    await handleSubCanceled({
      req,
      previousAttributes,
      sub: fullSub,
      updatedCusProducts,
      stripeCli,
    });

    await handleSubRenewed({
      req,
      prevAttributes: previousAttributes,
      sub: fullSub,
      updatedCusProducts,
    });
  }

  try {
    await SubService.updateFromStripe({
      db,
      stripeSub: fullSub,
    });
  } catch (error) {
    logger.warn(
      `Failed to update sub from stripe. Stripe sub ID: ${subscription.id}, org: ${org.slug}, env: ${env}`,
      error,
    );
  }

  // Cancel subscription immediately
  if (subscription.status === "past_due" && org.config.cancel_on_past_due) {
    const stripeCli = createStripeCli({
      org,
      env,
    });

    console.log("subscription.updated: past due, cancelling:", subscription.id);
    try {
      await stripeCli.subscriptions.cancel(subscription.id);
      await stripeCli.invoices.voidInvoice(subscription.latest_invoice);
    } catch (error: any) {
      logger.error(
        `subscription.updated: error cancelling / voiding: ${error.message}`,
        {
          subscriptionId: subscription.id,
          stripeSubId: subscription.id,
          error: error.message,
        },
      );
    }
  }

  await releaseWebhookLock({ lockKey, logger });
};
