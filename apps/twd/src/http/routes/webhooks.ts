import { Hono } from "hono";
import { handleGithubEvent } from "../../internal/github/actions/handleGithubEvent.ts";
import { verifyGithubSignature } from "../../internal/github/actions/verifyGithubSignature.ts";
import { TwdError } from "../apiError.ts";
import type { TwdHono } from "../types/twdHono.ts";

export const webhooksRoutes = new Hono<TwdHono>().post(
	"/webhooks/github",
	async (c) => {
		const ctx = c.get("ctx");
		const body = await c.req.text();
		verifyGithubSignature({
			ctx,
			body,
			signature: c.req.header("x-hub-signature-256"),
		});
		const event = c.req.header("x-github-event") ?? "";
		if (event === "ping")
			return c.json({ ok: true, handled: false, reason: "ping" });

		let payload: unknown;
		try {
			payload = JSON.parse(body);
		} catch {
			throw new TwdError({
				status: 400,
				code: "invalid_payload",
				message: "GitHub webhook body is not JSON.",
				next: "Set the GitHub webhook content type to application/json.",
				escalate: "a twd admin must fix the webhook config on GitHub.",
			});
		}
		return c.json({
			ok: true,
			...(await handleGithubEvent({ ctx, event, payload })),
		});
	},
);
