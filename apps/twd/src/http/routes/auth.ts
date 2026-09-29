import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { z } from "zod";
import { CreateApiKeyBody } from "../../api/contract.ts";
import {
	createApiKey,
	listApiKeys,
	revokeApiKey,
} from "../../internal/auth/actions/apiKeys.ts";
import { SESSION_COOKIE } from "../../internal/auth/actions/authenticateRequest.ts";
import { getMe } from "../../internal/auth/actions/getMe.ts";
import {
	completeGoogleSignIn,
	startGoogleSignIn,
} from "../../internal/auth/actions/googleSignIn.ts";
import { safeRedirect } from "../../internal/auth/actions/safeRedirect.ts";
import {
	deleteSession,
	SESSION_TTL_MS,
} from "../../internal/auth/repos/sessionsRepo.ts";
import { TwdError } from "../apiError.ts";
import type { TwdHono } from "../types/twdHono.ts";

const OAUTH_COOKIE = "twd_oauth";
const OAuthCookie = z.object({
	state: z.string(),
	verifier: z.string(),
	redirect: z.string(),
});

const cookieSecure = (publicUrl: string) => publicUrl.startsWith("https://");

const restartSignIn = (publicUrl: string) =>
	new TwdError({
		status: 400,
		code: "oauth_state_mismatch",
		message: "The sign-in attempt expired or was started in another browser.",
		next: `Start again at ${publicUrl}/auth/google.`,
	});

export const authRoutes = new Hono<TwdHono>()
	.get("/auth/google", async (c) => {
		const ctx = c.get("ctx");
		const { url, state, verifier } = await startGoogleSignIn({ ctx });
		const redirect = safeRedirect({ ctx, target: c.req.query("redirect") });
		await setSignedCookie(
			c,
			OAUTH_COOKIE,
			JSON.stringify({ state, verifier, redirect }),
			ctx.env.TWD_SESSION_SECRET,
			{
				httpOnly: true,
				secure: cookieSecure(ctx.env.TWD_PUBLIC_URL),
				sameSite: "Lax",
				path: "/auth/google",
				maxAge: 600,
			},
		);
		return c.redirect(url);
	})
	.get("/auth/google/callback", async (c) => {
		const ctx = c.get("ctx");
		const publicUrl = ctx.env.TWD_PUBLIC_URL;
		const googleError = c.req.query("error");
		if (googleError)
			throw new TwdError({
				status: 400,
				code: "oauth_denied",
				message: `Google sign-in was not completed (${googleError}).`,
				next: `Start again at ${publicUrl}/auth/google.`,
			});

		const raw = await getSignedCookie(
			c,
			ctx.env.TWD_SESSION_SECRET,
			OAUTH_COOKIE,
		);
		deleteCookie(c, OAUTH_COOKIE, { path: "/auth/google" });
		const saved = OAuthCookie.safeParse(raw ? JSON.parse(raw) : undefined);
		const code = c.req.query("code");
		if (!saved.success || !code || c.req.query("state") !== saved.data.state)
			throw restartSignIn(publicUrl);

		const { session } = await completeGoogleSignIn({
			ctx,
			code,
			verifier: saved.data.verifier,
		});
		await setSignedCookie(
			c,
			SESSION_COOKIE,
			session.id,
			ctx.env.TWD_SESSION_SECRET,
			{
				httpOnly: true,
				secure: cookieSecure(publicUrl),
				sameSite: "Lax",
				path: "/",
				maxAge: Math.floor(SESSION_TTL_MS / 1000),
			},
		);
		return c.redirect(saved.data.redirect);
	})
	.post("/auth/logout", async (c) => {
		const ctx = c.get("ctx");
		const sessionId = await getSignedCookie(
			c,
			ctx.env.TWD_SESSION_SECRET,
			SESSION_COOKIE,
		);
		if (sessionId) await deleteSession({ ctx, sessionId });
		deleteCookie(c, SESSION_COOKIE, { path: "/" });
		return c.json({ ok: true });
	});

/** Signed-in account routes; API-only (never mounted at the root). */
export const accountRoutes = new Hono<TwdHono>()
	.get("/me", async (c) => c.json(await getMe({ ctx: c.get("ctx") })))
	.get("/api-keys", async (c) =>
		c.json(await listApiKeys({ ctx: c.get("ctx") })),
	)
	.post("/api-keys", async (c) => {
		const body = CreateApiKeyBody.safeParse(
			await c.req.json().catch(() => undefined),
		);
		if (!body.success)
			throw new TwdError({
				status: 400,
				code: "invalid_body",
				message: body.error.message,
				next: 'Send JSON like {"name": "my-laptop"} (1–80 chars).',
			});
		return c.json(
			await createApiKey({ ctx: c.get("ctx"), name: body.data.name }),
			201,
		);
	})
	.delete("/api-keys/:id", async (c) =>
		c.json(await revokeApiKey({ ctx: c.get("ctx"), id: c.req.param("id") })),
	);
