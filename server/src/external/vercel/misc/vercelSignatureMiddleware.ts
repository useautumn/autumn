import crypto from "node:crypto";
import { AppEnv } from "@autumn/shared";

/**
 * Webhook signature validation middleware for Vercel marketplace webhooks
 *
 * Validates the X-Vercel-Signature header using HMAC-SHA1.
 * This ensures that webhook requests are genuinely from Vercel.
 *
 * Flow:
 * 1. Extract X-Vercel-Signature header
 * 2. Get raw request body from context (captured by rawBodyMiddleware)
 * 3. Get appropriate client_secret based on environment
 * 4. Compute HMAC-SHA1 signature
 * 5. Perform constant-time comparison
 * 6. Reject request if signature doesn't match
 *
 * @see https://vercel.com/docs/integrations/webhooks#securing-webhooks
 */
export const vercelSignatureMiddleware = async (c: any, next: any) => {
	const { org, env, logger } = c.get("ctx");
	const signature = c.req.header("x-vercel-signature");

	// Validate signature header presence
	if (!signature) {
		logger.warn("Missing X-Vercel-Signature header");
		return c.json({ error: "Unauthorized", code: "missing_signature" }, 401);
	}

	// Get raw body from context (captured by rawBodyMiddleware)
	const rawBody = c.get("rawBody");
	if (!rawBody) {
		logger.error("Raw body not found in context");
		return c.json(
			{ error: "Internal Server Error", code: "missing_raw_body" },
			500,
		);
	}

	// Get appropriate client secret based on environment
	const clientSecret =
		env === AppEnv.Live
			? org.processor_configs?.vercel?.client_secret
			: org.processor_configs?.vercel?.sandbox_client_secret;

	if (!clientSecret) {
		logger.error("Vercel client secret not configured", { env });
		return c.json(
			{ error: "Internal Server Error", code: "missing_client_secret" },
			500,
		);
	}

	// Compute HMAC-SHA1 signature
	const rawBodyBuffer = Buffer.from(rawBody, "utf-8");
	const computedSignature = crypto
		.createHmac("sha1", clientSecret)
		.update(rawBodyBuffer)
		.digest("hex");

	// Perform constant-time comparison to prevent timing attacks
	const isValid = crypto.timingSafeEqual(
		Buffer.from(signature, "utf-8"),
		Buffer.from(computedSignature, "utf-8"),
	);

	if (!isValid) {
		logger.warn("Webhook signature validation failed", {
			env,
			has_signature: true,
		});
		return c.json({ error: "Unauthorized", code: "invalid_signature" }, 401);
	}

	logger.debug("Webhook signature validated", { env });

	await next();
};
