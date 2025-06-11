import { FullCusProduct } from "../cusProductModels/cusProductModels.js";
import { Subscription } from "../subModels/subModels.js";
import { Customer } from "./cusModels.js";
import { Entity } from "./entityModels/entityModels.js";
import { Invoice } from "./invoiceModels/invoiceModels.js";

export type FullCustomer = Customer & {
  customer_products: FullCusProduct[];
  entities: Entity[];
  entity?: Entity;
  trials_used?: {
    product_id: string;
    customer_id: string;
    fingerprint: string;
  }[];
  invoices?: Invoice[];
  subscriptions?: Subscription[];
};
