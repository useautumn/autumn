import { AttachBodyV0Schema } from "@autumn/shared";
import type {
	ExtendedRequest,
	ExtendedResponse,
} from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { attachParamsToPreview } from "../../../billing/attachPreview/attachParamsToPreview.js";
import { getAttachParams } from "../attachUtils/attachParams/getAttachParams.js";

export const handleAttachPreview = (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "attach-preview",
		handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
			const attachBody = AttachBodyV0Schema.parse(req.body);

			// console.log("attachBody", attachBody);
			const ctx = req as AutumnContext;
			const { attachParams } = await getAttachParams({
				ctx,
				attachBody,
			});

			const attachPreview = await attachParamsToPreview({
				ctx,
				attachParams,
				attachBody,
			});

			res.status(200).json(attachPreview);

			return;
		},
	});
