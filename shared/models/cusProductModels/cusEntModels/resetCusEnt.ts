import { Customer } from "../../cusModels/cusModels.js";
import { CusProduct } from "../cusProductModels.js";
import {
	CustomerEntitlement,
	FullCustomerEntitlement,
} from "./cusEntModels.js";

export type ResetCusEnt = FullCustomerEntitlement & {
	customer: Customer;
	customer_product: CusProduct | null;
};
