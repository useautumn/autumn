import { handleAttachRaceCondition } from "@/external/redis/redisUtils.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { AttachBodySchema } from "@autumn/shared";
import { getAttachParams } from "./attachUtils/attachParams/getAttachParams.js";
import { getAttachBranch } from "./attachUtils/getAttachBranch.js";
import { getAttachConfig } from "./attachUtils/getAttachConfig.js";
import { handleAttachErrors } from "./attachUtils/handleAttachErrors.js";
import { checkStripeConnections, createStripePrices } from "./attachRouter.js";
import { insertCustomItems } from "./attachUtils/insertCustomItems.js";
import { runAttachFunction } from "./attachUtils/getAttachFunction.js";

import { tracerootInitialized } from "@/external/traceroot/tracerootUtils.js";
import * as traceroot from "traceroot-sdk-ts";
// import { get_logger } from "traceroot-sdk-ts";
const runAttachWithTraceroot = async ({
  function: functionToTrace,
  spanName,
}: {
  function: any;
  spanName: string;
}): Promise<any> => {
  if (tracerootInitialized) {
    const tracedFunction = traceroot.traceFunction(functionToTrace, {
      spanName: spanName,
    });

    return await tracedFunction();
  } else {
    return await functionToTrace();
  }
};

export const handleAttach = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "attach",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { logger } = req;
      await handleAttachRaceCondition({ req, res });

      await runAttachWithTraceroot({
        function: async () => {
          const attachBody = AttachBodySchema.parse(req.body);

          const { attachParams, customPrices, customEnts } =
            await getAttachParams({
              req,
              attachBody,
            });

          logger.info("Testing traceroot");
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

          await handleAttachErrors({
            attachParams,
            attachBody,
            branch,
            flags,
            config,
          });

          await checkStripeConnections({
            req,
            attachParams,
            useCheckout: config.onlyCheckout,
          });

          await insertCustomItems({
            db: req.db,
            customPrices: customPrices || [],
            customEnts: customEnts || [],
          });

          await runAttachFunction({
            req,
            res,
            attachParams,
            branch,
            attachBody,
            config,
          });
        },
        spanName: "handleAttach",
      });
    },
  });

//   try {
//     // Use traceFunction for proper span creation

//   } catch (traceError) {
//     console.warn('⚠️ traceFunction failed, falling back to regular function:', traceError);
//     return makeTracedCodeRequest(query);
//   }
// }
// return makeTracedCodeRequest(query);
