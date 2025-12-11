import {
	AppEnv,
	ErrCode,
	type FrontendOrg,
	type Organization,
	type OrgConfig,
	organizations,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import {
	orgToAccountId,
	shouldUseMaster,
} from "@server/external/connect/connectUtils.js";
import { createStripeCli } from "@server/external/connect/createStripeCli.js";
import { CacheManager } from "@server/utils/cacheUtils/CacheManager.js";
import {
	decryptData,
	generatePublishableKey,
} from "@server/utils/encryptUtils.js";
import RecaseError from "@server/utils/errorUtils.js";
import { notNullish } from "@server/utils/genUtils.js";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { FeatureService } from "../features/FeatureService.js";
import { getRevenueCatConfigDisplay } from "./handlers/handleRevenueCatConfig.js";
import { getVercelConfigDisplay } from "./handlers/handleVercelConfig.js";
import { OrgService } from "./OrgService.js";
import { clearOrgCache } from "./orgUtils/clearOrgCache.js";
import { toSuccessUrl } from "./orgUtils/convertOrgUtils.js";

export const shouldReconnectStripe = async ({
	org,
	env,
	logger,
	stripeKey,
}: {
	org: Organization;
	env: AppEnv;
	logger: any;
	stripeKey: string;
}) => {
	if (!isStripeConnected({ org, env })) return true;

	try {
		const stripeCli = createStripeCli({ org, env });
		const newKey = new Stripe(stripeKey);

		const oldAccount = await stripeCli.accounts.retrieve();
		const newAccount = await newKey.accounts.retrieve();

		return oldAccount.id !== newAccount.id;
	} catch (error) {
		logger.error("Error checking if stripe should be reconnected", { error });
		return true;
	}
};

export const isStripeConnected = ({
	org,
	env,
	throughSecretKey = false,
	throughAccountId = false,
	excludeDefault = false,
}: {
	org: Organization;
	env?: AppEnv;
	throughSecretKey?: boolean;
	throughAccountId?: boolean;
	excludeDefault?: boolean;
}) => {
	const testAccountId = orgToAccountId({
		org,
		env: AppEnv.Sandbox,
		noDefaultAccount: excludeDefault,
	});

	const liveAccountId = orgToAccountId({
		org,
		env: AppEnv.Live,
		noDefaultAccount: excludeDefault,
	});

	if (env === AppEnv.Sandbox) {
		if (throughAccountId) {
			return notNullish(testAccountId);
		}

		if (throughSecretKey) {
			return notNullish(org.stripe_config?.test_api_key);
		}

		return (
			notNullish(org.stripe_config?.test_api_key) || notNullish(testAccountId)
		);
	} else if (env === AppEnv.Live) {
		if (throughAccountId) {
			return notNullish(liveAccountId);
		}

		if (throughSecretKey) {
			return notNullish(org.stripe_config?.live_api_key);
		}

		return (
			notNullish(org.stripe_config?.live_api_key) || notNullish(liveAccountId)
		);
	} else {
		return (
			notNullish(org.stripe_config?.test_api_key) &&
			notNullish(org.stripe_config?.live_api_key)
		);
	}
};

export const constructOrg = ({ id, slug }: { id: string; slug: string }) => {
	return {
		id,
		slug,
		created_at: Date.now(),
		default_currency: "usd",
		stripe_connected: false,
		stripe_config: null,
		test_pkey: generatePublishableKey(AppEnv.Sandbox),
		live_pkey: generatePublishableKey(AppEnv.Live),
		svix_config: {
			sandbox_app_id: "",
			live_app_id: "",
		},
		config: {} as any,
	};
};

export const deleteStripeWebhook = async ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}) => {
	if (!isStripeConnected({ org, env, throughSecretKey: true })) return;

	const stripeCli = createStripeCli({ org, env, throughSecretKey: true });
	const webhookEndpoints = await stripeCli.webhookEndpoints.list({
		limit: 100,
	});

	for (const webhook of webhookEndpoints.data) {
		if (webhook.url.includes(org.id) && webhook.url.includes(env)) {
			try {
				await stripeCli.webhookEndpoints.del(webhook.id);
				console.log(`Deleted stripe webhook (${env}) ${webhook.url}`);
			} catch (error: any) {
				console.log(`Failed to delete stripe webhook (${env}) ${webhook.url}`);
				console.log(error.message);
			}
		}
	}
};

