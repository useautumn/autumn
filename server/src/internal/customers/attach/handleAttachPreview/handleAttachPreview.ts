import { routeHandler } from "@/utils/routerUtils.js";

import { getAttachParams } from "../attachUtils/attachParams/getAttachParams.js";
import { AttachBodySchema } from "@autumn/shared";

import { ExtendedResponse } from "@/utils/models/Request.js";
import { ExtendedRequest } from "@/utils/models/Request.js";

import { attachParamsToPreview } from "./attachParamsToPreview.js";
import * as traceroot from "traceroot-sdk-ts";

export const handleAttachPreview = (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "attach-preview",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const tracedFunction = traceroot.traceFunction(async () => {
        const { logtail: logger } = req;
        const attachBody = AttachBodySchema.parse(req.body);

        // console.log("attachBody", attachBody);
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
      }, { spanName: 'handleAttachPreview' });
      
      return await tracedFunction();
    },
  });
