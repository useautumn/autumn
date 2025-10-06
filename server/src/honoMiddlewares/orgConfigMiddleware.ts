import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

/**
 * Middleware to handle org-config header and merge with org config
 * Allows overriding org config via header for testing/debugging
 */
export const orgConfigMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");
	const orgConfigHeader = c.req.header("org-config");

	if (orgConfigHeader && ctx.org) {
		try {
			const newConfigFields = JSON.parse(orgConfigHeader);

			// Merge with existing org config
			ctx.org.config = {
				...ctx.org.config,
				...newConfigFields,
			};

			ctx.logger.info("Org config overridden via header", {
				newFields: Object.keys(newConfigFields),
			});
		} catch (error) {
			ctx.logger.warn("Failed to parse org-config header", { error });
			// Don't throw - just log and continue
		}
	}

	await next();
};
