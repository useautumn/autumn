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
import { attachParamsToProduct } from "../attachUtils/convertAttachParams.js";
import { CheckProductPreview } from "@autumn/shared";
import { getUpgradeProductPreview } from "./getUpgradeProductPreview.js";

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

      const { org, features } = attachParams;
      const product = attachParamsToProduct({
        attachParams,
      });

      let preview: any = null;

      if (
        func == AttachFunction.AddProduct ||
        func == AttachFunction.CreateCheckout
      ) {
        preview = await getNewProductPreview({
          org,
          product,
          features,
        });
      }

      if (func == AttachFunction.UpdateProduct) {
        preview = await getUpgradeProductPreview({
          req,
          attachParams,
        });
      }

      res.status(200).json({ preview });
    },
  });
