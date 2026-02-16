import type { Autumn } from "@sdk";
import type { CustomerData } from "@useautumn/sdk";
import type * as operations from "@useautumn/sdk/models/operations";
import { addRoute, type RouterContext } from "rou3";
import { BASE_PATH } from "../constants";
import { withAuth } from "../utils/withAuth";

const checkoutHandler = withAuth({
	fn: async ({
		autumn,
		customerId,
		customerData,
		body,
	}: {
		autumn: Autumn;
		customerId: string;
		customerData?: CustomerData;
		body: Omit<operations.PostCheckoutRequestBody, "customerId">;
	}) => {
		return await autumn.core.postCheckout({
			body: {
				...body,
				customerId: customerId,
				customerData: customerData,
			},
		});
	},
});

const setupPaymentHandler = withAuth({
	fn: async ({
		autumn,
		customerId,
		customerData,
		body,
	}: {
		autumn: Autumn;
		customerId: string;
		customerData?: CustomerData;
		body: Omit<operations.PostSetupPaymentRequestBody, "customerId">;
	}) => {
		return await autumn.core.postSetupPayment({
			body: {
				...body,
				customerId: customerId,
				customerData: customerData,
			},
		});
	},
});

const cancelHandler = withAuth({
	fn: async ({
		autumn,
		customerId,
		body,
	}: {
		autumn: Autumn;
		customerId: string;
		body: Omit<operations.PostCancelRequestBody, "customerId">;
	}) => {
		return await autumn.core.postCancel({
			body: {
				...body,
				customerId: customerId,
			},
		});
	},
});

const checkHandler = withAuth({
	fn: async ({
		autumn,
		customerId,
		customerData,
		body,
	}: {
		autumn: Autumn;
		customerId: string;
		customerData?: CustomerData;
		body: Omit<operations.PostCheckRequestBody, "customerId">;
	}) => {
		return await autumn.core.postCheck({
			body: {
				...body,
				customerId: customerId,
				customerData: customerData,
			},
		});
	},
});

const trackHandler = withAuth({
	fn: async ({
		autumn,
		customerId,
		customerData,
		body,
	}: {
		autumn: Autumn;
		customerId: string;
		customerData?: CustomerData;
		body: Omit<operations.PostTrackRequestBody, "customerId">;
	}) => {
		return await autumn.core.postTrack({
			body: {
				...body,
				customerId: customerId,
				customerData: customerData,
			},
		});
	},
});

const openBillingPortalHandler = withAuth({
	fn: async ({
		autumn,
		customerId,
		body,
	}: {
		autumn: Autumn;
		customerId: string;
		body: operations.PostCustomersCustomerIdBillingPortalRequestBody;
	}) => {
		return await autumn.core.postCustomersCustomerIdBillingPortal({
			customerId: customerId,
			body: {
				returnUrl: body.returnUrl,
			},
		});
	},
});

const queryHandler = withAuth({
	fn: async ({
		autumn,
		customerId,
		body,
	}: {
		autumn: Autumn;
		customerId: string;
		body: Omit<operations.PostQueryRequestBody, "customerId">;
	}) => {
		return await autumn.core.postQuery({
			body: {
				...body,
				customerId: customerId,
			},
		});
	},
});

const addGenRoutes = (router: RouterContext) => {
	addRoute(router, "POST", `${BASE_PATH}/checkout`, {
		handler: checkoutHandler,
	});
	addRoute(router, "POST", `${BASE_PATH}/cancel`, {
		handler: cancelHandler,
	});
	addRoute(router, "POST", `${BASE_PATH}/check`, {
		handler: checkHandler,
	});
	addRoute(router, "POST", `${BASE_PATH}/track`, {
		handler: trackHandler,
	});
	addRoute(router, "POST", `${BASE_PATH}/billing_portal`, {
		handler: openBillingPortalHandler,
	});
	addRoute(router, "POST", `${BASE_PATH}/setup_payment`, {
		handler: setupPaymentHandler,
	});
	addRoute(router, "POST", `${BASE_PATH}/query`, {
		handler: queryHandler,
	});
};

export { addGenRoutes };
