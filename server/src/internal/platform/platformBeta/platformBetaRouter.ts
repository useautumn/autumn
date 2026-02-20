import { Autumn } from "autumn-js";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreatePlatformOrg } from "./handlers/handleCreatePlatformOrg.js";
import { handleDeletePlatformOrg } from "./handlers/handleDeletePlatformOrg.js";
import { handleGetPlatformOAuth } from "./handlers/handleGetPlatformOAuth.js";
import { handleLegacyPlatformExchange } from "./handlers/handleLegacyPlatformExchange.js";
import { handleListPlatformOrgs } from "./handlers/handleListPlatformOrgs.js";
import { listPlatformUsers } from "./handlers/handleListPlatformUsers.js";
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
		const { allowed } = await autumn.check({
			customerId: org.id,
			featureId: "platform",
		});

		if (!allowed) {
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
platformBetaRouter.post("/organizations", ...handleCreatePlatformOrg);

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
platformBetaRouter.post(
	"/organizations/stripe",
	...handleUpdateOrganizationStripe,
);

platformBetaRouter.get("/users", ...listPlatformUsers);

platformBetaRouter.get("/organizations", ...handleListPlatformOrgs);

/**
 * DELETE /organizations
 * Deletes a platform organization by slug
 */
platformBetaRouter.delete("/organizations", ...handleDeletePlatformOrg);

/**
 * POST /exchange
 * Legacy platform exchange endpoint - creates org, user, and connects Stripe
 */
platformBetaRouter.post("/exchange", ...handleLegacyPlatformExchange);

export { platformBetaRouter };
