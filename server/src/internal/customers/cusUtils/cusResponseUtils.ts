import { processFullCusProducts } from "./cusUtils.js";
import {
  CusEntResponseSchema,
  Entity,
  Feature,
  FeatureType,
  FullCusProduct,
  FullCustomerEntitlement,
  Organization,
  Subscription,
} from "@autumn/shared";
import Stripe from "stripe";

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
