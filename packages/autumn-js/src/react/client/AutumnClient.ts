import type {
	AggregateEventsResponse,
	BillingAttachResponse,
	CreateReferralCodeResponse,
	Customer,
	ListEventsResponse,
	ListPlansResponse,
	OpenCustomerPortalResponse,
	RedeemReferralCodeResponse,
} from "@useautumn/sdk";
import type { IAutumnClient } from "./IAutumnClient";
import { createHttpClient } from "./internal/httpClient";

/** Configuration for Autumn client */
export type AutumnClientConfig = {
	backendUrl?: string;
	pathPrefix: string;
	includeCredentials?: boolean;
};

export const createAutumnClient = (
	config: AutumnClientConfig,
): IAutumnClient => {
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
		openCustomerPortal: (params) =>
			http.request<OpenCustomerPortalResponse>({
				route: "openCustomerPortal",
				body: params,
			}),
		createReferralCode: (params) =>
			http.request<CreateReferralCodeResponse>({
				route: "createReferralCode",
				body: params,
			}),
		redeemReferralCode: (params) =>
			http.request<RedeemReferralCodeResponse>({
				route: "redeemReferralCode",
				body: params,
			}),
		listPlans: () => http.request<ListPlansResponse>({ route: "listPlans" }),
		listEvents: (params) =>
			http.request<ListEventsResponse>({
				route: "listEvents",
				body: params,
			}),
		aggregateEvents: (params) =>
			http.request<AggregateEventsResponse>({
				route: "aggregateEvents",
				body: params,
			}),
	};
};
