import type { Autumn } from "@sdk";
import type * as operations from "@useautumn/sdk/models/operations";
import { addRoute, type RouterContext } from "rou3";
import { BASE_PATH } from "../constants";
import type { CustomerData } from "../utils/AuthFunction";
import { withAuth } from "../utils/withAuth";

export const handleAttach = withAuth({
	fn: async ({
		autumn,
		customerId,
		customerData,
		body,
	}: {
		autumn: Autumn;
		customerId: string;
		customerData?: CustomerData;
		body: Omit<operations.PostAttachRequestBody, "customerId">;
	}) => {
		return await autumn.core.postAttach({
			body: {
				...body,
				customerId: customerId,
				customerData: customerData,
			},
		});
	},
});

export const addBillingRoutes = (router: RouterContext) => {
	addRoute(router, "POST", `${BASE_PATH}/attach`, {
		handler: handleAttach,
	});
};
