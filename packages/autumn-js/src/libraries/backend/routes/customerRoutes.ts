import type {
	Autumn,
	CustomerExpand,
	GetOrCreateCustomerParams,
} from "@useautumn/sdk";
import { addRoute, type RouterContext } from "rou3";
import type { CustomerData } from "../../types/customerData";
import { BASE_PATH } from "../constants";
import type { CustomerId } from "../utils/AuthFunction";
import { withAuth } from "../utils/withAuth";

export const handleGetOrCreateCustomer = withAuth({
	fn: async ({
		autumn,
		customerId,
		customerData = {},
		body,
	}: {
		autumn: Autumn;
		customerId: CustomerId;
		customerData?: CustomerData;
		body: {
			expand?: CustomerExpand[];
			errorOnNotFound?: boolean;
		};
	}) => {
		const request: GetOrCreateCustomerParams = {
			customerId,
			...customerData,
			...body,
		};

		return await autumn.customers.getOrCreate(request);
	},
});

export const addCustomerRoutes = (router: RouterContext) => {
	addRoute(router, "POST", `${BASE_PATH}/customers`, {
		handler: handleGetOrCreateCustomer,
	});
};
