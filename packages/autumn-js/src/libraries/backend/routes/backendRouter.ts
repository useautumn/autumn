import { addRoute, createRouter } from "rou3";
import { BASE_PATH } from "../constants";
import { type BackendResult, backendSuccess } from "../utils/backendRes";
import type { BackendRouteHandlerArgs } from "./backendRouteTypes";
import { addBillingRoutes } from "./billingRoutes";
import { addCustomerRoutes } from "./customerRoutes";
import { addEntityRoutes } from "./entityRoutes";
import { addGenRoutes } from "./genRoutes";
import { addProductRoutes } from "./productRoutes";
import { addReferralRoutes } from "./referralRoutes";

type RouteData = {
	handler: (args: BackendRouteHandlerArgs) => Promise<BackendResult>;
	requireCustomer?: boolean;
};

export const createRouterWithOptions = () => {
	const router = createRouter<RouteData>();

	addRoute(router, "POST", `${BASE_PATH}/cors`, {
		handler: async () =>
			backendSuccess({
				body: {
					message: "OK",
				},
				statusCode: 200,
			}),
	});

	addCustomerRoutes(router);
	addBillingRoutes(router);

	addGenRoutes(router);
	addEntityRoutes(router);
	addReferralRoutes(router);
	addProductRoutes(router);

	return router;
};
