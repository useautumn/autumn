import type { RouteName } from "../backend/core/types";
import type { AutumnOptions } from "./types";
import { createAutumnEndpoint, createHandleBetterAuthRoute } from "./utils";

/** Type for a single autumn endpoint */
type AutumnEndpoint<T extends RouteName> = ReturnType<
	typeof createAutumnEndpoint<T>
>;

/** Autumn endpoints type - maps each route to its endpoint type */
export type AutumnEndpoints = {
	[K in RouteName]: AutumnEndpoint<K>;
};

/** Autumn plugin return type */
export type AutumnPlugin = {
	id: "autumn";
	endpoints: AutumnEndpoints;
};

export function autumn(options?: AutumnOptions): AutumnPlugin;
export function autumn(options: AutumnOptions = {}): AutumnPlugin {
	const { secretKey, baseURL, customerScope = "user", identify } = options;

	const handleRoute = createHandleBetterAuthRoute({
		secretKey,
		baseURL,
		customerScope,
		identify,
	});

	const endpoints: AutumnEndpoints = {
		getOrCreateCustomer: createAutumnEndpoint(
			"getOrCreateCustomer",
			handleRoute,
		),
		attach: createAutumnEndpoint("attach", handleRoute),
		previewAttach: createAutumnEndpoint("previewAttach", handleRoute),
		updateSubscription: createAutumnEndpoint("updateSubscription", handleRoute),
		previewUpdateSubscription: createAutumnEndpoint(
			"previewUpdateSubscription",
			handleRoute,
		),
		openCustomerPortal: createAutumnEndpoint("openCustomerPortal", handleRoute),
		createReferralCode: createAutumnEndpoint("createReferralCode", handleRoute),
		redeemReferralCode: createAutumnEndpoint("redeemReferralCode", handleRoute),
		listPlans: createAutumnEndpoint("listPlans", handleRoute),
		listEvents: createAutumnEndpoint("listEvents", handleRoute),
		aggregateEvents: createAutumnEndpoint("aggregateEvents", handleRoute),
	};

	return {
		id: "autumn" as const,
		endpoints,
	} as const;
}

export type { AutumnOptions } from "./types";
