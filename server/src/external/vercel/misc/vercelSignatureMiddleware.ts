import crypto from "node:crypto";
import { AppEnv } from "@autumn/shared";

export const vercelSignatureMiddleware = async (c: any, next: any) => {
	const { org, env, logger } = c.get("ctx");
	const signature = c.req.header("x-vercel-signature");
	const path = c.req.path;
	const method = c.req.method;

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

	const rawBodyBuffer = Buffer.from(rawBody, "utf-8");
	const computedSignature = crypto
		.createHmac("sha1", clientSecret)
		.update(rawBodyBuffer)
		.digest("hex");

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
