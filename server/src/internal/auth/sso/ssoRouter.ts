import { Scopes } from "@autumn/shared";
import { Hono } from "hono";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createRouterRateLimiter } from "@/honoMiddlewares/routerRateLimiter/index.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	completeSsoSignIn,
	createOrganizationSso,
	deleteOrganizationSso,
	getOrganizationSso,
	getOrganizationSsoTestUrl,
	verifyOrganizationSsoDomain,
} from "./ssoFacade.js";

const createSsoBody = z.object({
	domain: z.string().min(1),
	issuer: z.string().min(1),
	clientId: z.string().min(1),
	clientSecret: z.string().min(1),
});

const completeSsoBody = z.object({
	providerId: z.string().min(1),
});

const getSso = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { db, org, userId } = c.get("ctx");
		return c.json(
			await getOrganizationSso({
				db,
				organizationId: org.id,
				userId: userId!,
				headers: c.req.raw.headers,
			}),
		);
	},
});

const createSso = createRoute({
	body: createSsoBody,
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const { db, org, userId } = c.get("ctx");
		return c.json(
			await createOrganizationSso({
				db,
				organizationId: org.id,
				userId: userId!,
				headers: c.req.raw.headers,
				input: c.req.valid("json"),
			}),
		);
	},
});

const verifySso = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const { db, org, userId } = c.get("ctx");
		return c.json(
			await verifyOrganizationSsoDomain({
				db,
				organizationId: org.id,
				userId: userId!,
				headers: c.req.raw.headers,
			}),
		);
	},
});

const testSso = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const { db, org, userId } = c.get("ctx");
		return c.json(
			await getOrganizationSsoTestUrl({
				db,
				organizationId: org.id,
				userId: userId!,
			}),
		);
	},
});

const completeSso = createRoute({
	body: completeSsoBody,
	scopes: [Scopes.Public],
	handler: async (c) => {
		const { db, org, userId } = c.get("ctx");
		return c.json(
			await completeSsoSignIn({
				db,
				organizationId: org.id,
				userId: userId!,
				providerId: c.req.valid("json").providerId,
			}),
		);
	},
});

const deleteSso = createRoute({
	scopes: [Scopes.Organisation.Write],
	handler: async (c) => {
		const { db, org, userId } = c.get("ctx");
		return c.json(
			await deleteOrganizationSso({
				db,
				organizationId: org.id,
				userId: userId!,
				headers: c.req.raw.headers,
			}),
		);
	},
});

const verifyCooldown = createRouterRateLimiter({
	keyPrefix: "sso-verify-cooldown",
	limit: 1,
	windowMs: 30_000,
});
const verifyHourly = createRouterRateLimiter({
	keyPrefix: "sso-verify-hourly",
	limit: 10,
	windowMs: 60 * 60 * 1000,
});
const verifyDaily = createRouterRateLimiter({
	keyPrefix: "sso-verify-daily",
	limit: 25,
	windowMs: 24 * 60 * 60 * 1000,
});

export const organizationSsoRouter = new Hono<HonoEnv>();
organizationSsoRouter.get("", ...getSso);
organizationSsoRouter.post("", ...createSso);
organizationSsoRouter.post(
	"/verify-domain",
	verifyCooldown,
	verifyHourly,
	verifyDaily,
	...verifySso,
);
organizationSsoRouter.post("/test", ...testSso);
organizationSsoRouter.post("/complete", ...completeSso);
organizationSsoRouter.delete("", ...deleteSso);
