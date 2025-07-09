import { balancesToFeatureResponse } from "./balancesToFeatureResponse.js";
import {
  FullCusProduct,
  Organization,
  Entity,
  APIVersion,
} from "@autumn/shared";
import {
  cusProductsToCusEnts,
  cusProductsToCusPrices,
} from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { getCusBalances } from "./getCusBalances.js";

export const getCusFeaturesResponse = async ({
  cusProducts,
  org,
  entity,
  apiVersion,
}: {
  cusProducts: FullCusProduct[];
  org: Organization;
  entity?: Entity;
  apiVersion: APIVersion;
}) => {
  let cusEnts = cusProductsToCusEnts({ cusProducts }) as any;

  const balances = await getCusBalances({
    cusEntsWithCusProduct: cusEnts,
    cusPrices: cusProductsToCusPrices({ cusProducts }),
    org,
    entity,
    apiVersion,
  });

  return balancesToFeatureResponse({
    cusEnts,
    balances,
  });
};
