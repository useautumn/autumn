import { DrizzleCli } from "@/db/initDrizzle.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
  activateFutureProduct,
  activateDefaultProduct,
  cancelCusProductSubscriptions,
} from "@/internal/customers/cusProducts/cusProductUtils.js";
import { cusProductToPrices } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  FullCusProduct,
  APIVersion,
  BillingType,
  CusProductStatus,
  AttachScenario,
} from "@autumn/shared";
import Stripe from "stripe";
import { getCusPaymentMethod } from "../../stripeCusUtils.js";
import { webhookToAttachParams } from "../../webhookUtils/webhookUtils.js";
import { createUsageInvoice } from "@/internal/customers/attach/attachFunctions/upgradeDiffIntFlow/createUsageInvoice.js";
import { CusService } from "@/internal/customers/CusService.js";
import { notNullish } from "@/utils/genUtils.js";

export const handleCusProductDeleted = async ({
  req,
  db,
  stripeCli,
  cusProduct,
  subscription,
  logger,
  prematurelyCanceled,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
  stripeCli: Stripe;
  cusProduct: FullCusProduct;
  subscription: Stripe.Subscription;
  logger: any;
  prematurelyCanceled: boolean;
}) => {
  const { org, env } = req;
  const { scheduled_ids } = cusProduct;
  const fullCus = await CusService.getFull({
    db,
    idOrInternalId: cusProduct.internal_customer_id,
    orgId: org.id,
    env,
    withEntities: true,
  });

  const paymentMethod = await getCusPaymentMethod({
    stripeCli,
    stripeId: fullCus.processor?.id,
  });

  const isV4Usage = cusProduct.api_version === APIVersion.v1_4;
  if (cusProduct.internal_entity_id || isV4Usage) {
    const usagePrices = cusProductToPrices({
      cusProduct,
      billingType: BillingType.UsageInArrear,
    });

    if (usagePrices.length > 0) {
      logger.info(
        `sub.deleted, submitting usage for ${fullCus.id}, ${cusProduct.product.name}`
      );

      await createUsageInvoice({
        db,
        attachParams: webhookToAttachParams({
          req,
          stripeCli,
          paymentMethod,
          cusProduct,
          fullCus,
        }),
        cusProduct,
        stripeSubs: [subscription],
        logger,
      });
    }
  }

  if (cusProduct.status === CusProductStatus.Expired) {
    // When attaching eg. main is trial, canceled in attach function, don't handle...
    return;
  }

  // Not sure what this is for...
  if (scheduled_ids && scheduled_ids.length > 0 && !prematurelyCanceled) {
    // If cusProduct has scheduled_ids, remove sub id from it?
    logger.info(
      `sub.deleted: removing sub_id from cus product ${cusProduct.id}`
    );
    await CusProductService.update({
      db,
      cusProductId: cusProduct.id,
      updates: {
        subscription_ids: cusProduct.subscription_ids?.filter(
          (id) => id !== subscription.id
        ),
      },
    });

    return;
  }

  logger.info(`sub.deleted: expiring cus product ${cusProduct.id}`);
  await CusProductService.update({
    db,
    cusProductId: cusProduct.id,
    updates: {
      status: CusProductStatus.Expired,
      ended_at: subscription.ended_at ? subscription.ended_at * 1000 : null,
    },
  });

  await addProductsUpdatedWebhookTask({
    req,
    internalCustomerId: cusProduct.internal_customer_id,
    org,
    env,
    customerId: null,
    scenario: AttachScenario.Expired,
    cusProduct,
    logger,
  });

  if (
    cusProduct.product.is_add_on ||
    notNullish(cusProduct.internal_entity_id)
  ) {
    return;
  }

  const activatedFuture = await activateFutureProduct({
    req,
    cusProduct,
    subscription,
  });

  if (activatedFuture) {
    logger.info(`✅ sub.deleted: activated scheduled product`);
    return;
  }

  let cusProducts = await CusProductService.list({
    db,
    internalCustomerId: cusProduct.customer!.internal_id,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
  });

  let { curMainProduct } = getExistingCusProducts({
    product: cusProduct.product,
    cusProducts,
  });

  await activateDefaultProduct({
    req,
    productGroup: cusProduct.product.group,
    fullCus,
    curCusProduct: curMainProduct || undefined,
  });

  await cancelCusProductSubscriptions({
    cusProduct,
    org,
    env,
    excludeIds: [subscription.id],
    logger,
  });
};
