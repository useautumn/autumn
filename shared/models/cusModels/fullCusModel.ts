import { Customer } from "./cusModels.js";
import { FullCusProduct } from "./cusProductModels.js";
import { Entity } from "./entityModels/entityModels.js";

export type FullCustomer = Customer & {
  customer_products: FullCusProduct[];
  entities: Entity[];
  entity: Entity;
  trials_used: {
    product_id: string;
    customer_id: string;
    fingerprint: string;
  }[];
};
