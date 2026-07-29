import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import type { CustomerCardData } from "./data/types.js";
import { verifyCardToken } from "./render/cardToken.js";
import { renderCustomerCardsPng } from "./render/renderCard.js";
import { handleLinkShared, type SlackEventEnvelope } from "./slack/events.js";
import { verifySlackSignature } from "./slack/verify.js";
import { resolveCustomer } from "./tenancy/resolveCustomer.js";

/**
 * Slack-unfurl routes, mounted at `/slack-unfurl` on the main server (initHono).
 * Its own prefix avoids the chat proxy, which already owns `/slack/*` (-> leaf).
 * Slack-facing: auths via the Slack request signature, mounted ahead of the
 * org/auth middleware.
 */
export const slackUnfurlRouter = new Hono<HonoEnv>();

// Public PNG endpoint Slack fetches for the unfurl image block. Token is
// HMAC-signed (only urls we minted resolve) and we re-resolve the customer in
// the signed org+env on every fetch — defence in depth. Cached an hour to match
// the hourly `?v=` bucket on the image url.
slackUnfurlRouter.get("/cards/:file", async (c) => {
	const token = c.req.param("file").replace(/\.png$/, "");
	const claims = verifyCardToken(token);
	if (!claims) return c.text("not found", 404);

	// Resolve every customer in the token (org+env-scoped) concurrently; render
	// whatever resolves as one side-by-side composite.
	const datas = (
		await Promise.all(
			claims.items.map((item) =>
				resolveCustomer(claims.orgId, item.customerId, item.env),
			),
		)
	).filter((data): data is CustomerCardData => data !== null);
	if (datas.length === 0) return c.text("not found", 404);

	const png = await renderCustomerCardsPng(datas);
	const body = new Uint8Array(png.byteLength);
	body.set(png);
	return new Response(body, {
		status: 200,
		headers: {
			"content-type": "image/png",
			"cache-control": "public, max-age=3600",
		},
	});
});

slackUnfurlRouter.post("/events", async (c) => {
	// Read the RAW body first — signature verification depends on the exact bytes.
	const rawBody = await c.req.text();

	let body: SlackEventEnvelope;
	try {
		body = JSON.parse(rawBody);
	} catch {
		return c.text("bad request", 400);
	}

	// URL-verification handshake: echo the challenge BEFORE signature checking.
	// It only reflects Slack's own value (no data, no action), so this is safe —
	// and it lets the request URL verify independent of secret wiring.
	if (body.type === "url_verification") {
		return c.json({ challenge: body.challenge });
	}

	// Real events must be signature-verified.
	const verified = verifySlackSignature({
		rawBody,
		timestamp: c.req.header("x-slack-request-timestamp") ?? null,
		signature: c.req.header("x-slack-signature") ?? null,
		nowSeconds: Math.floor(Date.now() / 1000),
	});
	if (!verified) return c.text("invalid signature", 401);

	// Ack within 3s, then do all fetching/rendering asynchronously.
	if (body.type === "event_callback") {
		void handleLinkShared(body.event).catch((error) => {
			console.error("[slack-unfurl] handleLinkShared failed", error);
		});
	}
	return c.body(null, 200);
});

// Block actions / view submissions land here. Stubbed (no interactive surface
// on the unfurl) — ack so Slack doesn't show an error.
slackUnfurlRouter.post("/interactions", async (c) => {
	const rawBody = await c.req.text();
	const verified = verifySlackSignature({
		rawBody,
		timestamp: c.req.header("x-slack-request-timestamp") ?? null,
		signature: c.req.header("x-slack-signature") ?? null,
		nowSeconds: Math.floor(Date.now() / 1000),
	});
	if (!verified) return c.text("invalid signature", 401);
	return c.body(null, 200);
});
