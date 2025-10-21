import type {
	ExtendedRequest,
	ExtendedResponse,
} from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { OrgService } from "../OrgService.js";
import { createOrgResponse } from "../orgUtils.js";

export const handleGetOrg = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "get org",
		handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
			if (!req.orgId) {
				res.status(400).json({
					message: "Missing orgId",
				});
				return;
			}

			const org = await OrgService.getFromReq(req);

			res.status(200).json(createOrgResponse({ org, env: req.env }));
		},
	});
