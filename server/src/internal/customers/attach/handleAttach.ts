import { handleAttachRaceCondition } from "@/external/redis/redisUtils.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { AttachBodySchema } from "./models/AttachBody.js";
import { getAttachParams } from "./attachUtils/getAttachParams.js";
import { getAttachBranch } from "./attachUtils/getAttachBranch.js";
import { getAttachConfig } from "./attachUtils/getAttachConfig.js";
import { handleAttachErrors } from "./attachUtils/handleAttachErrors.js";
import { checkStripeConnections, createStripePrices } from "./attachRouter.js";
import { insertCustomItems } from "./attachUtils/insertCustomItems.js";
import { runAttachFunction } from "./attachUtils/getAttachFunction.js";

export const handleAttach = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "attach",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      await handleAttachRaceCondition({ req, res });

      const attachBody = AttachBodySchema.parse(req.body);
      const logger = req.logtail;

      const { attachParams, customPrices, customEnts } = await getAttachParams({
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

      await handleAttachErrors({
        attachParams,
        attachBody,
        branch,
        flags,
        config,
      });

      await checkStripeConnections({ req, attachParams });
      await createStripePrices({
        attachParams,
        useCheckout: config.onlyCheckout,
        req,
        logger,
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
  });
