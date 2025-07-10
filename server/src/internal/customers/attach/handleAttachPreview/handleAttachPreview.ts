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
    },
  });
