import {
  AttachBranch,
  AttachFunction,
  AttachScenario,
  CheckoutResponseSchema,
  FeatureOptions,
} from "@autumn/shared";

import { routeHandler } from "@/utils/routerUtils.js";
import { getAttachParams } from "../attachUtils/attachParams/getAttachParams.js";
import { AttachBody, AttachBodySchema } from "@autumn/shared";
import { ExtendedResponse } from "@/utils/models/Request.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { getAttachBranch } from "../attachUtils/getAttachBranch.js";
import { getAttachConfig } from "../attachUtils/getAttachConfig.js";
import { getAttachFunction } from "../attachUtils/getAttachFunction.js";
import { handleCreateCheckout } from "../../add-product/handleCreateCheckout.js";
import { checkStripeConnections } from "../attachRouter.js";
import { attachParamsToPreview } from "../handleAttachPreview/attachParamsToPreview.js";
import { previewToCheckoutRes } from "./previewToCheckoutRes.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { attachParamsToProduct } from "../attachUtils/convertAttachParams.js";
import { isPrepaidPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { priceToFeature } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { getPriceOptions } from "@/internal/products/prices/priceUtils.js";
import { getHasProrations } from "./getHasProrations.js";

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

const getCheckoutOptions = async ({
  req,
  attachParams,
}: {
  req: ExtendedRequest;
  attachParams: AttachParams;
}) => {
  const product = attachParamsToProduct({ attachParams });
  const prepaidPrices = product.prices.filter((p) =>
    isPrepaidPrice({ price: p })
  );

  let newOptions: FeatureOptions[] = structuredClone(attachParams.optionsList);
  for (const prepaidPrice of prepaidPrices) {
    const feature = priceToFeature({
      price: prepaidPrice,
      features: req.features,
    });
    let option = getPriceOptions(prepaidPrice, attachParams.optionsList);
    if (!option) {
      newOptions.push({
        feature_id: feature?.id!,
        internal_feature_id: feature?.internal_id,
        quantity: 1,
      });
    }
  }

  attachParams.optionsList = newOptions;
  return newOptions;
};

export const handleCheckout = (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "attach-preview",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { logger, features } = req;
      const attachBody = AttachBodySchema.parse(req.body);
      // Pre-populate options...

      const { attachParams, flags, branch, config, func } = await getAttachVars(
        { req, attachBody }
      );

      await getCheckoutOptions({
        req,
        attachParams,
      });

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

        const customer = attachParams.customer;
        res.status(200).json(
          CheckoutResponseSchema.parse({
            url: checkout?.url,
            customer_id: customer.id || customer.internal_id,
            scenario: AttachScenario.New,
            lines: [],
            product: await getProductResponse({
              product: attachParams.products[0],
              features: features,
              withDisplay: false,
              options: attachParams.optionsList,
            }),
          })
        );
        return;
      }

      const preview = await attachParamsToPreview({
        req,
        attachParams,
        logger,
        attachBody,
        withPrepaid: true,
      });

      const checkoutRes = await previewToCheckoutRes({
        req,
        attachParams,
        preview,
      });

      // Get has prorations
      const hasProrations = await getHasProrations({
        req,
        branch,
        attachParams,
      });

      res.status(200).json({
        ...checkoutRes,
        options: attachParams.optionsList.map((o) => ({
          quantity: o.quantity,
          feature_id: o.feature_id,
        })),
        has_prorations: hasProrations,
      });

      return;
    },
  });
