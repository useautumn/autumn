import {
  AttachParams,
  InsertCusProductParams,
} from "@/internal/customers/cusProducts/AttachParams.js";
import {
  cusProductToEnts,
  cusProductToPrices,
  cusProductToProduct,
} from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { Entity, FullCusProduct, FullCustomer } from "@autumn/shared";
import Stripe from "stripe";

export const webhookToAttachParams = ({
  req,
  stripeCli,
  paymentMethod,
  cusProduct,
  fullCus,
  entities,
}: {
  req: ExtendedRequest;
  stripeCli: Stripe;
  paymentMethod?: Stripe.PaymentMethod | null;
  cusProduct: FullCusProduct;
  fullCus: FullCustomer;
  entities?: Entity[];
}): AttachParams => {
  const fullProduct = cusProductToProduct({ cusProduct });

  const params: AttachParams = {
    stripeCli,
    paymentMethod,
    customer: fullCus,
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
    replaceables: [],
  };

  return params;
};

export const webhookToInsertParams = ({
  req,
  cusProduct,
  fullCus,
  entities,
}: {
  req: ExtendedRequest;
  cusProduct: FullCusProduct;
  fullCus: FullCustomer;
  entities?: Entity[];
}): InsertCusProductParams => {
  const fullProduct = cusProductToProduct({ cusProduct });

  const params: InsertCusProductParams = {
    customer: fullCus,
    org: req.org,
    product: fullProduct,
    prices: cusProductToPrices({ cusProduct }),
    entitlements: cusProductToEnts({ cusProduct }),
    features: req.features,
    freeTrial: cusProduct.free_trial || null,
    optionsList: cusProduct.options,
    cusProducts: [cusProduct],

    internalEntityId: cusProduct.internal_entity_id || undefined,
    entities: entities || [],
    replaceables: [],
  };

  return params;
};
