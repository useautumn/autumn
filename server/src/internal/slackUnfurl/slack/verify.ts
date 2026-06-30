import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

const FIVE_MINUTES_SECONDS = 60 * 5;

/**
 * Slack request signing: v0 HMAC-SHA256 over `v0:{timestamp}:{rawBody}`,
 * with a 5-minute replay window. MUST run over the raw, unparsed body — so
 * callers pass the exact string they read off the request.
 */
export function verifySlackSignature({
	rawBody,
	timestamp,
	signature,
	nowSeconds,
}: {
	rawBody: string;
	timestamp: string | null;
	signature: string | null;
	nowSeconds: number;
}): boolean {
	if (!(timestamp && signature)) {
		console.warn("[slack-unfurl] verify: missing timestamp/signature header");
		return false;
	}

	// Fail closed: an empty secret would make the HMAC publicly computable.
	if (!env.SLACK_SIGNING_SECRET) {
		console.warn("[slack-unfurl] verify: ALU_SLACK_SIGNING_SECRET unset");
		return false;
	}

	const ts = Number(timestamp);
	if (!Number.isFinite(ts)) {
		console.warn("[slack-unfurl] verify: non-numeric timestamp");
		return false;
	}
	if (Math.abs(nowSeconds - ts) > FIVE_MINUTES_SECONDS) {
		console.warn(
			`[slack-unfurl] verify: stale timestamp (delta=${nowSeconds - ts}s) — check clock`,
		);
		return false;
	}

	const expected = `v0=${createHmac("sha256", env.SLACK_SIGNING_SECRET)
		.update(`v0:${timestamp}:${rawBody}`)
		.digest("hex")}`;

	const a = Buffer.from(expected);
	const b = Buffer.from(signature);
	const ok = a.length === b.length && timingSafeEqual(a, b);
	if (!ok) {
		console.warn(
			`[slack-unfurl] verify: digest mismatch — SLACK_SIGNING_SECRET likely wrong (secret loaded, len=${env.SLACK_SIGNING_SECRET.length})`,
		);
	}
	return ok;
}
