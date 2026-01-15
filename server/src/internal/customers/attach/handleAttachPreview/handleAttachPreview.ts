import { AffectedResource, AttachBodyV0Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { attachParamsToPreview } from "../../../billing/attachPreview/attachParamsToPreview.js";
import { getAttachParams } from "../attachUtils/attachParams/getAttachParams.js";

export const handleAttachPreview = createRoute({
	body: AttachBodyV0Schema,
	resource: AffectedResource.Attach,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const attachBody = c.req.valid("json");

		const { attachParams } = await getAttachParams({
			ctx,
			attachBody,
		});

		const attachPreview = await attachParamsToPreview({
			ctx,
			attachParams,
			attachBody,
		});

		return c.json(attachPreview);
	},
});
