import {
  AttachFunction,
  AttachScenario,
  FreeTrialResponseSchema,
  ProductItemResponseSchema,
  ProductResponseSchema,
} from "@autumn/shared";
import { routeHandler } from "@/utils/routerUtils.js";
import { getAttachParams } from "../attachUtils/attachParams/getAttachParams.js";
import { AttachBody, AttachBodySchema } from "../models/AttachBody.js";
import { ExtendedResponse } from "@/utils/models/Request.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { getAttachBranch } from "../attachUtils/getAttachBranch.js";
import { getAttachConfig } from "../attachUtils/getAttachConfig.js";
import { getAttachFunction } from "../attachUtils/getAttachFunction.js";
import { handleCreateCheckout } from "../../add-product/handleCreateCheckout.js";
import { z } from "zod";
import { checkStripeConnections } from "../attachRouter.js";
import { attachParamsToPreview } from "../handleAttachPreview/attachParamsToPreview.js";
import { CheckoutResponseSchema } from "./CheckoutResponse.js";
import { previewToCheckoutRes } from "./previewToCheckoutRes.js";

const getAttachVars = async ({
  req,
  attachBody,
}: {
  req: ExtendedRequest;
  attachBody: AttachBody;
}) => {
  const { attachParams } = await getAttachParams({
    req,
    attachBody,
  });

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

  return {
    attachParams,
    flags,
    branch,
    config,
    func,
  };
};

export const handleCheckout = (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "attach-preview",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { logtail: logger } = req;
      const attachBody = AttachBodySchema.parse(req.body);

      const { attachParams, flags, branch, config, func } = await getAttachVars(
        { req, attachBody },
      );

      if (func == AttachFunction.CreateCheckout) {
        await checkStripeConnections({
          req,
          attachParams,
          createCus: true,
          useCheckout: true,
        });

        const checkout = await handleCreateCheckout({
          req,
          res,
          attachParams,
          returnCheckout: true,
        });

        res.status(200).json(CheckoutResponseSchema.parse(checkout));
        return;
      }

      const preview = await attachParamsToPreview({
        req,
        attachParams,
        logger,
        attachBody,
      });

      const checkoutRes = previewToCheckoutRes({ preview });

      res.status(200).json(checkoutRes);

      return;
    },
  });
