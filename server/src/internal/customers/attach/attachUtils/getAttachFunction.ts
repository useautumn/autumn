import chalk from "chalk";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachBranch, AttachFunction, CusProductStatus } from "@autumn/shared";
import { handleCreateCheckout } from "../../add-product/handleCreateCheckout.js";
import { handleAddProduct } from "../attachFunctions/addProductFlow/handleAddProduct.js";
import { AttachBody } from "@autumn/shared";
import { AttachConfig } from "@autumn/shared";
import { handleUpdateQuantityFunction } from "../attachFunctions/updateQuantityFlow/updateQuantityFlow.js";

import {
  attachParamsToCurCusProduct,
  attachParamToCusProducts,
} from "./convertAttachParams.js";
import { handleOneOffFunction } from "../attachFunctions/addProductFlow/handleOneOffFunction.js";
import { CusProductService } from "../../cusProducts/CusProductService.js";
import { handleCreateInvoiceCheckout } from "../../add-product/handleCreateInvoiceCheckout.js";
import { handleUpgradeFlow } from "../attachFunctions/upgradeFlow/handleUpgradeFlow.js";
import { handleScheduleFunction2 } from "../attachFunctions/scheduleFlow/handleScheduleFlow2.js";
import { handleRenewProduct } from "../attachFunctions/handleRenewProduct.js";

/* 
1. If from new version, free trial should just carry over
2. If from new version, can't update with trial...
3. In migrateCustomer flow, if to free product, upgrade product still called... should be changed to add product...
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
  const { curCusProduct } = attachParamToCusProducts({
    attachParams,
  });

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
  } else if (branch == AttachBranch.OneOff) {
    return AttachFunction.OneOff;
  } else if (newScenario) {
    return AttachFunction.AddProduct;
  }

  // 2. Upgrade scenarios
  let updateScenarios = [
    AttachBranch.NewVersion,
    AttachBranch.SameCustom,
    AttachBranch.SameCustomEnts,
    AttachBranch.Upgrade,
  ];

  if (updateScenarios.includes(branch)) {
    if (config.sameIntervals) {
      return AttachFunction.UpgradeSameInterval;
    } else {
      return AttachFunction.UpgradeDiffInterval;
    }
  }

  // 3. Downgrade scenarios
  if (branch == AttachBranch.Downgrade) {
    return AttachFunction.ScheduleProduct;
  }

  // 4. Prepaid scenarios
  if (branch == AttachBranch.UpdatePrepaidQuantity) {
    let curSameProduct = attachParamsToCurCusProduct({ attachParams });
    if (curSameProduct?.free_trial) {
      attachParams.freeTrial = curSameProduct.free_trial;
    }
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
  const { logtail: logger, db } = req;
  const { stripeCli } = attachParams;

  const attachFunction = await getAttachFunction({
    branch,
    attachParams,
    attachBody,
    config,
  });

  const customer = attachParams.customer;
  const org = attachParams.org;
  const productIdsStr = attachParams.products.map((p) => p.id).join(", ");
  const { curMainProduct, curSameProduct, curScheduledProduct } =
    attachParamToCusProducts({
      attachParams,
    });

  const curCusProduct = attachParamsToCurCusProduct({ attachParams });

  logger.info(`--------------------------------`);
  logger.info(
    `ATTACHING ${productIdsStr} to ${customer.name} (${customer.id || customer.email}), org: ${org.slug}\n`
  );
  if (customer.entity) {
    logger.info(`Entity: ${customer.entity.name} (${customer.entity.id})`);
  }
  logger.info(
    `Branch: ${chalk.yellow(branch)}, Function: ${chalk.yellow(attachFunction)}`
  );

  if (curMainProduct) {
    logger.info(`→ Current Main Product: ${curMainProduct.product.id}`);
  }
  if (curSameProduct) {
    logger.info(`→ Current Same Product: ${curSameProduct.product.id}`);
  }
  if (curScheduledProduct) {
    logger.info(
      `→ Current Scheduled Product: ${curScheduledProduct.product.id}`
    );
  }

  if (attachFunction == AttachFunction.OneOff) {
    return await handleOneOffFunction({
      req,
      res,
      attachParams,
      config,
    });
  }

  if (attachFunction == AttachFunction.Renew) {
    return await handleRenewProduct({
      req,
      res,
      attachParams,
      config,
    });
  }

  // 2. If main is trial, cancel it...
  if (branch == AttachBranch.MainIsTrial) {
    await CusProductService.update({
      db,
      cusProductId: curMainProduct!.id,
      updates: {
        status: CusProductStatus.Expired,
      },
    });

    for (const subId of curMainProduct?.subscription_ids || []) {
      await stripeCli.subscriptions.cancel(subId, {
        cancellation_details: {
          comment: "autumn_downgrade,trial_canceled",
        },
      });
    }
  }

  // if (attachFunction == AttachFunction.Renew) {
  //   // Renew current subscription

  //   res.status(200).json(
  //     AttachResultSchema.parse({
  //       customer_id:
  //         attachParams.customer.id || attachParams.customer.internal_id,
  //       product_ids: attachParams.products.map((p) => p.id),
  //       code: SuccessCode.RenewedProduct,
  //       message: `Successfully renewed product ${attachParams.products[0].id}`,
  //     })
  //   );
  //   return;
  // }

  if (attachFunction == AttachFunction.CreateCheckout) {
    if (config.invoiceCheckout) {
      return await handleCreateInvoiceCheckout({
        req,
        res,
        attachParams,
        config,
      });
    }
    return await handleCreateCheckout({
      req,
      res,
      attachParams,
      config,
    });
  }

  if (attachFunction == AttachFunction.AddProduct) {
    return await handleAddProduct({
      req,
      res,
      attachParams,
      config,
    });
  }

  if (attachFunction == AttachFunction.ScheduleProduct) {
    return await handleScheduleFunction2({
      req,
      res,
      attachParams,
      config,
    });
  }

  if (
    attachFunction == AttachFunction.UpgradeDiffInterval ||
    attachFunction == AttachFunction.UpgradeSameInterval
  ) {
    return await handleUpgradeFlow({
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
      config,
    });
  }
};

// // 1. Cancel future schedule before creating a new one...
// await deleteCurrentScheduledProduct({
//   req,
//   org,
//   attachParams,
//   attachFunc: attachFunction,
//   logger,
// });
