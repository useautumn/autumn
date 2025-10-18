import { Autumn } from "autumn-js";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { listPlatformUsers } from "../platformLegacy/handlers/handleListPlatformUsers.js";
import { handleCreatePlatformOrg } from "./handlers/handleCreatePlatformOrg.js";
import { handleGetPlatformOAuth } from "./handlers/handleGetPlatformOAuth.js";
import { handleUpdateOrganizationStripe } from "./handlers/handleUpdateOrganizationStripe.js";

const platformBetaRouter = new Hono<HonoEnv>();

/**
 * Platform authentication middleware
 * Checks if the requesting organization has access to platform API
 */
platformBetaRouter.use("*", async (c, next) => {
	const ctx = c.get("ctx");
	const { org, logger } = ctx;

	if (!process.env.AUTUMN_SECRET_KEY) {
		return next();
	}

	try {
		const autumn = new Autumn();
		const { data, error } = await autumn.check({
			customer_id: org.id,
			feature_id: "platform",
		});

		if (error) {
			throw error;
		}

		if (!data?.allowed) {
			return c.json(
				{
					message:
						"You're not allowed to access the platform API. Please contact hey@useautumn.com to request access!",
					code: "not_allowed",
				},
				403,
			);
		}

		await next();
	} catch (error) {
		logger.error(`Failed to check if org is allowed to access platform`, {
			error,
		});
		return c.json(
			{
				message: "Failed to check if org is allowed to access platform",
				code: "internal_error",
			},
			500,
		);
	}
});

/**
 * POST /organization
 * Creates a new organization for platform users
 */
platformBetaRouter.post("/organization", ...handleCreatePlatformOrg);

/**
 * POST /oauth_url
 * Generates Stripe OAuth URL for platform organizations
 */
platformBetaRouter.post("/oauth_url", ...handleGetPlatformOAuth);

/**
 * POST /organization/stripe
 * Updates Stripe Connect configuration for platform organization
 */
platformBetaRouter.post(
	"/organization/stripe",
	...handleUpdateOrganizationStripe,
);

platformBetaRouter.get("/users", ...listPlatformUsers);

export { platformBetaRouter };
