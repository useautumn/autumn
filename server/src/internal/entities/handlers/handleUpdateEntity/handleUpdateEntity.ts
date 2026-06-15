import {
	AffectedResource,
	ErrCode,
	RecaseError,
	Scopes,
	UpdateEntityParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { findCustomerForEntity } from "../../actions/findCustomer.js";
import { getApiEntityByRollout } from "../../actions/getApiEntityByRollout.js";
import { entityActions } from "../../actions/index.js";

export const handleUpdateEntity = createRoute({
	scopes: [Scopes.Customers.Write],
	body: UpdateEntityParamsSchema,
	resource: AffectedResource.Entity,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		let customerId = body.customer_id;
		if (!customerId) {
			const customer = await findCustomerForEntity({
				ctx,
				entityId: body.entity_id,
			});

			customerId = customer?.id ?? undefined;
		}

		if (!customerId) {
			throw new RecaseError({
				message: `No customer found for entity '${body.entity_id}'. Pass customer_id to identify the customer.`,
				code: ErrCode.CustomerNotFound,
				statusCode: 404,
			});
		}

		await entityActions.update({
			ctx,
			params: {
				...body,
				customer_id: customerId,
			},
		});

		const apiEntity = await getApiEntityByRollout({
			ctx,
			customerId,
			entityId: body.entity_id,
			source: "handleUpdateEntity",
		});

		return c.json(apiEntity);
	},
});
