import { ErrCode } from "@autumn/shared";
import type { NextFunction } from "express";
import { auth } from "@/utils/auth.js";
import { ADMIN_USER_IDs } from "@/utils/constants.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";

export const withAdminAuth = async (req: any, res: any, next: NextFunction) => {
	const { logger } = req as ExtendedRequest;

	try {
		const data = await auth.api.getSession({
			headers: req.headers,
		});

		if (
			!ADMIN_USER_IDs.includes(data?.session?.userId || "") &&
			!ADMIN_USER_IDs.includes(data?.session?.impersonatedBy || "")
		) {
			return res.status(403).json({
				error: {
					code: ErrCode.InvalidRequest,
					message: "Method not allowed",
				},
			});
		}

		next();
	} catch (error: any) {
		logger.error(`Admin req failed: ${error.message}`);
		return res.status(400).json();
	}
};
