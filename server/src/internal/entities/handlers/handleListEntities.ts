import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { Scopes } from "@autumn/shared";
import { CusService } from "../../customers/CusService.js";

export const handleListEntities = createRoute({
	scopes: [Scopes.Customers.Read],
	handler: async (c) => {
		const { customer_id } = c.req.param();
		const ctx = c.get("ctx");

		const fullCus = await CusService.getFull({
			ctx,
			idOrInternalId: customer_id,
			withEntities: true,
		});

		return c.json({
			list: fullCus.entities.map(
				({ spend_limits, usage_alerts, ...entity }) => ({
					...entity,
					billing_controls: {
						spend_limits: spend_limits ?? undefined,
						usage_alerts: usage_alerts ?? undefined,
					},
				}),
			),
		});
	},
});
