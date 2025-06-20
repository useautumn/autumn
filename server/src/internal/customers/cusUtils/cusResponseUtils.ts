import { processFullCusProducts } from "./cusUtils.js";
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

import { getCusBalances } from "../cusProducts/cusEnts/getCusBalances.js";
import { featuresToObject } from "./getCustomerDetails.js";
import {
  cusProductsToCusEnts,
  cusProductsToCusPrices,
} from "../cusProducts/cusProductUtils/convertCusProduct.js";
import { notNullish } from "@/utils/genUtils.js";
import { cusEntEntityMatch } from "../cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";

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
  entity,
}: {
  cusProducts: FullCusProduct[];
  org: Organization;
  entity?: Entity;
}) => {
  let cusEnts = cusProductsToCusEnts({ cusProducts }) as any;

  // cusEnts = cusEnts.filter((ce: FullCustomerEntitlement) => {
  //   // return cusEntEntityMatch({ cusEnt: ce, entity });
  // });

  const balances = await getCusBalances({
    cusEntsWithCusProduct: cusEnts,
    cusPrices: cusProductsToCusPrices({ cusProducts }),
    org,
    entity,
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
