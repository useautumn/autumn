import { Scopes } from "@autumn/shared";
import { AppEnv } from "@shared/index";
import { sendCustomSvixEvent } from "@/external/svix/svixHelpers";
import {
	type VercelResourceSecretRotatedEvent,
	VercelWebhooks,
} from "@/external/vercel/misc/vercelWebhookTypes";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

export const handleRotateResourceSecret = createRoute({
	scopes: [Scopes.Public],
	handler: async (c) => {
		const { env, integrationConfigurationId, resourceId } = c.req.param();
		const { org, db } = c.get("ctx");
		const body = await c.req.json();
		const claims = c.get("vercelClaims");

		if (!claims || claims?.user_role !== "admin") {
			return c.json(
				{
					error: "Unauthorized",
					message: "Unauthorized",
				},
				401,
			);
		}

		const resource = await VercelResourceService.getByIdAndInstallation({
			db,
			resourceId,
			installationId: integrationConfigurationId,
			orgId: org.id,
			env: env as AppEnv,
		});

		if (!resource) {
			return c.json(
				{
					code: "validation_error",
					message: "Resource not found",
				},
				400,
			);
		}

		await sendCustomSvixEvent({
			appId:
				org.processor_configs?.vercel?.svix?.[
					env === AppEnv.Live ? "live_id" : "sandbox_id"
				] ?? "",
			org,
			env: env as AppEnv,
			eventType: VercelWebhooks.RotateSecrets,
			data: {
				resource: {
					id: resourceId,
				},
				installation_id: integrationConfigurationId,
				vercel_request_body: body,
			} satisfies VercelResourceSecretRotatedEvent,
		});

		return c.json({
			sync: false,
		});
	},
});
