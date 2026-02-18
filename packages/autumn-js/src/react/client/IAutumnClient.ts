import type { BillingAttachResponse, Customer, Plan } from "@useautumn/sdk";
import type {
	AttachParams,
	GetOrCreateCustomerClientParams,
} from "../../types";

/** Client interface matching backend RPC routes */
export interface IAutumnClient {
	getOrCreateCustomer: (
		params?: GetOrCreateCustomerClientParams,
	) => Promise<Customer | null>;
	attach: (params: AttachParams) => Promise<BillingAttachResponse>;
	listPlans: () => Promise<Plan[]>;
}
