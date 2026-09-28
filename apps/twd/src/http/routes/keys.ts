import { Hono } from "hono";
import { z } from "zod";
import { enqueueReinitKeys } from "../../internal/keys/actions/enqueueReinitKeys.ts";
import { getKeysOverview } from "../../internal/keys/actions/getKeysOverview.ts";
import { syncKeysFromEnv } from "../../internal/keys/actions/syncKeysFromEnv.ts";
import { TwdError } from "../apiError.ts";
import type { TwdHono } from "../types/twdHono.ts";

const ReinitKeysBody = z.object({
	targetPerKey: z.number().int().min(0).max(200).optional(),
});

export const keysRoutes = new Hono<TwdHono>()
	.get("/keys", async (c) =>
		c.json(await getKeysOverview({ ctx: c.get("ctx") })),
	)
	.post("/keys/probe", async (c) => {
		const ctx = c.get("ctx");
		await syncKeysFromEnv({ ctx });
		return c.json(await getKeysOverview({ ctx }));
	})
	.post("/keys/reinit", async (c) => {
		const raw = await c.req.text();
		let body: unknown;
		try {
			body = raw ? JSON.parse(raw) : {};
		} catch {
			body = null;
		}
		const parsed = ReinitKeysBody.safeParse(body);
		if (!parsed.success) {
			throw new TwdError({
				status: 400,
				code: "invalid_body",
				message: parsed.error.message,
				next: "Send {} or { targetPerKey: <0-200> }.",
			});
		}
		return c.json(
			await enqueueReinitKeys({
				ctx: c.get("ctx"),
				targetPerKey: parsed.data.targetPerKey,
			}),
			202,
		);
	});
