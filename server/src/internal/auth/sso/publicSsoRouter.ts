import { getAutumnEnv } from "@autumn/env";
import { Hono } from "hono";
import { z } from "zod/v4";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { auth } from "@/utils/auth.js";
import {
	canStartSso,
	getSsoCompletionCallbackUrl,
	resolveSsoSignIn,
} from "./ssoFacade.js";
import { withTrustedSsoOrigin } from "./ssoTrustedOrigins.js";

const resolveBody = z
	.object({
		email: z.string().email().optional(),
		providerId: z.string().min(1).optional(),
	})
	.refine((body) => body.email || body.providerId);

const copySetCookieHeaders = ({ from, to }: { from: Headers; to: Headers }) => {
	const getSetCookie = (from as Headers & { getSetCookie?: () => string[] })
		.getSetCookie;
	if (getSetCookie) {
		for (const cookie of getSetCookie.call(from))
			to.append("set-cookie", cookie);
		return;
	}
	const cookie = from.get("set-cookie");
	if (cookie) to.append("set-cookie", cookie);
};

export const publicSsoRouter = new Hono<HonoEnv>();

publicSsoRouter.post("/resolve", async (c) => {
	const parsed = resolveBody.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json({ message: "Enter a valid email address" }, 400);
	}
	const { db } = c.get("ctx");
	return c.json(await resolveSsoSignIn({ db, ...parsed.data }));
});

publicSsoRouter.get("/start", async (c) => {
	const providerId = c.req.query("providerId");
	const mode = c.req.query("mode");
	if (!providerId) return c.json({ message: "Provider is required" }, 400);

	const { db } = c.get("ctx");
	const trustedIssuerOrigin = await canStartSso({
		db,
		providerId,
		mode,
		headers: c.req.raw.headers,
	});
	if (!trustedIssuerOrigin) {
		return c.json({ message: "SSO connection is not active" }, 403);
	}

	const requestHeaders = new Headers(c.req.raw.headers);
	requestHeaders.set("content-type", "application/json");
	if (!requestHeaders.has("origin")) {
		requestHeaders.set(
			"origin",
			process.env.CLIENT_URL?.replace(/\/$/, "") ?? "http://localhost:3000",
		);
	}
	requestHeaders.delete("content-length");
	const callbackURL = getSsoCompletionCallbackUrl({ providerId });
	const response = await withTrustedSsoOrigin({
		origin: trustedIssuerOrigin,
		run: () =>
			auth.handler(
				new Request(`${getAutumnEnv().AUTUMN_API_URL}/api/auth/sign-in/sso`, {
					method: "POST",
					headers: requestHeaders,
					body: JSON.stringify({
						providerId,
						callbackURL,
						errorCallbackURL: callbackURL,
						newUserCallbackURL: callbackURL,
					}),
				}),
			),
	});
	const data = (await response
		.clone()
		.json()
		.catch(() => null)) as {
		url?: string;
	} | null;
	if (!response.ok || !data?.url) return response;

	const headers = new Headers({ location: data.url });
	copySetCookieHeaders({ from: response.headers, to: headers });
	return new Response(null, { status: 302, headers });
});
