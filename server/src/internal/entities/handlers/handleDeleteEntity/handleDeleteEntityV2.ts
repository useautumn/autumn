import {
	DeleteEntityParamsV0Schema,
	ErrCode,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";
import { findCustomerForEntity } from "../../actions/findCustomer.js";
import { entityActions } from "../../actions/index.js";

export const handleDeleteEntityV2 = createRoute({
	scopes: [Scopes.Customers.Write],
	body: DeleteEntityParamsV0Schema,
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

		await entityActions.delete({
			ctx,
			params: {
				customer_id: customerId,
				entity_id: body.entity_id,
			},
		});

		return c.json({ success: true });
	},
});
