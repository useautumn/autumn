import { AppEnv, ErrCode } from "@autumn/shared";
import Stripe from "stripe";
import { z } from "zod";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { ensureStripeProductsWithEnv } from "@/external/stripe/stripeEnsureUtils.js";
import {
	checkKeyValid,
	createWebhookEndpoint,
} from "@/external/stripe/stripeOnboardingUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { OrgService } from "../OrgService.js";
import { isStripeConnected } from "../orgUtils.js";

export const connectStripe = async ({
	orgId,
	apiKey,
	env,
}: {
	orgId: string;
	apiKey: string;
	env: AppEnv;
}) => {
	// 1. Check if key is valid
	await checkKeyValid(apiKey);

	const stripe = new Stripe(apiKey);

	const account = await stripe.accounts.retrieve();

	// 2. Disconnect existing webhook endpoints
	const curWebhooks = await stripe.webhookEndpoints.list();
	for (const webhook of curWebhooks.data) {
		if (webhook.url.includes(orgId) && webhook.url.includes(env)) {
			await stripe.webhookEndpoints.del(webhook.id);
		}
	}

	// 3. Create new webhook endpoint
	const webhook = await createWebhookEndpoint(apiKey, env, orgId);

	// 3. Return encrypted
	if (env === AppEnv.Sandbox) {
		return {
			test_api_key: encryptData(apiKey),
			test_webhook_secret: encryptData(webhook.secret as string),
			env,
			defaultCurrency: account.default_currency,
			metadata: {
				org_id: orgId,
				env: env,
			},
		};
	} else {
		return {
			live_api_key: encryptData(apiKey),
			live_webhook_secret: encryptData(webhook.secret as string),
			env,
			defaultCurrency: account.default_currency,
			metadata: {
				org_id: orgId,
				env: env,
			},
		};
	}
};

const connectStripeBody = z.object({
	secret_key: z.string().optional(),
	success_url: z.string().optional(),
	default_currency: z.string().optional(),
});

export const handleConnectStripe = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "connect stripe",

		handler: async (req: any, res: any) => {
			// 1. Get body
			const { secret_key, success_url, default_currency } =
				connectStripeBody.parse(req.body);

			if (!secret_key && !success_url && !default_currency) {
				throw new RecaseError({
					message: "Missing required fields",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			// 2. If secret_key present, but stripe not disconnected, throw an error
			if (secret_key && isStripeConnected({ org: req.org, env: req.env })) {
				throw new RecaseError({
					message:
						"Please disconnect Stripe before connecting a new secret key",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			if (success_url) {
				if (
					!success_url.startsWith("http://") &&
					!success_url.startsWith("https://")
				) {
					throw new RecaseError({
						message: `Success URL should start with http:// or https://, instead got ${success_url}`,
						code: ErrCode.InvalidRequest,
						statusCode: 400,
					});
				}
			}

			const { logger } = req;

			logger.info(`Connecting stripe for org ${req.org.slug}, ENV: ${req.env}`);

			if (!isStripeConnected({ org: req.org, env: req.env }) && !secret_key) {
				throw new RecaseError({
					message: "Please provide your stripe secret key",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			const curOrg = structuredClone(req.org);
			const isSandbox = req.env === AppEnv.Sandbox;
			const curDefaultCurrency = curOrg.default_currency;

			// 1. Reconnect stripe
			let updates: any = {};
			if (secret_key) {
				const result = await connectStripe({
					orgId: req.orgId,
					apiKey: secret_key!,
					env: req.env,
				});

				logger.info(`Created new stripe connection`);

				updates = {
					stripe_config: {
						...curOrg.stripe_config,
					},
					default_currency: nullish(curDefaultCurrency)
						? result.defaultCurrency
						: undefined,
				};

				if (isSandbox) {
					updates.stripe_config.test_api_key = result.test_api_key;
					updates.stripe_config.test_webhook_secret =
						result.test_webhook_secret;
				} else {
					updates.stripe_config.live_api_key = result.live_api_key;
					updates.stripe_config.live_webhook_secret =
						result.live_webhook_secret;
				}
			}

			// 2. If success url present, add it to the updates

			if (success_url !== undefined && success_url !== curOrg.success_url) {
				updates = {
					...updates,
					stripe_config: {
						...curOrg.stripe_config,
						...(updates?.stripe_config || {}),
					},
				};

				if (isSandbox) {
					updates.stripe_config.sandbox_success_url = success_url;
				} else {
					updates.stripe_config.success_url = success_url;
				}

				logger.info(`Updated success URL to ${success_url}`);
			}

			// 3. Default currency
			if (default_currency && default_currency !== curOrg.default_currency) {
				updates = {
					...updates,
					default_currency: default_currency,
				};

				logger.info(`Updated default currency to ${default_currency}`);
			}

			const newOrg = await OrgService.update({
				db: req.db,
				orgId: req.orgId,
				updates: updates,
			});

			// Initialize stripe prices...
			await ensureStripeProductsWithEnv({
				db: req.db,
				logger: req.logger,
				req,
				org: newOrg!,
				env: req.env,
			});

			res.status(200).json({
				message: "Stripe connected",
			});
		},
	});

export const handleGetStripe = async (req: any, res: any) => {
	try {
		const org = await OrgService.getFromReq(req);

		if (!isStripeConnected({ org, env: req.env })) {
			res.status(200).json({});
			return;
		}

		const stripeCli = createStripeCli({ org, env: req.env });
		const account_details = await stripeCli.accounts.retrieve();

		// console.log("Account details: ", account_details);

		res.status(200).json(account_details);
	} catch (error) {
		handleRequestError({ req, error, res, action: "Get invoice" });
	}
};
