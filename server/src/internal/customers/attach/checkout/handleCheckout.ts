import { AttachFunction, FeatureOptions } from "@autumn/shared";

import { routeHandler } from "@/utils/routerUtils.js";
import { getAttachParams } from "../attachUtils/attachParams/getAttachParams.js";
import { AttachBody, AttachBodySchema } from "@autumn/shared";
import { ExtendedResponse } from "@/utils/models/Request.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { getAttachBranch } from "../attachUtils/getAttachBranch.js";
import { getAttachConfig } from "../attachUtils/getAttachConfig.js";
import { getAttachFunction } from "../attachUtils/getAttachFunction.js";
import { handleCreateCheckout } from "../../add-product/handleCreateCheckout.js";
import {
  checkStripeConnections,
  handlePrepaidErrors,
} from "../attachRouter.js";
import { attachParamsToPreview } from "../handleAttachPreview/attachParamsToPreview.js";
import { previewToCheckoutRes } from "./previewToCheckoutRes.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { attachParamsToProduct } from "../attachUtils/convertAttachParams.js";
import { isPrepaidPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { priceToFeature } from "@/internal/products/prices/priceUtils/convertPrice.js";
import { getPriceOptions } from "@/internal/products/prices/priceUtils.js";
import { getHasProrations } from "./getHasProrations.js";
import { handleCreateInvoiceCheckout } from "../../add-product/handleCreateInvoiceCheckout.js";
import { z } from "zod";
import { formatUnixToDate, notNullish } from "@/utils/genUtils.js";

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

      const { attachParams, branch, func, config } = await getAttachVars({
        req,
        attachBody,
      });

      let checkoutUrl = null;

      if (func == AttachFunction.CreateCheckout) {
        await checkStripeConnections({
          req,
          attachParams,
          createCus: true,
          useCheckout: true,
        });

        await handlePrepaidErrors({
          attachParams,
          config,
          useCheckout: config.onlyCheckout,
        });

        if (config.invoiceCheckout) {
          const result = await handleCreateInvoiceCheckout({
            req,
            attachParams,
            attachBody,
            branch,
            config,
          });

          checkoutUrl = result?.invoices?.[0]?.hosted_invoice_url;
        } else {
          const checkout = await handleCreateCheckout({
            req,
            res,
            attachParams,
            config,
            returnCheckout: true,
          });

          checkoutUrl = checkout?.url;
        }
      }

      console.log(`Branch: ${branch}, Func: ${func}`);

      await getCheckoutOptions({
        req,
        attachParams,
      });

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
        branch,
      });

      // Get has prorations
      const hasProrations = await getHasProrations({
        req,
        branch,
        attachParams,
      });

      if (checkoutRes.next_cycle) {
        const nextCycle = checkoutRes.next_cycle;
      }

      res.status(200).json({
        ...checkoutRes,
        url: checkoutUrl,
        options: attachParams.optionsList.map((o) => ({
          quantity: o.quantity,
          feature_id: o.feature_id,
        })),
        has_prorations: hasProrations,
      });

      return;
    },
  });
