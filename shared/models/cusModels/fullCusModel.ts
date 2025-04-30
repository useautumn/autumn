import { Customer } from "./cusModels.js";
import { FullCusProduct } from "./cusProductModels.js";

export type FullCustomer = Customer & {
  customer_products: FullCusProduct[];
};
