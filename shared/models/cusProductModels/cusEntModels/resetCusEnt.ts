import type { Customer } from "../../cusModels/cusModels.js";
import type { CusProduct } from "../cusProductModels.js";
import {
	CustomerEntitlement,
	type FullCustomerEntitlement,
} from "./cusEntModels.js";

export type ResetCusEnt = FullCustomerEntitlement & {
	customer: Customer;
	customer_product: CusProduct;
};
