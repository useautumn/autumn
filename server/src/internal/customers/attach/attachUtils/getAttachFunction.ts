import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import {
  AttachParams,
  AttachResultSchema,
} from "../../cusProducts/AttachParams.js";
import { AttachBranch, AttachFunction } from "../models/AttachBranch.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { handleUpgrade } from "../../change-product/handleUpgrade.js";
import { handleUpgradeFunction } from "../attachFunctions/upgradeFlow/handleUpgradeFunction.js";
import { handleCreateCheckout } from "../../add-product/handleCreateCheckout.js";
import { handleAddProduct } from "../../add-product/handleAddProduct.js";
import { AttachBody } from "../models/AttachBody.js";
import { AttachConfig, AttachFlags } from "../models/AttachFlags.js";
import { handleScheduleFunction } from "../attachFunctions/scheduleFlow/handleScheduleFunction.js";
import { cancelFutureProductSchedule } from "../../change-product/scheduleUtils.js";
import { handleEntsChangedFunction } from "../attachFunctions/updateEntsFlow/handleEntsChangedFunction.js";
import { handleUpdateQuantityFunction } from "../attachFunctions/updateQuantityFlow/updateQuantityFlow.js";
import { SuccessCode } from "@autumn/shared";

/* 
1. If from new version, free trial should just carry over
2. If from new version, can't update with trial...
3. In migrateCustomer flow, if to free product, upgrade product still called... should be changed to add product...

4. If main is trial should run this function:
if (notNullish(curCusProduct.subscription_ids)) {
    for (const subId of curCusProduct.subscription_ids!) {
      try {
        await stripeCli.subscriptions.cancel(subId);
      } catch (error) {
        throw new RecaseError({
          message: `Handling upgrade (cur product on trial): failed to cancel subscription ${subId}`,
          code: ErrCode.StripeCancelSubscriptionFailed,
          statusCode: StatusCodes.BAD_REQUEST,
          data: error,
        });
      }
    }
  }

5. Migrate customer uses proration behaviour none
*/

export const getAttachFunction = async ({
  branch,
  attachParams,
  attachBody,
  config,
}: {
  branch: AttachBranch;
  attachParams: AttachParams;
  attachBody: AttachBody;
  config: AttachConfig;
}) => {
  const { onlyCheckout } = config;

  // 1. Checkout function
  const newScenario = [
    AttachBranch.MultiProduct,
    AttachBranch.OneOff,
    AttachBranch.New,
    AttachBranch.AddOn,
    AttachBranch.MainIsFree,
    AttachBranch.MainIsTrial,
  ].includes(branch);

  if (newScenario && onlyCheckout) {
    return AttachFunction.CreateCheckout;
  } else if (newScenario) {
    return AttachFunction.AddProduct;
  }

  if (branch == AttachBranch.SameCustomEnts) {
    return AttachFunction.UpdateEnts;
  }

  // 2. Upgrade scenarios
  let updateScenarios = [
    AttachBranch.NewVersion,
    AttachBranch.SameCustom,
    AttachBranch.Upgrade,
  ];

  if (updateScenarios.includes(branch)) {
    return AttachFunction.UpdateProduct;
  }

  // 3. Downgrade scenarios
  if (branch == AttachBranch.Downgrade) {
    return AttachFunction.ScheduleProduct;
  }

  // 4. Prepaid scenarios
  if (branch == AttachBranch.UpdatePrepaidQuantity) {
    return AttachFunction.UpdatePrepaidQuantity;
  }

  if (branch == AttachBranch.Renew) {
    return AttachFunction.Renew;
  }

  return AttachFunction.AddProduct;
};

export const runAttachFunction = async ({
  req,
  res,
  branch,
  attachParams,
  attachBody,
  config,
}: {
  req: any;
  res: any;
  branch: AttachBranch;
  attachParams: AttachParams;
  attachBody: AttachBody;
  config: AttachConfig;
}) => {
  const { logtail: logger } = req;

  const attachFunction = await getAttachFunction({
    branch,
    attachParams,
    attachBody,
    config,
  });

  const customer = attachParams.customer;
  const org = attachParams.org;
  const productIdsStr = attachParams.products.map((p) => p.id).join(", ");
  logger.info(
    `ATTACHING ${productIdsStr} to ${customer.name} (${customer.id || customer.email}), org: ${org.slug}`,
  );
  logger.info(`Branch: ${branch}, Function: ${attachFunction}`);

  // 1. Cancel future schedule before creating a new one...
  await cancelFutureProductSchedule({
    db: req.db,
    stripeCli: attachParams.stripeCli,
    cusProducts: attachParams.cusProducts,
    product: attachParams.products[0],
    internalEntityId: attachParams.internalEntityId,
    org: attachParams.org,
    logger,
    env: attachParams.customer.env,
    req,
    sendWebhook: true,
  });

  if (attachFunction == AttachFunction.Renew) {
    res.status(200).json(
      AttachResultSchema.parse({
        customer_id:
          attachParams.customer.id || attachParams.customer.internal_id,
        product_ids: attachParams.products.map((p) => p.id),
        code: SuccessCode.RenewedProduct,
        message: `Successfully renewed product ${attachParams.products[0].id}`,
      }),
    );
    return;
  }

  if (attachFunction == AttachFunction.CreateCheckout) {
    return await handleCreateCheckout({
      req,
      res,
      attachParams,
    });
  }

  if (attachFunction == AttachFunction.AddProduct) {
    return await handleAddProduct({
      req,
      res,
      attachParams,
    });
  }

  if (attachFunction == AttachFunction.UpdateEnts) {
    return await handleEntsChangedFunction({
      req,
      res,
      attachParams,
    });
  }

  if (attachFunction == AttachFunction.ScheduleProduct) {
    return await handleScheduleFunction({
      req,
      res,
      attachParams,
    });
  }

  if (attachFunction == AttachFunction.UpdateProduct) {
    return await handleUpgradeFunction({
      req,
      res,
      attachParams,
      config,
    });
  }

  if (attachFunction == AttachFunction.UpdatePrepaidQuantity) {
    return await handleUpdateQuantityFunction({
      req,
      res,
      attachParams,
    });
  }
};
