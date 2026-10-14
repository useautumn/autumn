import { Hono } from "hono";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";

export const VERCEL_TEST_CAPTURE_PREFIX = "__test:vercel:captures:";
export const VERCEL_TEST_REFUND_TOTAL_PREFIX = "__test:vercel:refundTotal:";
const CAPTURE_TTL_SECONDS = 600;

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
		// `node_modules/@vercel/sdk/esm/funcs/marketplaceSubmitBillingData.js`).
		return c.body(null, 201);
	},
);

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

vercelTestApiRouter.get(
	"/v1/installations/:integrationConfigurationId/billing/invoices/:invoiceId",
	async (c) => {
		const installationId = c.req.param("integrationConfigurationId");
		const invoiceId = c.req.param("invoiceId");
		await recordCapture({
			method: "GET",
			path: `/v1/installations/${installationId}/billing/invoices/${invoiceId}`,
			installationId,
			body: null,
			receivedAt: Date.now(),
		});
		if (invoiceId.startsWith("vi_flaky_")) {
			return c.json({ error: { code: "internal", message: "flaky" } }, 503);
		}
		const refundTotal = await resolveRedisV2().get(
			`${VERCEL_TEST_REFUND_TOTAL_PREFIX}${invoiceId}`,
		);
		const now = new Date().toISOString();
		return c.json(
			{
				test: true,
				invoiceId,
				state: refundTotal ? "refunded" : "paid",
				invoiceDate: now,
				period: { start: now, end: now },
				items: [],
				total: "0.00",
				created: now,
				updated: now,
				...(refundTotal ? { refundTotal: Number(refundTotal).toFixed(2) } : {}),
			},
			200,
		);
	},
);

vercelTestApiRouter.post(
	"/v1/installations/:integrationConfigurationId/billing/invoices/:invoiceId/actions",
	async (c) => {
		const installationId = c.req.param("integrationConfigurationId");
		const invoiceId = c.req.param("invoiceId");
		const body = await parseJsonOrEmpty(c, "updateInvoice");
		await recordCapture({
			method: "POST",
			path: `/v1/installations/${installationId}/billing/invoices/${invoiceId}/actions`,
			installationId,
			body,
			receivedAt: Date.now(),
		});
		if (invoiceId.startsWith("vi_reject_")) {
			return c.json(
				{ error: { code: "bad_request", message: "rejected" } },
				409,
			);
		}
		const total = Number((body as { total?: string })?.total);
		if (Number.isFinite(total) && total > 0) {
			const redis = resolveRedisV2();
			const key = `${VERCEL_TEST_REFUND_TOTAL_PREFIX}${invoiceId}`;
			await redis.incrbyfloat(key, total);
			await redis.expire(key, CAPTURE_TTL_SECONDS);
		}
		return c.body(null, 204);
	},
);

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

vercelTestApiRouter.delete("/__captures/:installationId", async (c) => {
	const installationId = c.req.param("installationId");
	const redis = resolveRedisV2();
	await redis.del(`${VERCEL_TEST_CAPTURE_PREFIX}${installationId}`);
	return c.json({ cleared: true }, 200);
});

vercelTestApiRouter.delete("/__refund-total/:invoiceId", async (c) => {
	const invoiceId = c.req.param("invoiceId");
	await resolveRedisV2().del(`${VERCEL_TEST_REFUND_TOTAL_PREFIX}${invoiceId}`);
	return c.json({ cleared: true }, 200);
});

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
