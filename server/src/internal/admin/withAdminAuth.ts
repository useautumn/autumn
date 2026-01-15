import { ErrCode } from "@autumn/shared";
import type { NextFunction } from "express";
import { auth } from "@/utils/auth.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";

export const withAdminAuth = async (req: any, res: any, next: NextFunction) => {
	const { logger } = req as ExtendedRequest;

	try {
		const data = await auth.api.getSession({
			headers: req.headers,
		});

		// Check if user has admin role
		const isAdmin = data?.user?.role === "admin";

		if (!isAdmin) {
			return res.status(403).json({
				error: {
					code: ErrCode.InvalidRequest,
					message: "Forbidden - Admin access required",
				},
			});
		}

		next();
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		logger.error(`Admin req failed: ${errorMessage}`);
		return res.status(400).json();
	}
};
