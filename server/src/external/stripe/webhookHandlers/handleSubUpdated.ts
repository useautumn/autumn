import { CusProductService } from "@/internal/customers/products/CusProductService.js";
import {
  AppEnv,
  AttachScenario,
  CollectionMethod,
  CusProductStatus,
  ErrCode,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  Organization,
} from "@autumn/shared";

import { createStripeCli } from "../utils.js";
import { formatUnixToDateTime, notNullish, nullish } from "@/utils/genUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { cancelFutureProductSchedule } from "@/internal/customers/change-product/scheduleUtils.js";
import { getExistingCusProducts } from "@/internal/customers/add-product/handleExistingProduct.js";
import {
  getWebhookLock,
  releaseWebhookLock,
} from "@/external/redis/stripeWebhookLocks.js";
import RecaseError from "@/utils/errorUtils.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { addProductsUpdatedWebhookTask } from "@/external/svix/handleProductsUpdatedWebhook.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const handleSubscriptionUpdated = async ({
  db,
  org,
  subscription,
  previousAttributes,
  env,
  logger,
}: {
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
    let isCanceled =
      nullish(previousAttributes?.canceled_at) &&
      !nullish(subscription.canceled_at);

    let comment = subscription.cancellation_details?.comment;
    let isAutumnDowngrade = comment === "autumn_downgrade";

    // CANCELED CASE
    if (isCanceled && updatedCusProducts.length > 0 && !isAutumnDowngrade) {
      let allDefaultProducts = await ProductService.listDefault({
        db,
        orgId: org.id,
        env,
      });

      let cusProducts = await CusProductService.list({
        db,
        internalCustomerId: updatedCusProducts[0].customer.internal_id,
        inStatuses: [CusProductStatus.Scheduled],
      });

      // Default products to activate...
      let defaultProducts = allDefaultProducts.filter((p) =>
        updatedCusProducts.some(
          (cp: FullCusProduct) => cp.product.group == p.group,
        ),
      );

      if (defaultProducts.length > 0) {
        console.log(
          `subscription.updated: canceled -> attempting to schedule default products: ${defaultProducts
            .map((p) => p.name)
            .join(", ")}, period end: ${formatUnixToDateTime(
            fullSub.current_period_end * 1000,
          )}`,
        );
      }

      for (let product of defaultProducts) {
        let alreadyScheduled = cusProducts.some(
          (cp: FullCusProduct) => cp.product.group == product.group,
        );

        if (alreadyScheduled) {
          continue;
        }
        await createFullCusProduct({
          db,
          attachParams: {
            customer: updatedCusProducts[0].customer,
            product,
            prices: product.prices,
            entitlements: product.entitlements,
            freeTrial: product.free_trial || null,
            optionsList: [],
            entities: [],
            features: [],
            org,
          },
          startsAt: fullSub.current_period_end * 1000,
          sendWebhook: false,
        });
      }

      for (let cusProd of updatedCusProducts) {
        try {
          let product = cusProd.product;
          let prices = cusProd.customer_prices.map(
            (cp: FullCustomerPrice) => cp.price,
          );
          let entitlements = cusProd.customer_entitlements.map(
            (ce: FullCustomerEntitlement) => ce.entitlement,
          );
          await addProductsUpdatedWebhookTask({
            internalCustomerId: cusProd.internal_customer_id,
            org,
            env,
            customerId: null,
            logger,
            scenario: AttachScenario.Cancel,
            product: product,
            prices: prices,
            entitlements: entitlements,
            freeTrial: cusProd.free_trial || null,
          });
        } catch (error) {}
      }
    }

    let uncanceled =
      notNullish(previousAttributes?.canceled_at) &&
      nullish(subscription.canceled_at);

    if (uncanceled && updatedCusProducts.length > 0) {
      let customer = updatedCusProducts[0].customer;

      let allCusProducts = await CusProductService.list({
        db,
        internalCustomerId: customer.internal_id,
        inStatuses: [
          CusProductStatus.Active,
          CusProductStatus.PastDue,
          CusProductStatus.Scheduled,
        ],
      });

      let { curScheduledProduct } = await getExistingCusProducts({
        product: updatedCusProducts[0].product,
        cusProducts: allCusProducts,
      });

      if (curScheduledProduct) {
        console.log("subscription.updated: uncanceled -> removing scheduled");
        let stripeCli = createStripeCli({
          org,
          env,
        });
        await cancelFutureProductSchedule({
          db,
          org,
          stripeCli,
          cusProducts: allCusProducts,
          product: updatedCusProducts[0].product,
          internalEntityId: updatedCusProducts[0].internal_entity_id,
          logger,
          env,
          sendWebhook: false,
        });

        await CusProductService.delete({
          db,
          cusProductId: curScheduledProduct.id,
        });
      }

      try {
        for (let cusProd of updatedCusProducts) {
          let product = cusProd.product;
          let prices = cusProd.customer_prices.map(
            (cp: FullCustomerPrice) => cp.price,
          );
          let entitlements = cusProd.customer_entitlements.map(
            (ce: FullCustomerEntitlement) => ce.entitlement,
          );
          await addProductsUpdatedWebhookTask({
            internalCustomerId: cusProd.internal_customer_id,
            org,
            env,
            customerId: null,
            logger,
            scenario: AttachScenario.Renew,
            product: product,
            prices: prices,
            entitlements: entitlements,
            freeTrial: cusProd.free_trial || null,
          });
        }
      } catch (error) {}
    }
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
