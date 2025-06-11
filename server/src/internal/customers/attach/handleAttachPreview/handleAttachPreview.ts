import { routeHandler } from "@/utils/routerUtils.js";

import { getAttachParams } from "../attachUtils/attachParams/getAttachParams.js";
import { AttachBodySchema } from "../models/AttachBody.js";

import { ExtendedResponse } from "@/utils/models/Request.js";
import { ExtendedRequest } from "@/utils/models/Request.js";

import { attachParamsToPreview } from "./attachParamsToPreview.js";

export const handleAttachPreview = (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "attach-preview",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { logtail: logger } = req;
      const attachBody = AttachBodySchema.parse(req.body);

      const { attachParams } = await getAttachParams({
        req,
        attachBody,
      });

      const attachPreview = await attachParamsToPreview({
        req,
        attachParams,
        attachBody,
        logger,
      });

      res.status(200).json(attachPreview);
      return;

      // // Handle existing product
      // const branch = await getAttachBranch({
      //   req,
      //   attachBody,
      //   attachParams,
      //   fromPreview: true,
      // });

      // const { flags, config } = await getAttachConfig({
      //   req,
      //   attachParams,
      //   attachBody,
      //   branch,
      // });

      // const func = await getAttachFunction({
      //   branch,
      //   attachParams,
      //   attachBody,
      //   config,
      // });

      // logger.info("--------------------------------");
      // logger.info(`ATTACH PREVIEW (org: ${attachParams.org.id})`);
      // logger.info(`Branch: ${branch}, Function: ${func}`);

      // let now = attachParams.now || Date.now();

      // let preview: any = null;

      // if (
      //   func == AttachFunction.AddProduct ||
      //   func == AttachFunction.CreateCheckout ||
      //   func == AttachFunction.OneOff
      // ) {
      //   preview = await getNewProductPreview({
      //     attachParams,
      //     now,
      //     logger,
      //   });
      // }

      // if (func == AttachFunction.ScheduleProduct) {
      //   preview = await getDowngradeProductPreview({
      //     attachParams,
      //     now,
      //     logger,
      //   });
      // }

      // if (
      //   func == AttachFunction.UpgradeDiffInterval ||
      //   func == AttachFunction.UpdatePrepaidQuantity ||
      //   func == AttachFunction.UpgradeSameInterval
      // ) {
      //   preview = await getUpgradeProductPreview({
      //     req,
      //     attachParams,
      //     branch,
      //     now,
      //   });
      // }

      // const { curMainProduct, curScheduledProduct } = attachParamToCusProducts({
      //   attachParams,
      // });

      // res.status(200).json({
      //   branch,
      //   ...preview,
      //   current_product: curMainProduct
      //     ? cusProductToProduct({
      //         cusProduct: curMainProduct,
      //       })
      //     : null,
      //   scheduled_product: curScheduledProduct,
      // });
    },
  });
