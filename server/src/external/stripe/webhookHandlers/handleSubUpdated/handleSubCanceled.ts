import Stripe from "stripe";
import { AttachScenario } from "@autumn/shared";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { CusProductStatus, FullCusProduct } from "@autumn/shared";
import { formatUnixToDateTime, nullish } from "@/utils/genUtils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { productToInsertParams } from "@/internal/customers/attach/attachUtils/attachParams/convertToParams.js";
import {
  getLatestPeriodEnd,
  subToPeriodStartEnd,
} from "../../stripeSubUtils/convertSubUtils.js";

export const handleSubCanceled = async ({
  req,
  previousAttributes,
  sub,
  updatedCusProducts,
  stripeCli,
}: {
  req: ExtendedRequest;
  previousAttributes: any;
  sub: Stripe.Subscription;
  updatedCusProducts: FullCusProduct[];
  stripeCli: Stripe;
}) => {
  let isCanceled =
    nullish(previousAttributes?.canceled_at) && !nullish(sub.canceled_at);

  let isAutumnDowngrade =
    sub.cancellation_details?.comment?.includes("autumn_downgrade");

  const canceledFromPortal = isCanceled && !isAutumnDowngrade;

  const { db, org, env, logtail: logger } = req;

  if (!canceledFromPortal || updatedCusProducts.length == 0) {
    return;
  }

  let allDefaultProducts = await ProductService.listDefault({
    db,
    orgId: org.id,
    env,
  });

  let fullCus = await CusService.getFull({
    db,
    idOrInternalId: updatedCusProducts[0].customer!.id!,
    orgId: org.id,
    env,
    withEntities: true,
    inStatuses: [CusProductStatus.Scheduled],
  });

  let cusProducts = fullCus.customer_products;
  let entities = fullCus.entities;

  let defaultProducts = allDefaultProducts.filter((p) =>
    updatedCusProducts.some(
      (cp: FullCusProduct) =>
        cp.product.group == p.group && nullish(cp.internal_entity_id)
    )
  );

  if (defaultProducts.length == 0) return;

  if (defaultProducts.length > 0) {
    const { end } = subToPeriodStartEnd({ sub });
    const productNames = defaultProducts.map((p) => p.name).join(", ");
    const periodEnd = formatUnixToDateTime(end * 1000);
    logger.info(
      `subscription.updated: canceled -> attempting to schedule default products: ${productNames}, period end: ${periodEnd}`
    );
  }

  let scheduledCusProducts: FullCusProduct[] = [];
  for (let product of defaultProducts) {
    let alreadyScheduled = cusProducts.some(
      (cp: FullCusProduct) => cp.product.group == product.group
    );

    if (alreadyScheduled) {
      continue;
    }

    let insertParams = productToInsertParams({
      req,
      fullCus,
      newProduct: product,
      entities,
    });

    const end = getLatestPeriodEnd({ sub });
    let fullCusProduct = await createFullCusProduct({
      db,
      attachParams: insertParams,
      startsAt: end * 1000,
      sendWebhook: false,
      logger,
    });

    if (fullCusProduct) {
      scheduledCusProducts.push(fullCusProduct);
    }
  }

  for (let cusProd of updatedCusProducts) {
    try {
      await addProductsUpdatedWebhookTask({
        req,
        internalCustomerId: cusProd.internal_customer_id,
        org,
        env,
        customerId: null,
        logger,
        scenario: AttachScenario.Cancel,
        cusProduct: cusProd,
        scheduledCusProduct: scheduledCusProducts.find(
          (cp) => cp.product.group === cusProd.product.group
        ),
      });
    } catch (error) {}
  }
};
