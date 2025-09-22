import { withOrgAuth } from "@/middleware/authMiddleware.js";
import { AppEnv } from "@autumn/shared";
import { Router } from "express";
import { ApiKeyService } from "./ApiKeyService.js";
import { OrgService } from "../orgs/OrgService.js";
import { createKey } from "./api-keys/apiKeyUtils.js";
import { getSvixDashboardUrl } from "@/external/svix/svixHelpers.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import { CacheManager } from "@/external/caching/CacheManager.js";
import { CacheType } from "@/external/caching/cacheActions.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";
import Stripe from "stripe";
import {
	checkKeyValid,
	createWebhookEndpoint,
} from "@/external/stripe/stripeOnboardingUtils.js";
import { clearOrgCache } from "../orgs/orgUtils/clearOrgCache.js";
import * as crypto from "crypto";
import { isStripeConnected } from "../orgs/orgUtils.js";

export const devRouter: Router = Router();

devRouter.get("/data", withOrgAuth, async (req: any, res) => {
	try {
		const { db, env, orgId } = req;
		const apiKeys = await ApiKeyService.getByOrg({
			db,
			orgId,
			env,
		});

		const org = await OrgService.getFromReq(req);
		const dashboardUrl = await getSvixDashboardUrl({
			env: req.env,
			org: org,
		});

		res.status(200).json({
			api_keys: apiKeys,
			org,
			svix_dashboard_url: dashboardUrl,
		});
	} catch (error) {
		handleRequestError({ error, req, res, action: "Get /dev/data" });
	}
});

devRouter.post("/api_key", withOrgAuth, async (req: any, res) =>
	routeHandler({
		req,
		res,
		action: "Create API key",
		handler: async (req: any, res: any) => {
			const { db, env, orgId } = req;
			const { name } = req.body;

			// 1. Create API key
			let prefix = "am_sk_test";
			if (env === AppEnv.Live) {
				prefix = "am_sk_live";
			}
			const apiKey = await createKey({
				db,
				env,
				name,
				orgId,
				userId: req.user?.id,
				prefix,
				meta: {},
			});

			res.status(200).json({
				api_key: apiKey,
			});
		},
	}),
);

devRouter.delete("/api_key/:id", withOrgAuth, async (req: any, res) => {
	try {
		const { db, orgId } = req;
		const { id } = req.params;

		let data = await ApiKeyService.delete({
			db,
			id,
			orgId,
		});

		if (data.length === 0) {
			console.error("API key not found");
			res.status(404).json({ error: "API key not found" });
			return;
		}

		let batchInvalidate = [];
		for (let apiKey of data) {
			batchInvalidate.push(
				CacheManager.invalidate({
					action: CacheType.SecretKey,
					value: apiKey.hashed_key!,
				}),
			);
		}
		await Promise.all(batchInvalidate);

		res
			.status(200)
			.json({ message: "API key deleted", code: "api_key_deleted" });
	} catch (error) {
		console.error("Failed to delete API key", error);
		res.status(500).json({ error: "Failed to delete API key" });
		return;
	}
});

const generateOtp = (): string => {
	// Use Web Crypto API if available for cryptographically-secure randomness
	const getRandomInt = (): number => {
		if (
			typeof crypto !== "undefined" &&
			typeof crypto.getRandomValues === "function"
		) {
			const array = new Uint32Array(1);
			crypto.getRandomValues(array);
			return array[0];
		}

		// Node.js (SSR / tests) – use crypto module's webcrypto if available
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const { webcrypto } = require("crypto");
			if (webcrypto?.getRandomValues) {
				const arr = new Uint32Array(1);
				webcrypto.getRandomValues(arr);
				return arr[0];
			}
		} catch (_) {
			/* ignore */
		}

		// Fallback (non-cryptographic)
		return Math.floor(Math.random() * 0xffffffff);
	};

	// Limit to range [100000, 999999]
	const randomSixDigits = (getRandomInt() % 900000) + 100000;
	return randomSixDigits.toString();
};

const OTP_TTL = 300;

export const handleCreateOtp = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "Create OTP",
		handler: async () => {
			const { orgId, env, db } = req;

			// Check if there's already an OTP to use
			const maybeCacheKey = `orgOTPExists:${orgId}`;
			const maybeCacheData = await CacheManager.getJson(maybeCacheKey);
			if (maybeCacheData) {
				res.status(200).json({
					otp: maybeCacheData,
				});
				return;
			}

			// Generate OTP
			const otp = generateOtp();

			const cacheData = {
				otp: otp,
				orgId: orgId,
			};

			const cacheKey = `otp:${otp}`;
			await CacheManager.setJson(cacheKey, cacheData, OTP_TTL);

			const orgCacheKey = `orgOTPExists:${orgId}`;
			await CacheManager.setJson(orgCacheKey, otp, OTP_TTL);

			res.status(200).json({
				otp,
			});
		},
	});

