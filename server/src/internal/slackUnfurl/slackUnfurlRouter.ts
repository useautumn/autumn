import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import type { CustomerCardData } from "./data/types.js";
import { verifyCardToken } from "./render/cardToken.js";
import { renderCustomerCardsPng } from "./render/renderCard.js";
import { handleLinkShared, type SlackEventEnvelope } from "./slack/events.js";
import { verifySlackSignature } from "./slack/verify.js";
import { resolveCustomer } from "./tenancy/resolveCustomer.js";

export const slackUnfurlRouter = new Hono<HonoEnv>();

slackUnfurlRouter.get("/cards/:file", async (c) => {
	const token = c.req.param("file").replace(/\.png$/, "");
	const claims = verifyCardToken(token);
	if (!claims) return c.text("not found", 404);

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
	const rawBody = await c.req.text();

	let body: SlackEventEnvelope;
	try {
		body = JSON.parse(rawBody);
	} catch {
		return c.text("bad request", 400);
	}

	if (body.type === "url_verification") {
		return c.json({ challenge: body.challenge });
	}

	const verified = verifySlackSignature({
		rawBody,
		timestamp: c.req.header("x-slack-request-timestamp") ?? null,
		signature: c.req.header("x-slack-signature") ?? null,
		nowSeconds: Math.floor(Date.now() / 1000),
	});
	if (!verified) return c.text("invalid signature", 401);

	if (body.type === "event_callback") {
		void handleLinkShared(body.event).catch((error) => {
			console.error("[slack-unfurl] handleLinkShared failed", error);
		});
	}
	return c.body(null, 200);
});

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
