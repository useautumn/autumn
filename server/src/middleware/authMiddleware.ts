import { AuthType, ErrCode } from "@autumn/shared";
import { verifyToken } from "@clerk/express";
import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction } from "express";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { auth } from "@/utils/auth.js";

const getTokenData = async (req: any, res: any) => {
	let token;

	try {
		token = req.headers["authorization"]?.split(" ")[1];
		if (!token) {
			throw new Error("authorization header has no token");
		}
	} catch (error) {
		throw new Error("clerk token not found in request headers / invalid");
	}

	const secretKey = process.env.CLERK_SECRET_KEY;

	try {
		const verified = await verifyToken(token, {
			secretKey: secretKey,
		});

		if (!verified) {
			throw new Error("failed to verify clerk token");
		}

		return verified;
	} catch (error: any) {
		throw new Error("error verifying clerk token");
	}
};

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

export const withAuth = async (req: any, res: any, next: NextFunction) => {
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
