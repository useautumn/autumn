import { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
  cusProductToEnts,
  cusProductToPrices,
  cusProductToProduct,
} from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  AppEnv,
  Entity,
  Feature,
  FullCusProduct,
  Organization,
} from "@autumn/shared";
import Stripe from "stripe";

export const webhookToAttachParams = ({
  req,
  stripeCli,
  paymentMethod,
  cusProduct,
  entities,
}: {
  req: ExtendedRequest;
  stripeCli: Stripe;
  paymentMethod?: Stripe.PaymentMethod | null;
  cusProduct: FullCusProduct;
  entities?: Entity[];
}): AttachParams => {
  const fullProduct = cusProductToProduct({ cusProduct });

  return {
    stripeCli,
    paymentMethod,

    customer: cusProduct.customer!,
    org: req.org,
    products: [fullProduct],
    prices: cusProductToPrices({ cusProduct }),
    entitlements: cusProductToEnts({ cusProduct }),
    features: req.features,
    freeTrial: cusProduct.free_trial || null,
    optionsList: cusProduct.options,
    cusProducts: [cusProduct],

    internalEntityId: cusProduct.internal_entity_id || undefined,
    entities: entities || [],
  };
};
