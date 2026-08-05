import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { downloadCustomerExport } from "../exports/actions/downloadCustomerExport.js";

export const handleDownloadCustomerExport = createRoute({
	scopes: [Scopes.Customers.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const exportId = c.req.param("export_id") ?? "";
		return c.json(await downloadCustomerExport({ ctx, exportId }));
	},
});
