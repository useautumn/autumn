import { AttachBodySchema } from "@autumn/shared";
import type {
	ExtendedRequest,
	ExtendedResponse,
} from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { getAttachParams } from "../attachUtils/attachParams/getAttachParams.js";

import { attachParamsToPreview } from "./attachParamsToPreview.js";

export const handleAttachPreview = (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "attach-preview",
		handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
			const { logger } = req;
			const attachBody = AttachBodySchema.parse(req.body);

			// console.log("attachBody", attachBody);
			const { attachParams } = await getAttachParams({
				req,
				attachBody,
			});

			const attachPreview = await attachParamsToPreview({
				req,
				attachParams,
				attachBody,
				logger,
			});

			res.status(200).json(attachPreview);

			return;
		},
	});
