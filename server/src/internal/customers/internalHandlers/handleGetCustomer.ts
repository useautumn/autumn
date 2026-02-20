import { CusProductStatus, CustomerExpand } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";

/**
 * Internal route for get full customer object
 */
export const handleGetCustomer = createRoute({
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { customer_id } = c.req.param();

		const fullCus = await CusService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: customer_id,
			withEntities: true,
			expand: [CustomerExpand.Invoices],
			inStatuses: [
				CusProductStatus.Active,
				CusProductStatus.PastDue,
				CusProductStatus.Scheduled,
				CusProductStatus.Expired,
			],
		});

		return c.json({
			customer: fullCus,
		});
	},
});
