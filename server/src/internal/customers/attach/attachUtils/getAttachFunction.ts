import chalk from "chalk";
import {
  AttachParams,
  AttachResultSchema,
} from "../../cusProducts/AttachParams.js";
import { AttachBranch, AttachFunction, CusProductStatus } from "@autumn/shared";
import { handleUpgradeDiffInterval } from "../attachFunctions/upgradeDiffIntFlow/handleUpgradeDiffInt.js";
import { handleCreateCheckout } from "../../add-product/handleCreateCheckout.js";
import { handleAddProduct } from "../attachFunctions/addProductFlow/handleAddProduct.js";
import { AttachBody } from "../models/AttachBody.js";
import { AttachConfig } from "@autumn/shared";
import { handleScheduleFunction } from "../attachFunctions/scheduleFlow/handleScheduleFunction.js";
import { handleUpdateQuantityFunction } from "../attachFunctions/updateQuantityFlow/updateQuantityFlow.js";
import { SuccessCode } from "@autumn/shared";
import { attachParamToCusProducts } from "./convertAttachParams.js";
import { deleteCurrentScheduledProduct } from "./deleteCurrentScheduledProduct.js";
import { handleOneOffFunction } from "../attachFunctions/addProductFlow/handleOneOffFunction.js";
import { handleUpgradeSameInterval } from "../attachFunctions/upgradeSameIntFlow/handleUpgradeSameInt.js";
import { CusProductService } from "../../cusProducts/CusProductService.js";

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

  logger.info(`--------------------------------`);
  logger.info(
    `ATTACHING ${productIdsStr} to ${customer.name} (${customer.id || customer.email}), org: ${org.slug}`,
  );
  if (customer.entity) {
    logger.info(`Entity: ${customer.entity.name} (${customer.entity.id})`);
  }
  logger.info(
    `Branch: ${chalk.yellow(branch)}, Function: ${chalk.yellow(attachFunction)}`,
    {
      curMainProduct: curMainProduct?.product.id,
      curSameProduct: curSameProduct?.product.id,
      curScheduledProduct: curScheduledProduct?.product.id,
    },
  );

  // attachParams.billingAnchor = 1749902400000;
  // config.proration = ProrationBehavior.None;
  // config.carryUsage = true;

  if (attachFunction == AttachFunction.OneOff) {
    return await handleOneOffFunction({
      req,
      res,
      attachParams,
      config,
    });
  }

  // 1. Cancel future schedule before creating a new one...
  await deleteCurrentScheduledProduct({
    req,
    org,
    attachParams,
    logger,
  });

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
          comment: "autumn_downgrade",
        },
      });
    }
  }

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
      config,
    });
  }

  if (attachFunction == AttachFunction.ScheduleProduct) {
    return await handleScheduleFunction({
      req,
      res,
      attachParams,
    });
  }

  if (attachFunction == AttachFunction.UpgradeSameInterval) {
    return await handleUpgradeSameInterval({
      req,
      res,
      attachParams,
      config,
    });
  }

  if (attachFunction == AttachFunction.UpgradeDiffInterval) {
    return await handleUpgradeDiffInterval({
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
