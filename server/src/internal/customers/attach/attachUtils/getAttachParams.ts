import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { AttachBody } from "../models/AttachBody.js";
import { processAttachBody } from "./processAttachBody.js";
import { orgToVersion } from "@/utils/versionUtils.js";
import { APIVersion } from "@autumn/shared";
import { createStripeCli } from "@/external/stripe/utils.js";
import {
  getCusPaymentMethod,
  getStripeCus,
} from "@/external/stripe/stripeCusUtils.js";
import { AttachParams } from "../../cusProducts/AttachParams.js";
import { getStripeNow } from "@/utils/scriptUtils/testClockUtils.js";
import { formatUnixToDate } from "@/utils/genUtils.js";

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
  const [paymentMethod, { stripeCus, now }] = await Promise.all([
    getCusPaymentMethod({
      stripeCli,
      stripeId: customer.processor?.id,
    }),
    (async () => {
      try {
        const stripeCus = await getStripeCus({
          stripeCli,
          stripeId: customer.processor?.id,
        });
        const now = await getStripeNow({
          stripeCli,
          stripeCus,
        });
        return { stripeCus, now };
      } catch (error) {
        return { stripeCus: undefined, now: undefined };
      }
    })(),
  ]);

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
