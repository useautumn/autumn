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
	const path = c.req.path;
	const method = c.req.method;

	// Validate signature header presence
	if (!signature) {
		console.warn(
			"[vercel/sig] REJECT 401 missing_signature",
			"\n  method:",
			method,
			"\n  path:",
			path,
		);
		logger.warn("Missing X-Vercel-Signature header");
		return c.json({ error: "Unauthorized", code: "missing_signature" }, 401);
	}

	// Get raw body from context (captured by rawBodyMiddleware)
	const rawBody = c.get("rawBody");
	if (!rawBody) {
		console.error(
			"[vercel/sig] REJECT 500 missing_raw_body — captureRawBody middleware did not run before signature middleware",
			"\n  method:",
			method,
			"\n  path:",
			path,
		);
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
		console.error(
			"[vercel/sig] REJECT 500 missing_client_secret",
			"\n  method:",
			method,
			"\n  path:",
			path,
			"\n  env:",
			env,
			"\n  org_id:",
			org?.id,
		);
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
	// (timingSafeEqual throws if buffers differ in length, so guard first)
	const sigBuf = Buffer.from(signature, "utf-8");
	const compBuf = Buffer.from(computedSignature, "utf-8");
	const isValid =
		sigBuf.length === compBuf.length && crypto.timingSafeEqual(sigBuf, compBuf);

	if (!isValid) {
		console.warn(
			"[vercel/sig] REJECT 401 invalid_signature",
			"\n  method:",
			method,
			"\n  path:",
			path,
			"\n  env:",
			env,
			"\n  signature_received:",
			`${signature.slice(0, 12)}...`,
			"\n  signature_computed:",
			`${computedSignature.slice(0, 12)}...`,
			"\n  raw_body_length:",
			rawBodyBuffer.length,
		);
		logger.warn("Webhook signature validation failed", {
			env,
			has_signature: true,
		});
		return c.json({ error: "Unauthorized", code: "invalid_signature" }, 401);
	}

	await next();
};
