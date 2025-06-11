import { handleAddProduct } from "@/internal/customers/attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { handleUpgradeDiffInterval } from "@/internal/customers/attach/attachFunctions/upgradeDiffIntFlow/handleUpgradeDiffInt.js";
import { handleUpgradeSameInterval } from "@/internal/customers/attach/attachFunctions/upgradeSameIntFlow/handleUpgradeSameInt.js";
import { intervalsAreSame } from "@/internal/customers/attach/attachUtils/getAttachConfig.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  AttachBranch,
  AttachConfig,
  AttachFunction,
  ProrationBehavior,
} from "@autumn/shared";

const getAttachFunction = async ({
  attachParams,
}: {
  attachParams: AttachParams;
}) => {
  if (isFreeProduct(attachParams.prices)) {
    return AttachFunction.AddProduct;
  }

  const sameIntervals = intervalsAreSame({ attachParams });

  if (sameIntervals) {
    return AttachFunction.UpgradeSameInterval;
  }

  return AttachFunction.UpgradeDiffInterval;
};

export const runMigrationAttach = async ({
  req,
  attachParams,
}: {
  req: ExtendedRequest;
  attachParams: AttachParams;
}) => {
  const { logtail: logger } = req;
  const sameIntervals = intervalsAreSame({ attachParams });
  const branch = AttachBranch.NewVersion;

  // Set config
  let config: AttachConfig = {
    onlyCheckout: false,
    carryUsage: true,
    branch,
    proration: ProrationBehavior.None,
    disableTrial: true,
    invoiceOnly: false,
    disableMerge: false,
    sameIntervals,
    carryTrial: true,
  };

  let attachFunction = await getAttachFunction({ attachParams });

  let customer = attachParams.customer;
  logger.info(`--------------------------------`);
  logger.info(
    `Running migration for ${customer.id}, function: ${attachFunction}`,
  );

  if (attachFunction == AttachFunction.AddProduct) {
    return await handleAddProduct({
      req,
      attachParams,
      config,
    });
  } else if (attachFunction == AttachFunction.UpgradeSameInterval) {
    return await handleUpgradeSameInterval({
      req,
      attachParams,
      config,
    });
  } else if (attachFunction == AttachFunction.UpgradeDiffInterval) {
    return await handleUpgradeDiffInterval({
      req,
      attachParams,
      config,
    });
  }
};