devRouter.post("/otp", withOrgAuth, handleCreateOtp);

export const generateRandomKey = (lengthInBytes: number = 32): string => {
	if (lengthInBytes <= 0) {
		throw new Error("Key length must be a positive number.");
	}
	return crypto.randomBytes(lengthInBytes).toString("hex");
};

export const handleGetOtp = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "Get OTP",
		handler: async () => {
			const { db, env } = req;
			const { otp } = req.params;
			const cacheKey = `otp:${otp}`;
			const cacheData = await CacheManager.getJson(cacheKey);
			if (!cacheData) {
				res.status(404).json({ error: "OTP not found" });
				return;
			}

			// Generate API key for the OTP
			const sandboxKey = await createKey({
				db,
				env: AppEnv.Sandbox,
				name: `Autumn Key CLI`,
				orgId: cacheData.orgId,
				prefix: "am_sk_test",
				meta: {
					fromCli: true,
					generatedAt: new Date().toISOString(),
				},
				userId: req.user?.id,
			});

			const prodKey = await createKey({
				db,
				env: AppEnv.Live,
				name: `Autumn Key CLI`,
				orgId: cacheData.orgId,
				prefix: "am_sk_live",
				meta: {
					fromCli: true,
					generatedAt: new Date().toISOString(),
				},
				userId: req.user?.id,
			});

			let org = await OrgService.get({
				db: req.db,
				orgId: cacheData.orgId,
			});

			let stripeConnected = isStripeConnected({ org, env: AppEnv.Sandbox });

			let responseData = {
				...cacheData,
				stripe_connected: stripeConnected,
				sandboxKey,
				prodKey,
			};

			await CacheManager.invalidate({
				action: "otp",
				value: otp,
			});
			await CacheManager.invalidate({
				action: "orgOTPExists",
				value: cacheData.orgId,
			});

			if (!stripeConnected) {
				// we need to generate a key for the CLI to use.
				let key = generateRandomKey();
				responseData.stripeFlowAuthKey = key;
				let stripeCacheData = {
					orgId: cacheData.orgId,
				};
				await CacheManager.setJson(key, stripeCacheData, OTP_TTL);
			}

			res.status(200).json(responseData);
		},
	});

devRouter.post("/cli/stripe", async (req: any, res: any) => {
	routeHandler({
		req,
		res,
		action: "Get Stripe Flow Auth Key",
		handler: async () => {
			const { db, logtail: logger } = req;
			const key = req.headers["authorization"];
			if (!key) {
				res.status(401).json({ message: "Unauthorized" });
				return;
			}

			const cacheData = await CacheManager.getJson(key);
			if (!cacheData) {
				res.status(404).json({ message: "Key not found" });
				return;
			}

			const { orgId } = cacheData;
			const { stripeTestKey, stripeLiveKey } = req.body;

			await clearOrgCache({
				db,
				orgId,
				logger,
			});

			await checkKeyValid(stripeTestKey);
			await checkKeyValid(stripeLiveKey);

			let testWebhook: Stripe.WebhookEndpoint;
			let liveWebhook: Stripe.WebhookEndpoint;

			try {
				testWebhook = await createWebhookEndpoint(
					stripeTestKey,
					AppEnv.Sandbox,
					orgId,
				);

				liveWebhook = await createWebhookEndpoint(
					stripeLiveKey,
					AppEnv.Live,
					orgId,
				);
			} catch (error) {
				console.log(error);
				res.status(500).json({ message: "Error creating stripe webhook" });
				return;
			}

			await OrgService.update({
				db,
				orgId: orgId,
				updates: {
					stripe_connected: true,
					default_currency: "usd",
					stripe_config: {
						test_api_key: encryptData(stripeTestKey),
						live_api_key: encryptData(stripeLiveKey),
						test_webhook_secret: encryptData(testWebhook.secret as string),
						live_webhook_secret: encryptData(liveWebhook.secret as string),
						// success_url: "https://useautumn.com",
					},
				},
			});

			let redisClient = await CacheManager.getClient();
			if (!redisClient) {
				res.status(500).json({ message: "Cache client not initialized" });
				return;
			}

			await redisClient.del(key);

			res.status(200).json({
				message: "Stripe keys updated",
			});
		},
	});
});

devRouter.get("/otp/:otp", handleGetOtp);
