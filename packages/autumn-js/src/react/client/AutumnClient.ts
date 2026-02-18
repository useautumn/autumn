import type { BillingAttachResponse, Customer, Plan } from "@useautumn/sdk";
import type { IAutumnClient } from "./IAutumnClient";
import { createHttpClient } from "./internal/httpClient";

/** Configuration for Autumn client */
export type AutumnClientConfig = {
	backendUrl?: string;
	pathPrefix: string;
	includeCredentials?: boolean;
};

export const createAutumnClient = (config: AutumnClientConfig): IAutumnClient => {
	const http = createHttpClient({
		backendUrl: config.backendUrl,
		pathPrefix: config.pathPrefix,
		includeCredentials: config.includeCredentials,
	});

	return {
		getOrCreateCustomer: (params) =>
			http.request<Customer | null>({
				route: "getOrCreateCustomer",
				body: params,
			}),
		attach: (params) =>
			http.request<BillingAttachResponse>({
				route: "attach",
				body: params,
			}),
		listPlans: () => http.request<Plan[]>({ route: "listPlans" }),
	};
};
