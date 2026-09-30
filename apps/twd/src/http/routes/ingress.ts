import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { forwardConnectEvent } from "../../internal/ingress/actions/forwardConnectEvent.ts";
import {
	getIngressRoute,
	ingressRouteCount,
	setIngressRoute,
} from "../../internal/ingress/actions/ingressRoutes.ts";
import { getTwdEnv } from "../../lib/env.ts";
import { getLogger } from "../../lib/logger.ts";
import { TwdError } from "../apiError.ts";
import type { TwdHono } from "../types/twdHono.ts";

const tokenMatches = ({
	given,
	expected,
}: {
	given: string;
	expected: string;
}) => {
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
};

type MapWrite = {
	accountId?: string;
	workerUrl?: string;
	workerAccountId?: string;
	map?: Record<string, string>;
};

/** Public (no session auth): map writes use TWD_INGRESS_TOKEN, connect events come from Stripe. */
export const ingressRoutes = new Hono<TwdHono>()
	.post("/ingress/map", async (c) => {
		const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
		const given = bearer ?? c.req.header("x-ingress-token") ?? "";
		if (!tokenMatches({ given, expected: getTwdEnv().TWD_INGRESS_TOKEN })) {
			throw new TwdError({
				status: 401,
				code: "invalid_ingress_token",
				message: "Missing or wrong ingress token.",
				next: "Send Authorization: Bearer <TWD_INGRESS_TOKEN>.",
				escalate:
					"Only twd-launched workers hold the ingress token; ask a twd admin.",
			});
		}
		const payload = (await c.req.json().catch(() => null)) as MapWrite | null;
		if (!payload || typeof payload !== "object") {
			throw new TwdError({
				status: 400,
				code: "invalid_body",
				message: "Body must be JSON.",
				next: "Send { accountId, workerUrl } and/or { map: { acct_…: url } }.",
			});
		}
		const { accountId, workerUrl, workerAccountId, map } = payload;
		if (accountId && workerAccountId) {
			const ownerUrl = getIngressRoute({ accountId: workerAccountId });
			if (!ownerUrl) {
				throw new TwdError({
					status: 400,
					code: "worker_not_registered",
					message: "worker account is not registered",
					next: "Map the worker's own account first ({ accountId, workerUrl }).",
				});
			}
			const existing = getIngressRoute({ accountId });
			if (existing && existing !== ownerUrl) {
				throw new TwdError({
					status: 409,
					code: "account_owned_elsewhere",
					message: "account already belongs to another worker",
					next: "Use a fresh sub-organization account.",
				});
			}
			setIngressRoute({ accountId, workerUrl: ownerUrl });
			return c.json({ size: ingressRouteCount() });
		}
		if (accountId && workerUrl) setIngressRoute({ accountId, workerUrl });
		if (map && typeof map === "object") {
			for (const [account, url] of Object.entries(map)) {
				setIngressRoute({ accountId: account, workerUrl: url });
			}
		}
		return c.json({ size: ingressRouteCount() });
	})
	.post("/ingress/connect/:env", async (c) => {
		const status = await forwardConnectEvent({
			rawBody: await c.req.text(),
			headers: c.req.raw.headers,
			env: c.req.param("env"),
			logger: getLogger(),
		});
		return c.text(
			status < 300 ? "ok" : "webhook delivery failed",
			status as ContentfulStatusCode,
		);
	});
