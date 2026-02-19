import {
	AffectedResource,
	GetEntityParamsV0Schema,
	InternalError,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { findCustomerForEntity } from "../../actions/findCustomer.js";
import { getApiEntity } from "../../entityUtils/apiEntityUtils/getApiEntity.js";

export const handleGetEntityV2 = createRoute({
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

		const apiEntity = await getApiEntity({
			ctx,
			customerId: customerId,
			entityId: entityId,
		});

		return c.json(apiEntity);
	},
});