export const getStripeWebhookSecret = (org: Organization, env: AppEnv) => {
	const webhookSecret =
		env === AppEnv.Sandbox
			? org.stripe_config?.test_webhook_secret
			: org.stripe_config?.live_webhook_secret;

	if (!webhookSecret) {
		throw new RecaseError({
			code: ErrCode.StripeConfigNotFound,
			message: `Stripe webhook secret not found for org ${org.id}`,
			statusCode: 400,
		});
	}

	return decryptData(webhookSecret);
};

export const initDefaultConfig = () => {
	return {
		free_trial_paid_to_paid: false,

		// 1. Upgrade prorates immediately
		bill_upgrade_immediately: true,

		// 2. Convert invoice to charge automatically
		convert_to_charge_automatically: false,
	};
};

export const createOrgResponse = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}): FrontendOrg => {
	const accountId = orgToAccountId({ org, env, noDefaultAccount: true });
	const secretKeyConnected = isStripeConnected({
		org,
		env,
		throughSecretKey: true,
	});

	const vercelConnection = getVercelConfigDisplay({ org, env });
	const revenueCatConnection = getRevenueCatConfigDisplay({ org, env });

	const stripeConnection = secretKeyConnected
		? "secret_key"
		: accountId
			? "oauth"
			: "default";

	const throughMaster = shouldUseMaster({ org, env });
	return {
		id: org.id,
		name: org.name,
		logo: org.logo,
		slug: org.slug,
		master: org.master
			? {
					id: org.master.id,
					name: org.master.name,
					slug: org.master.slug,
				}
			: null,
		// sandbox_config: {
		//   stripe_connected: isStripeConnected({ org, env: AppEnv.Sandbox }),
		//   default_currency: org.default_currency || "USD",
		//   return_url: org.sandbox_config?.return_url || "",
		// },
		// production_config: {
		//   stripe_connected: isStripeConnected({ org, env: AppEnv.Live }),
		//   default_currency: org.default_currency || "USD",
		//   return_url: org.production_config?.return_url || "",
		// },

		success_url: toSuccessUrl({ org, env }) || "",
		default_currency: org.default_currency || "usd",
		stripe_connection: stripeConnection,
		through_master: throughMaster,
		processor_configs: {
			vercel: {
				connected: vercelConnection.connected,
				client_integration_id: vercelConnection.client_integration_id,
				client_secret: vercelConnection.client_secret,
				webhook_url: vercelConnection.webhook_url,
				custom_payment_method: vercelConnection.custom_payment_method,
				marketplace_mode: vercelConnection.marketplace_mode,
			},
			revenuecat: {
				connected: revenueCatConnection.connected,
				api_key: revenueCatConnection.api_key,
				sandbox_api_key: revenueCatConnection.sandbox_api_key,
				webhook_secret: revenueCatConnection.webhook_secret,
				sandbox_webhook_secret: revenueCatConnection.sandbox_webhook_secret,
			},
		},

		created_at: new Date(org.createdAt).getTime(),
		test_pkey: org.test_pkey,
		live_pkey: org.live_pkey,
		onboarded: org.onboarded ?? true,
		deployed: org.deployed ?? true,
	};
};

export const getOrgAndFeatures = async ({ req }: { req: any }) => {
	const [org, features] = await Promise.all([
		OrgService.getFromReq(req),
		FeatureService.getFromReq(req),
	]);

	return { org, features };
};

export const updateOrgConfig = async ({
	db,
	org,
	config,
	disconnectCache = true,
}: {
	db: DrizzleCli;
	org: Organization;
	config: Partial<OrgConfig>;
	disconnectCache?: boolean;
}) => {
	await db
		.update(organizations)
		.set({
			config: {
				...org.config,
				...config,
			},
		})
		.where(eq(organizations.id, org.id));

	await clearOrgCache({
		db,
		orgId: org.id,
	});

	if (disconnectCache) {
		await CacheManager.disconnect();
	}
};

export const unsetOrgStripeKeys = async ({
	org,
	env,
	db,
}: {
	org: Organization;
	env: AppEnv;
	db: DrizzleCli;
}) => {
	const newStripeConfig: any = structuredClone(org.stripe_config) || {};
	if (env === AppEnv.Sandbox) {
		newStripeConfig.test_api_key = null;
		newStripeConfig.test_webhook_secret = null;
	} else {
		newStripeConfig.live_api_key = null;
		newStripeConfig.live_webhook_secret = null;
	}

	await OrgService.update({
		db,
		orgId: org.id,
		updates: {
			stripe_config: newStripeConfig,
		},
	});
};

export const orgToCurrency = ({ org }: { org: Organization }) => {
	return org.default_currency || "usd";
};
