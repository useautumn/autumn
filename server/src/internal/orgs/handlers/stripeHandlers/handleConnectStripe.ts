import { AppEnv, type StripeConfig } from "@autumn/shared";
import { z } from "zod/v4";
import { ensureStripeProductsWithEnv } from "@/external/stripe/stripeEnsureUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { OrgService } from "../../OrgService.js";
import { handleStripeSecretKey } from "../../orgUtils/handleStripeSecretKey.js";

// Connecting stripe
const validateConnectStripeRequest = () => {};

const addSuccessUrlToUpdates = ({
	success_url,
	env,
	configUpdates,
}: {
	success_url?: string;
	env: AppEnv;
	configUpdates: StripeConfig;
}) => {
	if (success_url === undefined) return;

	if (env === AppEnv.Sandbox) {
		configUpdates.sandbox_success_url = success_url;
	} else {
		configUpdates.success_url = success_url;
	}
};

export const handleConnectStripe = createRoute({
	body: z.object({
		secret_key: z.string().optional(),
		success_url: z.string().optional(),
		default_currency: z.string().optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, logger, env } = ctx;

		const body = c.req.valid("json");
		const configUpdates: StripeConfig = org.stripe_config || {};

		if (body.secret_key) {
			const result = await handleStripeSecretKey({
				orgId: org.id,
				secretKey: body.secret_key,
				env,
			});

			if (env === AppEnv.Sandbox) {
				configUpdates.test_api_key = result.test_api_key;
				configUpdates.test_webhook_secret = result.test_webhook_secret;
			} else {
				configUpdates.live_api_key = result.live_api_key;
				configUpdates.live_webhook_secret = result.live_webhook_secret;
			}
		}

		addSuccessUrlToUpdates({
			success_url: body.success_url,
			env,
			configUpdates,
		});

		const newOrg = await OrgService.update({
			db,
			orgId: org.id,
			updates: {
				default_currency: body.default_currency,
				stripe_config: configUpdates,
			},
		});

		if (newOrg) {
			await ensureStripeProductsWithEnv({
				db,
				logger,
				req: ctx as ExtendedRequest,
				org: newOrg,
				env,
			});
		}

		return c.json({
			message: "Connect Stripe",
		});
	},
});
