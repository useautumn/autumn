import type { Autumn } from "@sdk";
import { addRoute, type RouterContext } from "rou3";
import { BASE_PATH } from "../constants";
import { withAuth } from "../utils/withAuth";

const listProductsHandler = withAuth({
	fn: async ({ autumn }: { autumn: Autumn }) => {
		return await autumn.plans.getPlans();
	},
	requireCustomer: false,
});

export const addProductRoutes = async (router: RouterContext) => {
	addRoute(router, "GET", `${BASE_PATH}/products`, {
		handler: listProductsHandler,
	});
};
