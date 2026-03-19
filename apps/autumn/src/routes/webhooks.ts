import type { Context } from "hono";
import { Hono } from "hono";
import { bot } from "@/bot";
import { getRedis } from "@/lib/redis";
import { isRedisUnavailable } from "@/lib/slack";

type Platform = keyof typeof bot.webhooks;

export const webhookRoutes = new Hono();

let redisHealthCache: { ok: boolean; expiresAt: number } | null = null;
let lastRedisWarningAt = 0;

async function isRedisAvailable(): Promise<boolean> {
	const now = Date.now();
	if (redisHealthCache && redisHealthCache.expiresAt > now) {
		return redisHealthCache.ok;
	}

	let ok = false;
	try {
		ok = (await getRedis().ping()) === "PONG";
	} catch {
		ok = false;
	}

	redisHealthCache = {
		ok,
		expiresAt: now + (ok ? 5000 : 1500),
	};

	return ok;
}

function redisUnavailableResponse(c: Context) {
	return c.json(
		{
			response_type: "ephemeral",
			text: "Autumn is temporarily unavailable because Redis is offline, so please retry in a minute.",
		},
		200,
	);
}

webhookRoutes.post("/:platform", async (c) => {
	const platform = c.req.param("platform") as Platform;

	if (!(await isRedisAvailable())) {
		if (Date.now() - lastRedisWarningAt > 10_000) {
			lastRedisWarningAt = Date.now();
			console.warn("Redis is offline; returning graceful Slack response.");
		}
		return redisUnavailableResponse(c);
	}

	const handler = bot.webhooks[platform];
	if (!handler) {
		return c.text(`Unknown platform: ${platform}`, 404);
	}

	try {
		return await handler(c.req.raw, {
			waitUntil: (task) => {
				task.catch(console.error);
			},
		});
	} catch (err) {
		console.error("Webhook handler error:", err);

		if (isRedisUnavailable(err)) {
			return redisUnavailableResponse(c);
		}

		return c.text("ok", 200);
	}
});
