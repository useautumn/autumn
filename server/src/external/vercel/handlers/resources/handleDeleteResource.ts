import { AppEnv, Scopes } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { sendCustomSvixEvent } from "@/external/svix/svixHelpers.js";
import { VercelResourceService } from "@/external/vercel/services/VercelResourceService.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";
import {
	type VercelResourceDeletedEvent,
	VercelWebhooks,
} from "../../misc/vercelWebhookTypes.js";

/**
 * DELETE /v1/installations/{integrationConfigurationId}/resources/{resourceId}
 */
export const handleDeleteResource = createRoute({
	scopes: [Scopes.Public],
	handler: async (c) => {
		const { orgId, env, integrationConfigurationId, resourceId } =
			c.req.param();
		const ctx = c.get("ctx");
		const { db, org, logger, fullCustomer: customer } = ctx;

		try {
			await VercelResourceService.delete({
				db,
				resourceId,
				installationId: integrationConfigurationId,
				orgId,
				env: env as AppEnv,
			});
		} catch (error) {
			logCaughtError({
				logger,
				message:
					"[vercel/resources.delete] failed to mark resource uninstalled in DB",
				error,
				data: { resourceId },
				level: "warn",
			});
			throw error;
		}

		try {
			await sendCustomSvixEvent({
				appId:
					org.processor_configs?.vercel?.svix?.[
						env === AppEnv.Live ? "live_id" : "sandbox_id"
					] ?? "",
				org,
				env: env as AppEnv,
				eventType: VercelWebhooks.ResourceDeleted,
				data: {
					resource: {
						id: resourceId,
					},
					installation_id: integrationConfigurationId,
				} satisfies VercelResourceDeletedEvent,
			});
		} catch (error) {
			logCaughtError({
				logger,
				message:
					"[vercel/resources.delete] failed to send svix ResourceDeleted event",
				error,
				data: { resourceId },
				level: "warn",
			});
		}

		// Constructing the Stripe client itself throws when the org has no
		// Stripe connection — must be inside the guard, not above it.
		let stripeCli: Stripe | null = null;
		try {
			stripeCli = createStripeCli({ org, env: env as AppEnv });
		} catch (error) {
			logCaughtError({
				logger,
				message:
					"[vercel/resources.delete] cannot build Stripe client; skipping subscription cancels",
				error,
				data: { orgId, env },
				level: "warn",
			});
		}

		if (stripeCli) {
			for (const customerProduct of customer?.customer_products ?? []) {
				for (const subId of customerProduct.subscription_ids ?? []) {
					try {
						await stripeCli.subscriptions.cancel(subId);
					} catch (error: any) {
						logCaughtError({
							logger,
							message:
								"[vercel/resources.delete] subscription cancel failed; continuing",
							error,
							data: {
								subId,
								code: error?.code,
								status: error?.statusCode,
							},
							level: "warn",
						});
					}
				}
			}
		}

		return c.body(null, 204);
	},
});
