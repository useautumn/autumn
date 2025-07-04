import {
  CusProductResponse,
  Entity,
  Feature,
  Organization,
} from "@autumn/shared";
import { getCusProductResponse } from "./getCusProductRepsonse.js";

export const processFullCusProducts = async ({
  fullCusProducts,
  subs,
  org,
  entities = [],
  apiVersion,
  features,
}: {
  fullCusProducts: any;
  subs: any;
  org: Organization;
  entities?: Entity[];
  apiVersion: number;
  features: Feature[];
}) => {
  // Process full cus products
  let main = [];
  let addOns = [];
  for (const cusProduct of fullCusProducts) {
    let processed = await getCusProductResponse({
      cusProduct,
      subs,
      org,
      entities,
      apiVersion,
      features,
    });

    let isAddOn = cusProduct.product.is_add_on;
    if (isAddOn) {
      addOns.push(processed);
    } else {
      main.push(processed);
    }
  }

  return {
    main: main as CusProductResponse[],
    addOns: addOns as CusProductResponse[],
  };
};
