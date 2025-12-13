import {
	AffectedResource,
	ApiVersion,
	AttachBodyV0Schema,
	AttachBodyV1Schema,
} from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { createAttachContext } from "../common/createAttachContext/createAttachContext";

export const handleAttachV2 = createRoute({
	versionedBody: {
		latest: AttachBodyV1Schema,
		[ApiVersion.V2_0]: AttachBodyV0Schema,
	},
	resource: AffectedResource.Attach,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		// Step 1: Create attach context
		const attachContext = await createAttachContext({
			ctx,
			body,
		});

		return c.json({ success: true }, 400);
	},
});
