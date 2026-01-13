import { Hono } from "hono";
import { handleGetRCMappings } from "@/external/revenueCat/handlers/handleGetRevenuecatMappings.js";
import { handleGetRevenueCatProducts } from "@/external/revenueCat/handlers/handleGetRevenuecatProducts.js";
import { handleSaveRCMappings } from "@/external/revenueCat/handlers/handleSaveRevenuecatMappings.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleDeleteOrg } from "./handlers/crudHandlers/handleDeleteOrg.js";
import { handleGetOrg } from "./handlers/crudHandlers/handleGetOrg.js";
import { handleGetUploadUrl } from "./handlers/handleGetUploadUrl.js";
import { handleResetDefaultAccount } from "./handlers/handleResetDefaultAccount.js";
import {
	handleGetRevenueCatConfig,
	handleUpsertRevenueCatConfig,
} from "./handlers/handleRevenueCatConfig.js";
import { handleUpdateOrg } from "./handlers/handleUpdateOrg.js";
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

export const internalOrgRouter = new Hono<HonoEnv>();

internalOrgRouter.get("", ...handleGetOrg);
internalOrgRouter.delete("", ...handleDeleteOrg);
internalOrgRouter.get("/members", ...handleGetOrgMembers);
internalOrgRouter.post("/remove-member", ...handleRemoveMember);
internalOrgRouter.get("/upload_url", ...handleGetUploadUrl);
internalOrgRouter.get("/invites", ...handleGetInvites);

export const honoOrgRouter = new Hono<HonoEnv>();
honoOrgRouter.get("", ...handleGetOrg);
honoOrgRouter.get("/me", (c) => {
	const { org, env } = c.get("ctx");
	return c.json({
		name: org.name,
		slug: org.slug,
		env
	});
});
honoOrgRouter.patch("", ...handleUpdateOrg);
honoOrgRouter.get("/stripe", ...handleGetStripeAccount);
honoOrgRouter.delete("/stripe", ...handleDeleteStripe);
honoOrgRouter.post("/stripe", ...handleConnectStripe);
honoOrgRouter.get("/stripe/oauth_url", ...handleGetOAuthUrl);
honoOrgRouter.post("/reset_default_account", ...handleResetDefaultAccount);

honoOrgRouter.patch("/vercel", ...handleUpsertVercelConfig);
honoOrgRouter.get("/vercel_sink", ...handleGetVercelSink);

honoOrgRouter.get("/revenuecat", ...handleGetRevenueCatConfig);
honoOrgRouter.patch("/revenuecat", ...handleUpsertRevenueCatConfig);
honoOrgRouter.post("/revenuecat/products", ...handleGetRevenueCatProducts);
honoOrgRouter.get("/revenuecat/mappings", ...handleGetRCMappings);
honoOrgRouter.post("/revenuecat/mappings", ...handleSaveRCMappings);
