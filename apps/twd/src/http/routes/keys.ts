import { Hono } from "hono";
import { z } from "zod";
import { enqueueFullNukeKey } from "../../internal/keys/actions/enqueueFullNukeKey.ts";
import { enqueueReinitKeys } from "../../internal/keys/actions/enqueueReinitKeys.ts";
import { getKeysOverview } from "../../internal/keys/actions/getKeysOverview.ts";
import { syncKeysFromEnv } from "../../internal/keys/actions/syncKeysFromEnv.ts";
import { TwdError } from "../apiError.ts";
import type { TwdHono } from "../types/twdHono.ts";

const TargetPerKeyBody = z.object({
	targetPerKey: z.number().int().min(0).max(200).optional(),
});

const parseTargetPerKeyBody = ({ raw }: { raw: string }) => {
	let body: unknown;
	try {
		body = raw ? JSON.parse(raw) : {};
	} catch {
		body = null;
	}
	const parsed = TargetPerKeyBody.safeParse(body);
	if (parsed.success) return parsed.data;
	throw new TwdError({
		status: 400,
		code: "invalid_body",
		message: parsed.error.message,
		next: "Send {} or { targetPerKey: <0-200> }.",
	});
};

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
		const body = parseTargetPerKeyBody({ raw: await c.req.text() });
		return c.json(
			await enqueueReinitKeys({
				ctx: c.get("ctx"),
				targetPerKey: body.targetPerKey,
			}),
			202,
		);
	})
	.post("/keys/:platformAccountId/full-nuke", async (c) => {
		const body = parseTargetPerKeyBody({ raw: await c.req.text() });
		return c.json(
			await enqueueFullNukeKey({
				ctx: c.get("ctx"),
				platformAccountId: c.req.param("platformAccountId"),
				targetPerKey: body.targetPerKey,
			}),
			202,
		);
	});
