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
  Subscription,
} from "@autumn/shared";
import Stripe from "stripe";
import { fullCusProductToCusPrices } from "../products/cusProductUtils.js";
import { fullCusProductToCusEnts } from "../products/cusProductUtils.js";
import { getCusBalances } from "../entitlements/getCusBalances.js";
import { featuresToObject } from "@/internal/api/customers/getCustomerDetails.js";

export const getCusProductsResponse = async ({
  cusProducts,
  entities,
  subs,
  org,
  apiVersion,
}: {
  cusProducts: FullCusProduct[];
  entities: Entity[];
  subs: (Stripe.Subscription | Subscription)[];
  org: Organization;
  apiVersion: number;
}) => {
  const { main, addOns } = processFullCusProducts({
    fullCusProducts: cusProducts,
    subs,
    org,
    entities,
    apiVersion,
  });

  let products: any = [...main, ...addOns];

  return products;
};

export const getCusFeaturesResponse = async ({
  cusProducts,
  org,
  entities,
  entityId,
}: {
  cusProducts: FullCusProduct[];
  org: Organization;
  entities: Entity[];
  entityId?: string;
}) => {
  let cusEnts = fullCusProductToCusEnts(cusProducts) as any;

  const balances = await getCusBalances({
    cusEntsWithCusProduct: cusEnts,
    cusPrices: fullCusProductToCusPrices(cusProducts),
    entities,
    org,
    entityId,
  });

  let features = cusEnts.map(
    (cusEnt: FullCustomerEntitlement) => cusEnt.entitlement.feature,
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
