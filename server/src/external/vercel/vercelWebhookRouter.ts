import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateInstallation } from "./handlers/handleCreateInstallation.js";
import { handleListBillingPlans } from "./handlers/handleListBillingPlans.js";
import { vercelSeederMiddleware } from "./vercelMiddleware.js";

export const vercelWebhookRouter = new Hono<HonoEnv>();

vercelWebhookRouter.get(
	"/:orgId/:env/v1/products/:integrationConfigurationId/plans",
	vercelSeederMiddleware,
	...handleListBillingPlans,
);

vercelWebhookRouter.put(
	"/:orgId/:env/v1/installations/:integrationConfigurationId",
	vercelSeederMiddleware,
	...handleCreateInstallation,
);

vercelWebhookRouter.all("*", vercelSeederMiddleware, async (c) => {
	const method = c.req.method;
	const params = c.req.param();
	const rawBody = await c.req.raw.text();
	const headers = c.req.header();
	console.log("Vercel webhook headers", JSON.stringify(headers, null, 4));

	let parsedBody: string;
	try {
		parsedBody = JSON.stringify(JSON.parse(rawBody), null, 4);
	} catch {
		parsedBody = rawBody;
	}

	console.log("Vercel webhook received", method, params, parsedBody);
	return c.body(null, 200);
});
