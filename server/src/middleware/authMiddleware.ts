import { AuthType, ErrCode } from "@autumn/shared";

import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction } from "express";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { auth } from "@/utils/auth.js";

export const withOrgAuth = async (req: any, res: any, next: NextFunction) => {
	const { logger } = req;

	try {
		// let tokenData = await getTokenData(req, res);
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});

		if (!session) {
			logger.info(`Unauthorized - no session found (${req.originalUrl})`);
			return res
				.status(401)
				.json({ message: "Unauthorized - no session found" });
		}

		const orgId = session?.session?.activeOrganizationId;
		const userId = session?.user?.id;

		if (!orgId) {
			logger.info(`Unauthorized - no org id found`);
			return res
				.status(401)
				.json({ message: "Unauthorized - no org id found" });
		}

		if (!userId) {
			logger.info(`Unauthorized - no user id found`);
			return res
				.status(401)
				.json({ message: "Unauthorized - no user id found" });
		}

		const data = await OrgService.getWithFeatures({
			db: req.db,
			orgId: orgId,
			env: req.env,
		});

		if (!data) {
			logger.warn(`Org ${orgId} not found in DB`);
			return res
				.status(500)
				.json({ message: "Org not found", code: ErrCode.OrgNotFound });
		}

		const { org, features } = data;

		req.user = session?.user;
		req.userId = userId;
		req.orgId = orgId;
		req.org = org;
		req.features = features;
		req.authType = AuthType.Dashboard;

		next();
	} catch (error: any) {
		// console.log(`(warning) clerk auth failed:`, error?.message || error);
		logger.warn(`(warning) withOrgAuth failed:`, error?.message || error);
		res.status(401).json({ message: "Unauthorized" });
		return;
	}
};

const withAuth = async (req: any, res: any, next: NextFunction) => {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	});

	if (!session) {
		res.status(401).json({ message: "Unauthorized" });
		return;
	}

	req.userId = session?.user.id;

	next();
};
