import { createStripeCli } from "@/external/stripe/utils.js";
import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  APIVersion,
  Feature,
  FullCusProduct,
  FullCustomer,
  FullProduct,
} from "@autumn/shared";
import { getStripeCusData } from "./attachParamsUtils/getStripeCusData.js";
import { getFreeTrialAfterFingerprint } from "@/internal/products/free-trials/freeTrialUtils.js";
import { orgToVersion } from "@/utils/versionUtils.js";

export const checkToAttachParams = async ({
  req,
  customer,
  product,
  logger,
}: {
  req: ExtendedRequest;
  customer: FullCustomer;
  product: FullProduct;
  logger: any;
}) => {
  const { org, env, db } = req;

  const apiVersion =
    orgToVersion({
      org,
      reqApiVersion: req.apiVersion,
    }) || APIVersion.v1;

  const stripeCli = createStripeCli({ org, env });
  let stripeCusData = await getStripeCusData({
    stripeCli,
    db,
    org,
    env,
    customer,
    logger,
    allowNoStripe: true,
  });

  let freeTrial = await getFreeTrialAfterFingerprint({
    db,
    freeTrial: product.free_trial,
    fingerprint: customer.fingerprint,
    internalCustomerId: customer.internal_id,
    multipleAllowed: org.config.multiple_trials,
    productId: product.id,
  });

  const { stripeCus, paymentMethod, now } = stripeCusData;

  const attachParams: AttachParams = {
    stripeCli,
    stripeCus,
    now,
    paymentMethod,

    customer,
    products: [product],
    optionsList: [],
    prices: product.prices,
    entitlements: product.entitlements,
    freeTrial,
    replaceables: [],

    // Others
    req,
    org: req.org,
    entities: customer.entities,
    features: req.features,
    internalEntityId: customer.entity?.internal_id,
    cusProducts: customer.customer_products,

    // Others
    apiVersion,
    // successUrl: attachBody.success_url,
    // invoiceOnly: attachBody.invoice_only,
    // billingAnchor: attachBody.billing_cycle_anchor,
    // metadata: attachBody.metadata,
    // disableFreeTrial: attachBody.free_trial === false || false,
    // checkoutSessionParams: attachBody.checkout_session_params,
    // isCustom: attachBody.is_custom,
  };

  return attachParams;
};
