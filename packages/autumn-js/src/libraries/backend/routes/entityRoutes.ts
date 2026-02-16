import type { Autumn } from "@sdk";
import type * as operations from "@useautumn/sdk/models/operations";
import type { RouterContext } from "rou3";
import { addRoute } from "rou3";
import { backendError } from "../utils/backendRes";
import type { CustomerData } from "../utils/AuthFunction";
import { withAuth } from "../utils/withAuth";

const createEntityHandler = withAuth({
	fn: async ({
		autumn,
		customerId,
		customerData,
		body,
	}: {
		autumn: Autumn;
		customerId: string;
		customerData?: CustomerData;
		body: Omit<
			operations.PostCustomersCustomerIdEntitiesRequestBody,
			"customerData"
		>;
	}) => {
		return await autumn.entities.postCustomersCustomerIdEntities({
			customerId: customerId,
			body: {
				...body,
				customerData: customerData,
			},
		});
	},
});

const getEntityHandler = withAuth({
	fn: async ({
		autumn,
		customerId,
		pathParams,
		searchParams,
	}: {
		autumn: Autumn;
		customerId: string;
		pathParams?: Record<string, string>;
		searchParams?: Record<string, string>;
	}) => {
		if (!pathParams?.entityId) {
			return backendError({
				statusCode: 400,
				message: "Entity ID is required",
				code: "no_entity_id",
			});
		}

		return await autumn.entities.getCustomersCustomerIdEntitiesEntityId({
			customerId: customerId,
			entityId: pathParams.entityId,
			expand: searchParams?.expand
				? (searchParams.expand.split(
						",",
					) as Array<operations.GetCustomersCustomerIdEntitiesEntityIdExpand>)
				: undefined,
		});
	},
});

const deleteEntityHandler = withAuth({
	fn: async ({
		autumn,
		customerId,
		pathParams,
	}: {
		autumn: Autumn;
		customerId: string;
		pathParams?: Record<string, string>;
	}) => {
		if (!pathParams?.entityId) {
			return backendError({
				statusCode: 400,
				message: "Entity ID is required",
				code: "no_entity_id",
			});
		}

		return await autumn.entities.deleteCustomersCustomerIdEntitiesEntityId({
			customerId: customerId,
			entityId: pathParams.entityId,
		});
	},
});

export const addEntityRoutes = async (router: RouterContext) => {
	addRoute(router, "POST", "/api/autumn/entities", {
		handler: createEntityHandler,
	});
	addRoute(router, "GET", "/api/autumn/entities/:entityId", {
		handler: getEntityHandler,
	});
	addRoute(router, "DELETE", "/api/autumn/entities/:entityId", {
		handler: deleteEntityHandler,
	});
};
