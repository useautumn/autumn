import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { AttachBody } from "../models/AttachBody.js";
import { processAttachBody } from "./processAttachBody.js";
import { orgToVersion } from "@/utils/versionUtils.js";
import { APIVersion } from "@autumn/shared";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";

export const getAttachParams = async ({
  req,
  attachBody,
}: {
  req: ExtendedRequest;
  attachBody: AttachBody;
}) => {
  const {
    customer,
    products,
    optionsList,
    prices,
    entitlements,
    freeTrial,
    customPrices,
    customEnts,
  } = await processAttachBody({
    req,
    attachBody,
  });

  const { org, env } = req;

  const apiVersion =
    orgToVersion({
      org,
      reqApiVersion: req.apiVersion,
    }) || APIVersion.v1;

  const internalEntityId = attachBody.entity_id
    ? customer.entities.find(
        (e) =>
          e.id === attachBody.entity_id ||
          e.internal_id === attachBody.entity_id,
      )?.internal_id
    : undefined;

  const stripeCli = createStripeCli({ org, env });
  const paymentMethod = await getCusPaymentMethod({
    stripeCli,
    stripeId: customer.processor?.id,
  });

  const attachParams: AttachParams = {
    stripeCli,
    paymentMethod,

    customer,
    products,
    optionsList,
    prices,
    entitlements,
    freeTrial,

    // From req
    req,
    org: req.org,
    entities: customer.entities,
    features: req.features,
    internalEntityId,
    cusProducts: customer.customer_products,

    // Others
    apiVersion,
    successUrl: attachBody.success_url,
    invoiceOnly: attachBody.invoice_only,
    billingAnchor: attachBody.billing_cycle_anchor,
    metadata: attachBody.metadata,
    disableFreeTrial: attachBody.free_trial === false || false,
    checkoutSessionParams: attachBody.checkout_session_params,
    isCustom: attachBody.is_custom,
  };

  return {
    attachParams,
    customPrices,
    customEnts,
  };
};
