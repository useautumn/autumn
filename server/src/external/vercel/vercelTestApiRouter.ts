/**
 * Test-only mock of the subset of Vercel's marketplace API that we hit from
 * `processVercelInvoice`. Mounted at `/__test/vercel/api/*` and consumed
 * only by tests that set `ctx.testOptions.mockVercelApi`.
 *
 * Each captured call is pushed into a Redis list keyed by the integration
 * configuration id (`__test:vercel:captures:{installationId}`). Integration
 * tests in another process read that list to assert what the SDK sent.
 *
 * In production this router is not mounted (see `initHono.ts`).
 */
import { Hono } from "hono";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";

export const VERCEL_TEST_CAPTURE_PREFIX = "__test:vercel:captures:";
const CAPTURE_TTL_SECONDS = 600; // 10 min

type CapturedCall = {
	method: string;
	path: string;
	installationId: string;
	body: unknown;
	receivedAt: number;
};

const recordCapture = async (call: CapturedCall) => {
	const redis = resolveRedisV2();
	const key = `${VERCEL_TEST_CAPTURE_PREFIX}${call.installationId}`;
	await redis.rpush(key, JSON.stringify(call));
	await redis.expire(key, CAPTURE_TTL_SECONDS);
};

const parseJsonOrEmpty = async (c: any, route: string) => {
	try {
		return await c.req.json();
	} catch (error) {
		logCaughtError({
			logger: c.get?.("ctx")?.logger,
			message: "[vercel/test-api] Failed to parse request body as JSON",
			error,
			data: { route },
			level: "warn",
		});
		return {};
	}
};

export const vercelTestApiRouter = new Hono<HonoEnv>();

// POST /v1/installations/:integrationConfigurationId/billing
vercelTestApiRouter.post(
	"/v1/installations/:integrationConfigurationId/billing",
	async (c) => {
		const installationId = c.req.param("integrationConfigurationId");
		const body = await parseJsonOrEmpty(c, "submitBillingData");
		await recordCapture({
			method: "POST",
			path: `/v1/installations/${installationId}/billing`,
			installationId,
			body,
			receivedAt: Date.now(),
		});
		// Vercel's submitBillingData returns 201 with an empty body (the SDK
		// matches `M.nil(201, z.void())` — see
		// `node_modules/@vercel/sdk/esm/funcs/marketplaceSubmitBillingData.js`).
		// Returning anything else makes the SDK throw
		// `Unexpected Status or Content-Type`.
		return c.body(null, 201);
	},
);

// POST /v1/installations/:integrationConfigurationId/billing/invoices
vercelTestApiRouter.post(
	"/v1/installations/:integrationConfigurationId/billing/invoices",
	async (c) => {
		const installationId = c.req.param("integrationConfigurationId");
		const body = await parseJsonOrEmpty(c, "submitInvoice");
		const externalId = (body as { externalId?: string })?.externalId;
		await recordCapture({
			method: "POST",
			path: `/v1/installations/${installationId}/billing/invoices`,
			installationId,
			body,
			receivedAt: Date.now(),
		});
		// Vercel's submitInvoice returns the created invoice id + price.
		return c.json(
			{
				invoiceId: `vi_test_${Date.now()}`,
				validationErrors: [],
				totalUsd: (body as { items?: { total: string }[] })?.items
					?.map((item) => Number(item?.total ?? 0))
					.reduce((sum, n) => sum + n, 0)
					.toFixed(2),
				externalId,
			},
			200,
		);
	},
);

// Inspector endpoints used by tests --------------------------------------

// GET /__captures/:installationId → recorded calls in insertion order
vercelTestApiRouter.get("/__captures/:installationId", async (c) => {
	const installationId = c.req.param("installationId");
	const redis = resolveRedisV2();
	const raw = await redis.lrange(
		`${VERCEL_TEST_CAPTURE_PREFIX}${installationId}`,
		0,
		-1,
	);
	const captures = raw.map((entry) => {
		try {
			return JSON.parse(entry) as CapturedCall;
		} catch (error) {
			logCaughtError({
				logger: c.get?.("ctx")?.logger,
				message: "[vercel/test-api] Failed to parse captured call",
				error,
				data: { installationId },
				level: "warn",
			});
			return null;
		}
	});
	return c.json({ captures: captures.filter(Boolean) }, 200);
});

// DELETE /__captures/:installationId → clear (per-test teardown)
vercelTestApiRouter.delete("/__captures/:installationId", async (c) => {
	const installationId = c.req.param("installationId");
	const redis = resolveRedisV2();
	await redis.del(`${VERCEL_TEST_CAPTURE_PREFIX}${installationId}`);
	return c.json({ cleared: true }, 200);
});

// Anything else → 404 with a clear message so the SDK error surfaces
// instead of silently passing.
vercelTestApiRouter.all("*", (c) => {
	return c.json(
		{
			error: "vercel_test_api_route_not_implemented",
			method: c.req.method,
			path: c.req.path,
		},
		404,
	);
});
