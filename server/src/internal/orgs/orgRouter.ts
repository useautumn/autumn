import { user as userTable } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { handleGetRCMappings } from "@/external/revenueCat/handlers/handleGetRevenuecatMappings.js";
import { handleGetRevenueCatProducts } from "@/external/revenueCat/handlers/handleGetRevenuecatProducts.js";
import {
	handleCreateRevenueCatProject,
	handleGetRevenueCatProjects,
} from "@/external/revenueCat/handlers/handleGetRevenuecatProjects.js";
import { handlePreflightRevenueCatSync } from "@/external/revenueCat/handlers/handlePreflightRevenueCatSync.js";
import { handleSaveRCMappings } from "@/external/revenueCat/handlers/handleSaveRevenuecatMappings.js";
import { handleSyncRevenueCatProducts } from "@/external/revenueCat/handlers/handleSyncRevenueCatProducts.js";
import { handleDisconnectRevenueCat } from "@/internal/orgs/handlers/revenueCatHandlers/handleDisconnectRevenueCat.js";
import {
	handleGetRevenueCatWebhook,
	handleRegisterRevenueCatWebhook,
} from "@/internal/orgs/handlers/revenueCatHandlers/handleRevenueCatWebhook.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleDeleteOrg } from "./handlers/crudHandlers/handleDeleteOrg.js";
import { handleGetOrg } from "./handlers/crudHandlers/handleGetOrg.js";
import { handleGetOrgFlags } from "./handlers/handleGetOrgFlags.js";
import { handleGetUploadUrl } from "./handlers/handleGetUploadUrl.js";
import {
	handleDeleteRedisConfig,
	handleUpdateRedisMigration,
	handleUpsertRedisConfig,
} from "./handlers/handleRedisConfig.js";
import { handleResetDefaultAccount } from "./handlers/handleResetDefaultAccount.js";
import {
	handleGetRevenueCatConfig,
	handleUpsertRevenueCatConfig,
} from "./handlers/handleRevenueCatConfig.js";
import { handleUpdateOrg } from "./handlers/handleUpdateOrg.js";
import { handleUpdateOrgConfig } from "./handlers/handleUpdateOrgConfig.js";
import {
	handleGetVercelSink,
	handleUpsertVercelConfig,
} from "./handlers/handleVercelConfig.js";
import { handleGetInvites } from "./handlers/memberHandlers/handleGetInvites.js";
import { handleGetOrgMembers } from "./handlers/memberHandlers/handleGetOrgMembers.js";
import { handleRemoveMember } from "./handlers/memberHandlers/handleRemoveMember.js";
import { handleConnectStripe } from "./handlers/stripeHandlers/handleConnectStripe.js";
import { handleDeleteStripe } from "./handlers/stripeHandlers/handleDeleteStripe.js";
import { handleGetOAuthUrl } from "./handlers/stripeHandlers/handleGetOAuthUrl.js";
import { handleGetStripeAccount } from "./handlers/stripeHandlers/handleGetStripeAccount.js";
import { handleGetRevenueCatOAuthUrl } from "./handlers/revenueCatHandlers/handleGetRevenueCatOAuthUrl.js";

export const internalOrgRouter = new Hono<HonoEnv>();

internalOrgRouter.get("", ...handleGetOrg);
internalOrgRouter.delete("", ...handleDeleteOrg);
internalOrgRouter.patch("/config", ...handleUpdateOrgConfig);
internalOrgRouter.get("/members", ...handleGetOrgMembers);
internalOrgRouter.post("/remove-member", ...handleRemoveMember);
internalOrgRouter.get("/upload_url", ...handleGetUploadUrl);
internalOrgRouter.get("/invites", ...handleGetInvites);

export const honoOrgRouter = new Hono<HonoEnv>();
honoOrgRouter.get("", ...handleGetOrg);
honoOrgRouter.get("/flags", ...handleGetOrgFlags);
honoOrgRouter.get("/me", async (c) => {
	const { db, org, env, user, userId } = c.get("ctx");
	const authUser =
		user ??
		(userId
			? await db.query.user.findFirst({
					where: eq(userTable.id, userId),
				})
			: undefined);
	return c.json({
		id: org.id,
		name: org.name,
		slug: org.slug,
		env,
		user: authUser
			? {
					id: authUser.id,
					email: authUser.email,
					name: authUser.name,
				}
			: undefined,
	});
});
honoOrgRouter.patch("", ...handleUpdateOrg);
honoOrgRouter.patch("/config", ...handleUpdateOrgConfig);
honoOrgRouter.get("/stripe", ...handleGetStripeAccount);
honoOrgRouter.delete("/stripe", ...handleDeleteStripe);
honoOrgRouter.post("/stripe", ...handleConnectStripe);
honoOrgRouter.get("/stripe/oauth_url", ...handleGetOAuthUrl);
honoOrgRouter.post("/reset_default_account", ...handleResetDefaultAccount);

honoOrgRouter.patch("/redis", ...handleUpsertRedisConfig);
honoOrgRouter.delete("/redis", ...handleDeleteRedisConfig);
honoOrgRouter.patch("/redis/migration", ...handleUpdateRedisMigration);

honoOrgRouter.patch("/vercel", ...handleUpsertVercelConfig);
honoOrgRouter.get("/vercel_sink", ...handleGetVercelSink);

honoOrgRouter.get("/revenuecat", ...handleGetRevenueCatConfig);
honoOrgRouter.patch("/revenuecat", ...handleUpsertRevenueCatConfig);
honoOrgRouter.get("/revenuecat/oauth_url", ...handleGetRevenueCatOAuthUrl);
honoOrgRouter.post("/revenuecat/products", ...handleGetRevenueCatProducts);
honoOrgRouter.get("/revenuecat/projects", ...handleGetRevenueCatProjects);
honoOrgRouter.post("/revenuecat/projects", ...handleCreateRevenueCatProject);
honoOrgRouter.post("/revenuecat/sync", ...handleSyncRevenueCatProducts);
honoOrgRouter.post("/revenuecat/preflight", ...handlePreflightRevenueCatSync);
honoOrgRouter.get("/revenuecat/mappings", ...handleGetRCMappings);
honoOrgRouter.post("/revenuecat/mappings", ...handleSaveRCMappings);
honoOrgRouter.get("/revenuecat/webhook", ...handleGetRevenueCatWebhook);
honoOrgRouter.post("/revenuecat/webhook", ...handleRegisterRevenueCatWebhook);
honoOrgRouter.post("/revenuecat/disconnect", ...handleDisconnectRevenueCat);
