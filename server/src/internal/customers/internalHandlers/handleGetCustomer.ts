import { CusProductStatus, CustomerExpand } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CusService } from "@/internal/customers/CusService";

/**
 * Internal route for get full customer object
 */
export const handleGetCustomer = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.param();

		const fullCus = await CusService.getFull({
			ctx,
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
