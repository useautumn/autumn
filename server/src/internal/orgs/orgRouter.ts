import express, { type Router } from "express";
import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleDeleteOrg } from "./handlers/handleDeleteOrg.js";
import { handleGetInvites } from "./handlers/handleGetInvites.js";
import { handleGetOrg } from "./handlers/handleGetOrg.js";
import {
	handleGetOrgMembers,
	handleRemoveMember,
} from "./handlers/handleGetOrgMembers.js";
import { handleGetUploadUrl } from "./handlers/handleGetUploadUrl.js";
import { handleResetDefaultAccount } from "./handlers/handleResetDefaultAccount.js";
import { handleUpdateOrg } from "./handlers/handleUpdateOrg.js";
import {
	handleGetVercelSink,
	handleUpsertVercelConfig,
} from "./handlers/handleVercelConfig.js";
import { handleConnectStripe } from "./handlers/stripeHandlers/handleConnectStripe.js";
import { handleDeleteStripe } from "./handlers/stripeHandlers/handleDeleteStripe.js";
import { handleGetOAuthUrl } from "./handlers/stripeHandlers/handleGetOAuthUrl.js";
import { handleGetStripeAccount } from "./handlers/stripeHandlers/handleGetStripeAccount.js";

export const orgRouter: Router = express.Router();
orgRouter.get("/members", handleGetOrgMembers);
orgRouter.post("/remove-member", handleRemoveMember);
orgRouter.get("/upload_url", handleGetUploadUrl);
orgRouter.get("/invites", handleGetInvites as any);
orgRouter.delete("", handleDeleteOrg as any);

orgRouter.delete("/delete-user", async (req: any, res) => {
	res.status(200).json({
		message: "User deleted",
	});
});

orgRouter.get("", handleGetOrg);

// orgRouter.post("/stripe", handleConnectStripe);

export const honoOrgRouter = new Hono<HonoEnv>();

honoOrgRouter.patch("", ...handleUpdateOrg);
honoOrgRouter.get("/stripe", ...handleGetStripeAccount);
honoOrgRouter.delete("/stripe", ...handleDeleteStripe);
honoOrgRouter.post("/stripe", ...handleConnectStripe);
honoOrgRouter.get("/stripe/oauth_url", ...handleGetOAuthUrl);
honoOrgRouter.post("/reset_default_account", ...handleResetDefaultAccount);
honoOrgRouter.patch("/vercel", ...handleUpsertVercelConfig);
honoOrgRouter.get("/vercel_sink", ...handleGetVercelSink);
