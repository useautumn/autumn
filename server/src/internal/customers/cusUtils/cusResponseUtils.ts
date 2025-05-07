import { processFullCusProducts } from "@/internal/api/customers/cusUtils.js";
import {
  CusEntResponseSchema,
  CusProductResponse,
  Entity,
  Feature,
  FeatureType,
  FullCusProduct,
  FullCustomerEntitlement,
  Organization,
} from "@autumn/shared";
import Stripe from "stripe";
import { fullCusProductToCusPrices } from "../products/cusProductUtils.js";
import { fullCusProductToCusEnts } from "../products/cusProductUtils.js";
import { getCusBalances } from "../entitlements/getCusBalances.js";
import { featuresToObject } from "@/internal/api/customers/getCustomerDetails.js";

export const getCusProductsResponse = async ({
  cusProducts,
  subs,
  org,
}: {
  cusProducts: FullCusProduct[];
  subs: Stripe.Subscription[];
  org: Organization;
}) => {
  const { main, addOns } = processFullCusProducts({
    fullCusProducts: cusProducts,
    subs,
    org,
  });

  let products: any = [...main, ...addOns];

  let productObject: Record<string, CusProductResponse> = {};
  for (let product of products) {
    productObject[product.id] = product as any;
  }
  products = productObject;

  return products;
};

export const getCusFeaturesResponse = async ({
  cusProducts,
  org,
  entities,
}: {
  cusProducts: FullCusProduct[];
  org: Organization;
  entities: Entity[];
}) => {
  let cusEnts = fullCusProductToCusEnts(cusProducts) as any;

  const balances = await getCusBalances({
    cusEntsWithCusProduct: cusEnts,
    cusPrices: fullCusProductToCusPrices(cusProducts),
    entities,
    org,
  });

  let features = cusEnts.map(
    (cusEnt: FullCustomerEntitlement) => cusEnt.entitlement.feature
  );

  let entList: any = balances.map((b) => {
    let isBoolean =
      features.find((f: Feature) => f.id == b.feature_id)?.type ==
      FeatureType.Boolean;
    if (b.unlimited || isBoolean) {
      return b;
    }

    return CusEntResponseSchema.parse({
      ...b,
      usage: b.used,
      included_usage: b.allowance,
    });
  });

  entList = featuresToObject({
    features,
    entList,
  });

  return entList;
};
