import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachScenario, FullCusProduct } from "@autumn/shared";
import Stripe from "stripe";
import { createStripeCli } from "../../utils.js";
import { cancelFutureProductSchedule } from "@/internal/customers/change-product/scheduleUtils.js";
import { isMultiProductSub } from "@/internal/customers/attach/mergeUtils/mergeUtils.js";

export const handleSubRenewed = async ({
  req,
  prevAttributes,
  sub,
  updatedCusProducts,
}: {
  req: ExtendedRequest;
  prevAttributes: any;
  sub: Stripe.Subscription;
  updatedCusProducts: FullCusProduct[];
}) => {
  const { db, org, env, logtail: logger } = req;
  let renewed =
    notNullish(prevAttributes?.canceled_at) && nullish(sub.canceled_at);

  if (!renewed || updatedCusProducts.length == 0) return;

  const customer = updatedCusProducts[0].customer;

  let cusProducts = await CusProductService.list({
    db,
    internalCustomerId: customer!.internal_id,
  });

  if (isMultiProductSub({ sub, cusProducts })) return;

  // Sub renewed... if multi sub flow
  // console.log(
  //   `Checking sub renewed: ${sub.id}, Is multi sub: ${isMultiProductSub({ sub, cusProducts })}`
  // );
  // console.log("Cus products:", cusProducts.map((cp) => `${cp.product.name}`));

  let { curScheduledProduct } = getExistingCusProducts({
    product: updatedCusProducts[0].product,
    cusProducts,
    internalEntityId: updatedCusProducts[0].internal_entity_id,
  });

  let deletedCusProducts: FullCusProduct[] = [];

  if (curScheduledProduct) {
    logger.info(
      `sub.updated: renewed -> removing scheduled: ${curScheduledProduct.product.name}, main product: ${updatedCusProducts[0].product.name}`
    );

    let stripeCli = createStripeCli({
      org,
      env,
    });

    await cancelFutureProductSchedule({
      req,
      db,
      org,
      stripeCli,
      cusProducts,
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

    deletedCusProducts.push(curScheduledProduct);
  }

  try {
    for (let cusProd of updatedCusProducts) {
      await addProductsUpdatedWebhookTask({
        req,
        internalCustomerId: cusProd.internal_customer_id,
        org,
        env,
        customerId: null,
        logger,
        scenario: AttachScenario.Renew,
        cusProduct: cusProd,
        deletedCusProduct: deletedCusProducts.find(
          (cp) => cp.product.group === cusProd.product.group
        ),
      });
    }
  } catch (error) {}
};
