import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { AttachBody } from "@autumn/shared";
import { getAttachBranch } from "../attachUtils/getAttachBranch.js";
import { getAttachConfig } from "../attachUtils/getAttachConfig.js";
import { AttachFunction } from "@autumn/shared";
import { getAttachFunction } from "../attachUtils/getAttachFunction.js";
import { cusProductToProduct } from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { attachParamToCusProducts } from "../attachUtils/convertAttachParams.js";
import { getDowngradeProductPreview } from "./getDowngradeProductPreview.js";
import { getNewProductPreview } from "./getNewProductPreview.js";
import { getUpgradeProductPreview } from "./getUpgradeProductPreview.js";

export const attachParamsToPreview = async ({
  req,
  attachParams,
  attachBody,
  logger,
}: {
  req: ExtendedRequest;
  attachParams: AttachParams;
  attachBody: AttachBody;
  logger: any;
}) => {
  // Handle existing product

  const branch = await getAttachBranch({
    req,
    attachBody,
    attachParams,
    fromPreview: true,
  });

  const { flags, config } = await getAttachConfig({
    req,
    attachParams,
    attachBody,
    branch,
  });

  const func = await getAttachFunction({
    branch,
    attachParams,
    attachBody,
    config,
  });

  logger.info("--------------------------------");
  logger.info(`ATTACH PREVIEW (org: ${attachParams.org.id})`);
  logger.info(`Branch: ${branch}, Function: ${func}`);

  let now = attachParams.now || Date.now();

  let preview: any = null;

  if (
    func == AttachFunction.AddProduct ||
    func == AttachFunction.CreateCheckout ||
    func == AttachFunction.OneOff
  ) {
    preview = await getNewProductPreview({
      branch,
      attachParams,
      logger,
      config,
    });
  }

  if (func == AttachFunction.ScheduleProduct) {
    preview = await getDowngradeProductPreview({
      attachParams,
      now,
      logger,
    });
  }

  if (
    func == AttachFunction.UpgradeDiffInterval ||
    func == AttachFunction.UpgradeSameInterval ||
    func == AttachFunction.UpdatePrepaidQuantity
  ) {
    preview = await getUpgradeProductPreview({
      req,
      attachParams,
      branch,
      now,
    });
  }

  const { curMainProduct, curScheduledProduct } = attachParamToCusProducts({
    attachParams,
  });

  return {
    branch,
    func,
    ...preview,
    current_product: curMainProduct
      ? cusProductToProduct({
          cusProduct: curMainProduct,
        })
      : null,
    scheduled_product: curScheduledProduct,
  };
};
