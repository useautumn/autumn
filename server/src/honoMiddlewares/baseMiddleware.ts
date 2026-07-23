import {
	ApiVersionClass,
	AppEnv,
	AuthType,
	LATEST_VERSION,
	type Organization,
	tryCatch,
} from "@autumn/shared";
import type { Context, Next } from "hono";
import { db, dbGeneral } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { addRequestToLogs } from "@/utils/logging/addContextToLogs";
import { resolveCustomerId } from "./utils/resolveCustomerId.js";
import { resolveEntityId } from "./utils/resolveEntityId.js";

const SENSITIVE_REQUEST_BODY_KEYS = new Set(["connectionString"]);
const REDACTED_REQUEST_BODY_VALUE = "[REDACTED]";

const parseMockRevenueCatFixtures = (
	raw: string | undefined,
): {
	subscriptions?: unknown[];
	purchases?: unknown[];
	products?: unknown[];
} => {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
};

const redactSensitiveRequestBody = ({ body }: { body: unknown }): unknown => {
	if (!body || typeof body !== "object") return body;

	if (Array.isArray(body)) {
		return body.map((item) => redactSensitiveRequestBody({ body: item }));
	}

	return Object.fromEntries(
		Object.entries(body).map(([key, value]) => [
			key,
			SENSITIVE_REQUEST_BODY_KEYS.has(key)
				? REDACTED_REQUEST_BODY_VALUE
				: redactSensitiveRequestBody({ body: value }),
		]),
	);
};

/**
 * Base middleware that sets up the request context
 * Sets up: db, logger, id, timestamp
 */
export const baseMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	// const env = (c.req.header("app_env") as AppEnv) || AppEnv.Sandbox;
	const id =
		c.req.header("rndr-id") ||
		c.req.header("X-Amzn-Trace-Id") ||
		c.req.header("x-amzn-trace-id") ||
		generateId("local_req");

	const timestamp = Date.now();

	const { data: body } =
		c.req.method !== "GET" && c.req.method !== "HEAD"
			? await tryCatch(c.req.json())
			: { data: undefined };

	const customerId = resolveCustomerId({
		method: c.req.method,
		path: c.req.path,
		body,
		query: c.req.query(),
	});
	const entityId = resolveEntityId({
		method: c.req.method,
		path: c.req.path,
		body,
		query: c.req.query(),
	});

	const childLogger = addRequestToLogs({
		logger,
		requestContext: {
			id,
			method: c.req.method,
			url: c.req.url,
			timestamp,
			customer_id: customerId,
			entity_id: entityId,
			user_agent: c.req.header("user-agent"),
			ip_address: c.req.header("x-forwarded-for"),
			region: process.env.AWS_REGION,
			query: c.req.query(),
			body: redactSensitiveRequestBody({ body }),

			name: `${c.req.method} ${c.req.path}`,
		},
	});

	// Set up the request context
	c.set("ctx", {
		// Core objects
		db,
		dbGeneral,
		logger: childLogger,
		redisV2: resolveRedisV2({ customerId }),

		// Request info
		id,
		timestamp,
		isPublic: false,
		useReplicaDb: false,
		apiVersion: new ApiVersionClass(LATEST_VERSION),

		// Auth (will be populated by auth middleware)
		org: undefined as unknown as Organization,
		features: [],
		userId: undefined,
		customerId,
		entityId,
		requestBody: body,
		authType: AuthType.Unknown,
		env: AppEnv.Sandbox, // maybe use app_env headers
		scopes: [],

		// Query params
		expand: [],
		skipCache:
			c.req.header("x-skip-cache") === "true" ||
			c.req.query("skip_cache") === "true",

		// Test params:
		extraLogs: {},

		testOptions: {
			eventId: c.req.header("x-event-id"),
			skipCacheDeletion: c.req.header("x-skip-cache-deletion") === "true",
			skipWebhooks: c.req.header("x-skip-webhooks") === "true",
			syncCoalesce:
				process.env.NODE_ENV !== "production"
					? c.req.header("x-sync-coalesce") === "true"
						? true
						: c.req.header("x-sync-coalesce") === "false"
							? false
							: undefined
					: undefined,
			keepInternalFields: c.req.header("x-strip-internal") === "false",
			useReplica: c.req.header("x-use-replica") === "true",
			mockVercelApi: c.req.header("x-mock-vercel-api") === "true",
			allowVercelTestOidc:
				process.env.NODE_ENV !== "production" &&
				c.req.header("x-allow-vercel-test-oidc") === "true",
			mockRevenueCat:
				process.env.NODE_ENV !== "production" &&
				c.req.header("x-mock-revenuecat") === "true",
			revenueCat:
				process.env.NODE_ENV !== "production"
					? parseMockRevenueCatFixtures(
							c.req.header("x-mock-revenuecat-fixtures"),
						)
					: {},
		},
	});

	// childLogger.info(`${method} ${path}`);

	await next();
};
