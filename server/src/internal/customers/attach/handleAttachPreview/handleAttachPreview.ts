import { routeHandler } from "@/utils/routerUtils.js";
import { getAttachBranch } from "../attachUtils/getAttachBranch.js";
import { getAttachParams } from "../attachUtils/getAttachParams.js";
import { AttachBodySchema } from "../models/AttachBody.js";
import { getAttachConfig } from "../attachUtils/getAttachConfig.js";
import { getAttachFunction } from "../attachUtils/getAttachFunction.js";
import { ExtendedResponse } from "@/utils/models/Request.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachFunction } from "../models/AttachBranch.js";
import { getNewProductPreview } from "./getNewProductPreview.js";
import { getUpgradeProductPreview } from "./getUpgradeProductPreview.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";
import { getUpdateEntsPreview } from "./getUpdateEntsPreview.js";
import { getDowngradeProductPreview } from "./getDowngradeProductPreview.js";
import { attachParamToCusProducts } from "../attachUtils/convertAttachParams.js";
import { cusProductToProduct } from "../../cusProducts/cusProductUtils/convertCusProduct.js";

export const handleAttachPreview = (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "attach-preview",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const attachBody = AttachBodySchema.parse(req.body);

      const { attachParams } = await getAttachParams({
        req,
        attachBody,
      });

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

      console.log(`Branch: ${branch}, Function: ${func}`);

      const { stripeCli, stripeCus } = attachParams;
      const now = await getStripeNow({ stripeCli, stripeCus });

      let preview: any = null;

      if (func == AttachFunction.UpdateEnts) {
        preview = await getUpdateEntsPreview({
          req,
          attachParams,
          now,
        });
      }

      if (
        func == AttachFunction.AddProduct ||
        func == AttachFunction.CreateCheckout
      ) {
        preview = await getNewProductPreview({
          attachParams,
          now,
        });
      }

      if (func == AttachFunction.ScheduleProduct) {
        preview = await getDowngradeProductPreview({
          attachParams,
          now,
        });
      }

      if (
        func == AttachFunction.UpdateProduct ||
        func == AttachFunction.UpdatePrepaidQuantity
      ) {
        preview = await getUpgradeProductPreview({
          req,
          attachParams,
          branch,
          now,
        });
      }

      const { curMainProduct } = attachParamToCusProducts({ attachParams });
      res.status(200).json({
        branch,
        ...preview,
        current_product: curMainProduct
          ? cusProductToProduct({
              cusProduct: curMainProduct,
            })
          : null,
      });
    },
  });
