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

const CheckoutResponseSchema = z.object({
  url: z.string().nullish(),
  customer_id: z.string().nullish(),
  scenario: z.nativeEnum(AttachScenario),
  lines: z.array(
    z.object({
      description: z.string(),
      amount: z.number(),
      item: ProductItemResponseSchema,
    }),
  ),
  // next_cycle: {
  //   lines
  // }
  product: ProductResponseSchema,
});

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

      res.status(200).json("ok");

      return;
    },
  });
