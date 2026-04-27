import {
	AffectedResource,
	GetEntityParamsV0Schema,
	InternalError,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { findCustomerForEntity } from "../../actions/findCustomer.js";
import { getApiEntityByRollout } from "../../actions/getApiEntityByRollout.js";

export const handleGetEntityV2 = createRoute({
	scopes: [Scopes.Customers.Read],
	body: GetEntityParamsV0Schema,
	resource: AffectedResource.Entity,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		let { customer_id: customerId, entity_id: entityId } = body;

		// 1. Entity -> Customer ID
		if (!customerId) {
			const customer = await findCustomerForEntity({
				ctx,
				entityId: entityId,
			});

			if (!customer?.id) {
				throw new InternalError({
					message: `Customer not found for entity ${entityId}`,
				});
			}

			customerId = customer.id;
		}

		const apiEntity = await getApiEntityByRollout({
			ctx,
			customerId: customerId,
			entityId: entityId,
			source: "handleGetEntityV2",
		});

		return c.json(apiEntity);
	},
});
