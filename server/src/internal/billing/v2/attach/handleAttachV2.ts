import { AffectedResource, AttachBodyV1Schema } from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handleAttachV2 = createRoute({
	body: AttachBodyV1Schema,
	resource: AffectedResource.Attach,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const attachBody = c.req.valid("json");

		// Step 1: Create attach params.

		return c.json({ success: true });
	},
});
