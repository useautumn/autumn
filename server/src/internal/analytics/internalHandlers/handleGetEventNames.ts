import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { eventActions } from "../actions/index.js";

/**
 * Get top event names for the organization
 */
export const handleGetEventNames = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { analyticsDb } = ctx;

		if (!analyticsDb) {
			throw new RecaseError({
				message: "Analytics database is not configured",
				code: ErrCode.InternalError,
				statusCode: StatusCodes.SERVICE_UNAVAILABLE,
			});
		}

		// Caching is handled inside the action
		const result = await eventActions.getTopEventNames({
			ctx,
			limit: 3,
		});

		return c.json(result);
	},
});
