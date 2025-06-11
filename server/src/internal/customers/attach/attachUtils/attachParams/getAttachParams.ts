import { listCusPaymentMethods } from "@/external/stripe/stripeCusUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachBody } from "../../models/AttachBody.js";
import { processAttachBody } from "./processAttachBody.js";
import { orgToVersion } from "@/utils/versionUtils.js";
import { APIVersion } from "@autumn/shared";
import { AttachParams } from "../../../cusProducts/AttachParams.js";

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
    stripeVars,
  } = await processAttachBody({
    req,
    attachBody,
  });

  const { org } = req;

  const apiVersion =
    orgToVersion({
      org,
      reqApiVersion: req.apiVersion,
    }) || APIVersion.v1;

  const entityId = attachBody.entity_id;
  const internalEntityId = entityId ? customer.entity?.internal_id : undefined;
  const { stripeCli, stripeCus, paymentMethod, now } = stripeVars;

  const attachParams: AttachParams = {
    stripeCli,
    stripeCus,
    now,
    paymentMethod,

    customer,
    products,
    optionsList,
    prices,
    entitlements,
    freeTrial,
    replaceables: [],

    // From req
    req,
    org: req.org,
    entities: customer.entities,
    features: req.features,
    internalEntityId,
    entityId: entityId || undefined,
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
