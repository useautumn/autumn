import * as crypto from "node:crypto";
import { AppEnv } from "@autumn/shared";
import { Router } from "express";
import { Hono } from "hono";
import type Stripe from "stripe";
import {
	checkKeyValid,
	createWebhookEndpoint,
} from "@/external/stripe/stripeOnboardingUtils.js";
import { withOrgAuth } from "@/middleware/authMiddleware.js";
import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { redis } from "../../external/redis/initRedis.js";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { OrgService } from "../orgs/OrgService.js";
import { clearOrgCache } from "../orgs/orgUtils/clearOrgCache.js";
import { handleCreateSecretKey } from "./handlers/handleCreateSecretKey.js";
import { handleDeleteSecretKey } from "./handlers/handleDeleteSecretKey.js";
import { handleGetDevData } from "./handlers/handleGetDevData.js";

export const devRouter: Router = Router();

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
			const { orgId } = req;

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
			throw new Error("OTP Auth has been deprecated for atmn. Please upgrade to the latest version of the CLI.");
		}
		// handler: async () => {
		// 	const { db, env } = req;
		// 	const { otp } = req.params;
		// 	const cacheKey = `otp:${otp}`;
		// 	const cacheData = await CacheManager.getJson<{
		// 		orgId: string;
		// 		stripeFlowAuthKey: string;
		// 	}>(cacheKey);
		// 	if (!cacheData) {
		// 		res.status(404).json({ error: "OTP not found" });
		// 		return;
		// 	}

		// 	// Generate API key for the OTP
		// 	const sandboxKey = await createKey({
		// 		db,
		// 		env: AppEnv.Sandbox,
		// 		name: `Autumn Key CLI`,
		// 		orgId: cacheData.orgId,
		// 		prefix: ApiKeyPrefix.Sandbox,
		// 		meta: {
		// 			fromCli: true,
		// 			generatedAt: new Date().toISOString(),
		// 		},
		// 		userId: req.user?.id,
		// 	});

		// 	const prodKey = await createKey({
		// 		db,
		// 		env: AppEnv.Live,
		// 		name: `Autumn Key CLI`,
		// 		orgId: cacheData.orgId,
		// 		prefix: ApiKeyPrefix.Live,
		// 		meta: {
		// 			fromCli: true,
		// 			generatedAt: new Date().toISOString(),
		// 		},
		// 		userId: req.user?.id,
		// 	});

		// 	const org = await OrgService.get({
		// 		db: req.db,
		// 		orgId: cacheData.orgId,
		// 	});

		// 	const stripeConnected = isStripeConnected({ org, env: AppEnv.Sandbox });

		// 	const responseData = {
		// 		...cacheData,
		// 		stripe_connected: stripeConnected,
		// 		sandboxKey,
		// 		prodKey,
		// 	};

		// 	await CacheManager.invalidate({
		// 		action: "otp",
		// 		value: otp,
		// 	});
		// 	await CacheManager.invalidate({
		// 		action: "orgOTPExists",
		// 		value: cacheData.orgId,
		// 	});

		// 	if (!stripeConnected) {
		// 		// we need to generate a key for the CLI to use.
		// 		const key = generateRandomKey();
		// 		responseData.stripeFlowAuthKey = key;
		// 		const stripeCacheData = {
		// 			orgId: cacheData.orgId,
		// 		};
		// 		await CacheManager.setJson(key, stripeCacheData, OTP_TTL);
		// 	}

		// 	res.status(200).json(responseData);
		// },
	});

devRouter.post("/cli/stripe", async (req: any, res: any) => {
	routeHandler({
		req,
		res,
		action: "Get Stripe Flow Auth Key",
		handler: async () => {
			const { db, logger } = req;
			const key = req.headers["authorization"];
			if (!key) {
				res.status(401).json({ message: "Unauthorized" });
				return;
			}

			const cacheData = await CacheManager.getJson<{ orgId: string }>(key);
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

			await redis.del(key);

			res.status(200).json({
				message: "Stripe keys updated",
			});
		},
	});
});

devRouter.get("/otp/:otp", handleGetOtp);

export const internalDevRouter = new Hono<HonoEnv>();
internalDevRouter.get("/data", ...handleGetDevData);
internalDevRouter.post("/api_key", ...handleCreateSecretKey);
internalDevRouter.delete("/api_key/:key_id", ...handleDeleteSecretKey);
